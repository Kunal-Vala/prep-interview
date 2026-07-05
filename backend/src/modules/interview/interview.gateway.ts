import {
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UseGuards } from '@nestjs/common';
import { WsJwtGuard } from '../../common/guards/ws-jwt.guard';
import { AiService } from '../ai/ai.service';
import { WhisperService } from '../ai/whisper/whisper.service';
import { PrismaService } from '@/prisma/prisma.service';
import { FeedbackProducer } from '../queue/producers/feedback.producer';
import {
  SessionStatus,
  QuestionCategory,
  FeedbackStatus,
} from '@prisma/client';
import {
  buildEvaluatorPrompt,
  parseEvaluatorResponse,
} from '../ai/prompts/evaluator.prompt';

interface AuthenticatedSocket extends Socket {
  data: {
    userId: string;
    email: string;
  };
}

/** Maps clientId -> accumulated audio buffers for the current question */
const audioBufferMap = new Map<string, Buffer[]>();

/** Maps clientId -> { sessionId, userId, startedAt } */
const activeSessionMap = new Map<
  string,
  { sessionId: string; userId: string; startedAt: Date }
>();

@WebSocketGateway({ namespace: '/interview' })
export class InterviewGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(InterviewGateway.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
    private readonly whisperService: WhisperService,
    private readonly feedbackProducer: FeedbackProducer,
  ) {}

  handleConnection(client: Socket) {
    this.logger.log(`Client Connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    audioBufferMap.delete(client.id);
    activeSessionMap.delete(client.id);
  }

  // ──────────────────────────────────────────────────────────────────
  // JOIN SESSION — Validate ownership, generate first AI question
  // ──────────────────────────────────────────────────────────────────
  @UseGuards(WsJwtGuard)
  @SubscribeMessage('join-session')
  async handleJoinSession(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { sessionId: string },
  ) {
    const userId = client.data.userId;
    this.logger.log(`User ${userId} joining session ${data.sessionId}`);

    try {
      // 1. Validate session exists and belongs to user
      const session = await this.prisma.interviewSession.findUnique({
        where: { id: data.sessionId },
        include: { questions: { orderBy: { sequenceNumber: 'asc' } } },
      });

      if (!session || session.userId !== userId) {
        client.emit('ws-error', {
          code: 'INVALID_SESSION',
          message: 'Session not found or access denied',
          recoverable: false,
        });
        return;
      }

      // 2. Join the socket room
      await client.join(data.sessionId);

      // 3. Track active session
      activeSessionMap.set(client.id, {
        sessionId: data.sessionId,
        userId,
        startedAt: new Date(),
      });
      audioBufferMap.set(client.id, []);

      // 4. Update session status to IN_PROGRESS
      await this.prisma.interviewSession.update({
        where: { id: data.sessionId },
        data: { status: SessionStatus.IN_PROGRESS, startedAt: new Date() },
      });

      // 5. If session already has questions (reconnecting), send history and the last one
      if (session.questions.length > 0) {
        const history = session.questions.flatMap((q) => {
          const msgs: { role: 'interviewer' | 'candidate'; content: string }[] =
            [{ role: 'interviewer', content: q.questionText }];
          if (q.userAnswer) {
            msgs.push({ role: 'candidate', content: q.userAnswer });
          }
          return msgs;
        });
        client.emit('session-history', { history });

        const lastQ = session.questions[session.questions.length - 1];

        // Check if the last question is already answered
        if (lastQ.userAnswer !== null) {
          this.logger.log(
            `Re-generating next question for session ${data.sessionId} since last question was already answered.`,
          );
          await this.streamAIResponse(
            client,
            data.sessionId,
            lastQ.id,
            lastQ.userAnswer,
          );
          return;
        }

        client.emit('next-question', {
          sessionId: data.sessionId,
          questionId: lastQ.id,
          sequenceNumber: lastQ.sequenceNumber,
          category: lastQ.category,
          questionText: lastQ.questionText,
        });
        return;
      }

      // 6. Generate first AI question
      await this.generateAndEmitQuestion(
        client,
        data.sessionId,
        session.targetRole,
        session.difficulty,
        1,
      );
    } catch (error) {
      this.logger.error('join-session error:', error);
      client.emit('ws-error', {
        code: 'JOIN_FAILED',
        message: 'Failed to join session',
        recoverable: true,
      });
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // AUDIO CHUNK — Accumulate audio buffers for Whisper transcription
  // ──────────────────────────────────────────────────────────────────
  @UseGuards(WsJwtGuard)
  @SubscribeMessage('audio-chunk')
  handleAudioChunk(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody()
    data: { sessionId: string; chunk: ArrayBuffer; sequenceId: number },
  ) {
    const buffers = audioBufferMap.get(client.id);
    if (buffers) {
      buffers.push(Buffer.from(data.chunk));
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // SPEECH ENDED — Transcribe audio, save answer, stream AI follow-up
  // ──────────────────────────────────────────────────────────────────
  @UseGuards(WsJwtGuard)
  @SubscribeMessage('speech-ended')
  async handleSpeechEnded(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody()
    data: { sessionId: string; questionId: string; totalChunks: number },
  ) {
    const sessionInfo = activeSessionMap.get(client.id);
    if (!sessionInfo) return;

    const startMs = Date.now();

    try {
      // 1. Concatenate audio buffers
      const buffers = audioBufferMap.get(client.id) || [];
      const combinedAudio = Buffer.concat(buffers);
      audioBufferMap.set(client.id, []); // Reset for next question

      if (combinedAudio.length < 100) {
        client.emit('ws-error', {
          code: 'AUDIO_TOO_SHORT',
          message: 'Audio recording was too short. Please try again.',
          recoverable: true,
        });
        return;
      }

      // 2. Transcribe via Whisper
      const transcript = await this.whisperService.transcribe(combinedAudio);
      const processingMs = Date.now() - startMs;

      // 3. Emit transcription to client
      client.emit('transcription-ready', {
        sessionId: data.sessionId,
        questionId: data.questionId,
        transcript,
        confidence: 0.95,
        processingMs,
      });

      // 4. Save user answer to DB
      await this.prisma.interviewQuestion.update({
        where: { id: data.questionId },
        data: {
          userAnswer: transcript,
          answeredAt: new Date(),
          answerDuration: Math.round(processingMs / 1000),
        },
      });

      // 5. Stream AI follow-up / next question
      await this.streamAIResponse(
        client,
        data.sessionId,
        data.questionId,
        transcript,
      );
    } catch (error) {
      this.logger.error('speech-ended processing error:', error);
      client.emit('ws-error', {
        code: 'TRANSCRIPTION_FAILED',
        message: 'Failed to process your audio. Please try again.',
        recoverable: true,
      });
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // USER MESSAGE — Text mode: save answer, stream AI follow-up
  // ──────────────────────────────────────────────────────────────────
  @UseGuards(WsJwtGuard)
  @SubscribeMessage('user-message')
  async handleUserMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { sessionId: string; content: string },
  ) {
    const sessionInfo = activeSessionMap.get(client.id);
    if (!sessionInfo) return;

    try {
      // 1. Find the latest unanswered question
      const currentQuestion = await this.prisma.interviewQuestion.findFirst({
        where: {
          sessionId: data.sessionId,
          userAnswer: null,
        },
        orderBy: { sequenceNumber: 'desc' },
      });

      if (!currentQuestion) {
        // If all questions are answered, just stream a follow-up
        await this.streamAIResponse(client, data.sessionId, null, data.content);
        return;
      }

      // 2. Save user answer
      await this.prisma.interviewQuestion.update({
        where: { id: currentQuestion.id },
        data: {
          userAnswer: data.content,
          answeredAt: new Date(),
        },
      });

      // 3. Stream AI follow-up / next question
      await this.streamAIResponse(
        client,
        data.sessionId,
        currentQuestion.id,
        data.content,
      );
    } catch (error) {
      this.logger.error('user-message error:', error);
      client.emit('ws-error', {
        code: 'MESSAGE_FAILED',
        message: 'Failed to process your message.',
        recoverable: true,
      });
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // SESSION END — Mark complete, enqueue feedback, notify client
  // ──────────────────────────────────────────────────────────────────
  @UseGuards(WsJwtGuard)
  @SubscribeMessage('session-end')
  async handleSessionEnd(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { sessionId: string; reason: string },
  ) {
    const sessionInfo = activeSessionMap.get(client.id);
    if (!sessionInfo) return;

    try {
      const startedAt = sessionInfo.startedAt;
      const durationSeconds = Math.round(
        (Date.now() - startedAt.getTime()) / 1000,
      );

      // 1. Get question count
      const questionCount = await this.prisma.interviewQuestion.count({
        where: { sessionId: data.sessionId },
      });

      // 2. Update session status to PROCESSING
      await this.prisma.interviewSession.update({
        where: { id: data.sessionId },
        data: {
          status: SessionStatus.PROCESSING,
          endedAt: new Date(),
          durationSeconds,
        },
      });

      // 3. Enqueue feedback job
      let feedbackJobId = 'no-redis';
      try {
        const job = await this.feedbackProducer.enqueueFeedbackJob({
          sessionId: data.sessionId,
          userId: sessionInfo.userId,
        });
        feedbackJobId = job.id ?? 'unknown';
        this.logger.log(
          `Feedback job ${feedbackJobId} enqueued for session ${data.sessionId}`,
        );
      } catch (queueError) {
        this.logger.warn(
          'Redis/BullMQ not available — generating feedback synchronously.',
          queueError,
        );
        try {
          await this.generateFeedbackSynchronously(data.sessionId);
        } catch (syncError) {
          this.logger.error(
            `Synchronous feedback generation failed for session ${data.sessionId}:`,
            syncError,
          );
        }
        // Mark the session as completed
        await this.prisma.interviewSession.update({
          where: { id: data.sessionId },
          data: { status: SessionStatus.COMPLETED },
        });
      }

      // 4. Emit session closed to client
      client.emit('session-closed', {
        sessionId: data.sessionId,
        feedbackJobId,
        summary: {
          totalQuestions: questionCount,
          durationSeconds,
        },
      });

      // 5. Cleanup
      audioBufferMap.delete(client.id);
      activeSessionMap.delete(client.id);
    } catch (error) {
      this.logger.error('session-end error:', error);
      client.emit('ws-error', {
        code: 'SESSION_END_FAILED',
        message: 'Failed to end session properly.',
        recoverable: false,
      });
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // PRIVATE HELPERS
  // ──────────────────────────────────────────────────────────────────

  /**
   * Builds conversation history from DB, streams an AI response,
   * and saves the next question to the database.
   */
  private async streamAIResponse(
    client: AuthenticatedSocket,
    sessionId: string,
    questionId: string | null,
    userAnswer: string,
  ) {
    // 1. Get session info for context
    const session = await this.prisma.interviewSession.findUnique({
      where: { id: sessionId },
      include: {
        questions: {
          orderBy: { sequenceNumber: 'asc' },
          select: {
            id: true,
            questionText: true,
            userAnswer: true,
            category: true,
            parentQuestionId: true,
          },
        },
      },
    });

    if (!session) return;

    // 2. Build conversation history for LLM
    const majorQuestions = session.questions.filter(
      (q) => q.parentQuestionId === null,
    );
    const isWrapUp = majorQuestions.length >= session.questionCount;

    const systemPromptContent = isWrapUp
      ? `You are an expert technical interviewer conducting a mock interview for a "${session.targetRole}" position. The interview is complete as the candidate has answered all questions. Do not ask any more questions. Thank the candidate for their time, provide a brief wrap-up, and say goodbye. Keep it to 2-3 sentences. Do not break character. Optional: you can start your response with "[FOLLOW_UP]".`
      : `You are an expert technical interviewer conducting a mock interview for a "${session.targetRole}" position at difficulty level ${session.difficulty}/5.
Ask one question at a time. Be concise (2-3 sentences max). Do not break character.

You MUST start every response you generate with one of these two exact tags (no formatting, just the text at the very beginning of the response):
- "[NEW_TOPIC]" if you are starting a completely new major interview question on a different topic.
- "[FOLLOW_UP]" if you are repeating the question, clarifying it, or asking a counter-question/follow-up on the current topic.

Guidelines for managing the conversation:
1. Cover a balanced mix of different question categories (Technical, System Design, Coding, Behavioral, Situational).
2. If the candidate's response is a greeting, is off-topic, is extremely brief (e.g. "I don't know", "hello"), or fails to address the question properly, use "[FOLLOW_UP]" to politely prompt them again, repeat, or clarify the question.
3. If the candidate gives a partial or high-level answer, use "[FOLLOW_UP]" to ask a relevant counter-question to explore their reasoning deeper.
4. You can ask up to 2 follow-ups/counter-questions (i.e. up to 2 "[FOLLOW_UP]" queries) per major topic.
5. Once a topic has been sufficiently explored (or after 2 follow-ups), transition to a completely new major topic and start your response with "[NEW_TOPIC]".`;

    const messages: {
      role: 'system' | 'user' | 'assistant';
      content: string;
    }[] = [
      {
        role: 'system',
        content: systemPromptContent,
      },
    ];

    // Add existing conversation history
    for (const q of session.questions) {
      messages.push({ role: 'assistant', content: q.questionText });
      if (q.userAnswer) {
        messages.push({ role: 'user', content: q.userAnswer });
      }
    }

    // If we have the latest user answer that wasn't saved yet in the query above
    if (userAnswer && messages[messages.length - 1]?.role !== 'user') {
      messages.push({ role: 'user', content: userAnswer });
    }

    // 3. Determine next question number
    const nextSeq = (session.questions.length || 0) + 1;
    const streamId = `stream-${sessionId}-${nextSeq}`;

    // 4. Stream AI response and intercept tags
    let tagParsed = false;
    let tag: 'NEW_TOPIC' | 'FOLLOW_UP' = 'NEW_TOPIC';
    let bufferedText = '';

    const fullText = await this.aiService.streamInterviewerResponse(
      messages,
      (token: string) => {
        if (!tagParsed) {
          bufferedText += token;
          if (bufferedText.includes(']')) {
            const closingIdx = bufferedText.indexOf(']');
            const possibleTag = bufferedText.substring(0, closingIdx + 1);
            if (possibleTag.includes('FOLLOW_UP')) {
              tag = 'FOLLOW_UP';
            } else {
              tag = 'NEW_TOPIC';
            }
            tagParsed = true;
            const rest = bufferedText.substring(closingIdx + 1).trimStart();
            if (rest) {
              client.emit('ai-response-stream', {
                sessionId,
                delta: rest,
                streamId,
              });
            }
          } else if (bufferedText.length > 20) {
            tagParsed = true;
            client.emit('ai-response-stream', {
              sessionId,
              delta: bufferedText,
              streamId,
            });
          }
        } else {
          client.emit('ai-response-stream', {
            sessionId,
            delta: token,
            streamId,
          });
        }
      },
    );

    if (!tagParsed) {
      if (fullText.includes('[FOLLOW_UP]')) {
        tag = 'FOLLOW_UP';
      } else {
        tag = 'NEW_TOPIC';
      }
    }

    const cleanedText = fullText
      .replace('[FOLLOW_UP]', '')
      .replace('[NEW_TOPIC]', '')
      .trim();

    if (isWrapUp) {
      client.emit('ai-response-end', {
        sessionId,
        streamId,
        fullText: cleanedText,
        role: 'closing' as const,
      });

      client.emit('next-question', {
        sessionId,
        sequenceNumber: nextSeq,
        category: QuestionCategory.SITUATIONAL,
        questionText: cleanedText,
        isWrapUp: true,
      });
      return;
    }

    // 5. Determine question category based on content
    const category = this.inferCategory(cleanedText);

    // Get parentQuestionId if follow-up
    let parentQuestionId: string | null = null;
    if (tag === 'FOLLOW_UP') {
      const lastMajor = session.questions
        .filter((q) => q.parentQuestionId === null)
        .pop();
      if (lastMajor) {
        parentQuestionId = lastMajor.id;
      }
    }

    // 6. Save the new question to DB
    let newQuestion;
    try {
      newQuestion = await this.prisma.interviewQuestion.create({
        data: {
          sessionId,
          sequenceNumber: nextSeq,
          category,
          questionText: cleanedText,
          parentQuestionId,
          askedAt: new Date(),
        },
      });
    } catch (dbError: unknown) {
      const prismaError = dbError as { code?: string };
      if (prismaError && prismaError.code === 'P2002') {
        this.logger.warn(
          `Question already exists for sessionId: ${sessionId}, sequenceNumber: ${nextSeq}. Reusing existing.`,
        );
        newQuestion = await this.prisma.interviewQuestion.findUniqueOrThrow({
          where: {
            sessionId_sequenceNumber: {
              sessionId,
              sequenceNumber: nextSeq,
            },
          },
        });
      } else {
        throw dbError;
      }
    }

    // 7. Emit stream end
    client.emit('ai-response-end', {
      sessionId,
      streamId,
      fullText: cleanedText,
      role: 'next-question' as const,
    });

    // 8. Emit next question event
    client.emit('next-question', {
      sessionId,
      questionId: newQuestion.id,
      sequenceNumber: nextSeq,
      category,
      questionText: cleanedText,
    });
  }

  /**
   * Generates the first question for a session and emits it to the client.
   */
  private async generateAndEmitQuestion(
    client: AuthenticatedSocket,
    sessionId: string,
    targetRole: string,
    difficulty: number,
    sequenceNumber: number,
  ) {
    const messages: {
      role: 'system' | 'user' | 'assistant';
      content: string;
    }[] = [
      {
        role: 'system',
        content: `You are an expert technical interviewer conducting a mock interview for a "${targetRole}" position at difficulty level ${difficulty}/5.
Start your response with the tag "[NEW_TOPIC]".
Start the interview with a warm but professional greeting (1 sentence) and then ask your first interview question. Be concise — 2-3 sentences total. Do not break character.`,
      },
      {
        role: 'user',
        content: 'Please begin the interview.',
      },
    ];

    const streamId = `stream-${sessionId}-${sequenceNumber}`;

    let tagParsed = false;
    let bufferedText = '';

    const fullText = await this.aiService.streamInterviewerResponse(
      messages,
      (token: string) => {
        if (!tagParsed) {
          bufferedText += token;
          if (bufferedText.includes(']')) {
            tagParsed = true;
            const closingIdx = bufferedText.indexOf(']');
            const rest = bufferedText.substring(closingIdx + 1).trimStart();
            if (rest) {
              client.emit('ai-response-stream', {
                sessionId,
                delta: rest,
                streamId,
              });
            }
          } else if (bufferedText.length > 20) {
            tagParsed = true;
            client.emit('ai-response-stream', {
              sessionId,
              delta: bufferedText,
              streamId,
            });
          }
        } else {
          client.emit('ai-response-stream', {
            sessionId,
            delta: token,
            streamId,
          });
        }
      },
    );

    const cleanedText = fullText
      .replace('[FOLLOW_UP]', '')
      .replace('[NEW_TOPIC]', '')
      .trim();

    // Save question to DB
    let question;
    try {
      question = await this.prisma.interviewQuestion.create({
        data: {
          sessionId,
          sequenceNumber,
          category: QuestionCategory.BEHAVIORAL,
          questionText: cleanedText,
          askedAt: new Date(),
        },
      });
    } catch (dbError: unknown) {
      const prismaError = dbError as { code?: string };
      if (prismaError && prismaError.code === 'P2002') {
        this.logger.warn(
          `Question already exists for sessionId: ${sessionId}, sequenceNumber: ${sequenceNumber}. Reusing existing.`,
        );
        question = await this.prisma.interviewQuestion.findUniqueOrThrow({
          where: {
            sessionId_sequenceNumber: {
              sessionId,
              sequenceNumber,
            },
          },
        });
      } else {
        throw dbError;
      }
    }

    client.emit('ai-response-end', {
      sessionId,
      streamId,
      fullText: cleanedText,
      role: 'next-question' as const,
    });

    client.emit('next-question', {
      sessionId,
      questionId: question.id,
      sequenceNumber,
      category: QuestionCategory.BEHAVIORAL,
      questionText: cleanedText,
    });
  }

  /**
   * Simple category inference from question text content.
   */
  private inferCategory(text: string): QuestionCategory {
    const lower = text.toLowerCase();
    if (
      lower.includes('system design') ||
      lower.includes('architecture') ||
      lower.includes('scalab')
    ) {
      return QuestionCategory.SYSTEM_DESIGN;
    }
    if (
      lower.includes('code') ||
      lower.includes('algorithm') ||
      lower.includes('implement') ||
      lower.includes('function')
    ) {
      return QuestionCategory.CODING;
    }
    if (
      lower.includes('technical') ||
      lower.includes('explain how') ||
      lower.includes('difference between')
    ) {
      return QuestionCategory.TECHNICAL;
    }
    if (
      lower.includes('tell me about a time') ||
      lower.includes('describe a situation') ||
      lower.includes('challenge')
    ) {
      return QuestionCategory.BEHAVIORAL;
    }
    if (
      lower.includes('culture') ||
      lower.includes('team') ||
      lower.includes('values')
    ) {
      return QuestionCategory.CULTURE_FIT;
    }
    return QuestionCategory.TECHNICAL;
  }

  /**
   * Evaluates the mock interview and generates the feedback report synchronously.
   */
  private async generateFeedbackSynchronously(sessionId: string) {
    this.logger.log(
      `[Sync Feedback] Starting evaluation for session ${sessionId}`,
    );

    await this.prisma.feedbackReport.upsert({
      where: { sessionId },
      create: {
        sessionId,
        status: FeedbackStatus.PROCESSING,
        processingStartedAt: new Date(),
      },
      update: {
        status: FeedbackStatus.PROCESSING,
        processingStartedAt: new Date(),
      },
    });

    try {
      const session = await this.prisma.interviewSession.findFirstOrThrow({
        where: { id: sessionId },
        include: {
          questions: { orderBy: { sequenceNumber: 'asc' } },
        },
      });

      const transcript = session.questions.flatMap((q) => [
        {
          role: 'interviewer' as const,
          content: q.questionText,
          questionCategory: q.category,
          timestamp: q.askedAt.toISOString(),
        },
        ...(q.userAnswer
          ? [
              {
                role: 'candidate' as const,
                content: q.userAnswer,
                timestamp:
                  q.answeredAt?.toISOString() ?? q.askedAt.toISOString(),
              },
            ]
          : []),
      ]);

      const prompt = buildEvaluatorPrompt({
        targetRole: session.targetRole,
        difficulty: session.difficulty,
        transcript,
        sessionDurationSeconds: session.durationSeconds ?? 0,
      });

      const rawResponse = await this.aiService.generateEvaluation(prompt);
      const evaluation = parseEvaluatorResponse(rawResponse);

      await this.prisma.feedbackReport.update({
        where: { sessionId },
        data: {
          status: FeedbackStatus.COMPLETED,
          overallScore: evaluation.overallScore,
          technicalScore: evaluation.technicalScore,
          communicationScore: evaluation.communicationScore,
          pacingScore: evaluation.pacingScore,
          codeQualityScore: evaluation.codeQualityScore,
          behavioralScore: evaluation.behavioralScore,
          strengths: evaluation.strengths,
          improvements: evaluation.improvements,
          questionFeedback: evaluation.questionFeedback,
          rawLlmResponse: evaluation.rawLlmResponse,
          processingEndedAt: new Date(),
        },
      });

      this.logger.log(
        `[Sync Feedback] Successfully graded session ${sessionId}. Score: ${evaluation.overallScore}`,
      );
    } catch (error) {
      this.logger.error(
        `[Sync Feedback] Evaluation failed for session ${sessionId}:`,
        error,
      );
      await this.prisma.feedbackReport.update({
        where: { sessionId },
        data: {
          status: FeedbackStatus.FAILED,
          errorMessage:
            error instanceof Error ? error.message : 'Unknown error',
          processingEndedAt: new Date(),
        },
      });
      throw error;
    }
  }
}
