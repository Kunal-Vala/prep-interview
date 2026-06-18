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

      // 5. If session already has questions (reconnecting), send the last one
      if (session.questions.length > 0) {
        const lastQ = session.questions[session.questions.length - 1];
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
          select: { questionText: true, userAnswer: true, category: true },
        },
      },
    });

    if (!session) return;

    // 2. Build conversation history for LLM
    const messages: {
      role: 'system' | 'user' | 'assistant';
      content: string;
    }[] = [
      {
        role: 'system',
        content: `You are an expert technical interviewer conducting a mock interview for a "${session.targetRole}" position at difficulty level ${session.difficulty}/5. Ask one question at a time. Be concise (2-3 sentences max). Mix behavioral and technical questions. After the candidate answers, briefly acknowledge their response and ask the next question. Do not break character.`,
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

    // 4. Stream AI response
    const fullText = await this.aiService.streamInterviewerResponse(
      messages,
      (token: string) => {
        client.emit('ai-response-stream', {
          sessionId,
          delta: token,
          streamId,
        });
      },
    );

    // 5. Determine question category based on content
    const category = this.inferCategory(fullText);

    // 6. Save the new question to DB
    let newQuestion;
    try {
      newQuestion = await this.prisma.interviewQuestion.create({
        data: {
          sessionId,
          sequenceNumber: nextSeq,
          category,
          questionText: fullText,
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
      fullText,
      role: 'next-question' as const,
    });

    // 8. Emit next question event
    client.emit('next-question', {
      sessionId,
      questionId: newQuestion.id,
      sequenceNumber: nextSeq,
      category,
      questionText: fullText,
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
        content: `You are an expert technical interviewer conducting a mock interview for a "${targetRole}" position at difficulty level ${difficulty}/5. Start the interview with a warm but professional greeting (1 sentence) and then ask your first interview question. Be concise — 2-3 sentences total. Do not break character.`,
      },
      {
        role: 'user',
        content: 'Please begin the interview.',
      },
    ];

    const streamId = `stream-${sessionId}-${sequenceNumber}`;

    const fullText = await this.aiService.streamInterviewerResponse(
      messages,
      (token: string) => {
        client.emit('ai-response-stream', {
          sessionId,
          delta: token,
          streamId,
        });
      },
    );

    // Save question to DB
    let question;
    try {
      question = await this.prisma.interviewQuestion.create({
        data: {
          sessionId,
          sequenceNumber,
          category: QuestionCategory.BEHAVIORAL,
          questionText: fullText,
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
      fullText,
      role: 'next-question' as const,
    });

    client.emit('next-question', {
      sessionId,
      questionId: question.id,
      sequenceNumber,
      category: QuestionCategory.BEHAVIORAL,
      questionText: fullText,
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
