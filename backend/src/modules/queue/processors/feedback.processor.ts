import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { AiService } from '@/modules/ai/ai.service';
import { FeedbackStatus } from '@prisma/client';
import {
  buildEvaluatorPrompt,
  parseEvaluatorResponse,
  TranscriptMessage,
} from '@/modules/ai/prompts/evaluator.prompt';
import { FEEDBACK_QUEUE } from '../queue.constants';

export interface FeedbackJobData {
  sessionId: string;
  userId: string;
}

@Processor(FEEDBACK_QUEUE)
export class FeedbackProcessor extends WorkerHost {
  private readonly logger = new Logger(FeedbackProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
  ) {
    super();
  }

  async process(job: Job<FeedbackJobData>): Promise<void> {
    const { sessionId } = job.data;
    this.logger.log(`Processing feedback for session ${sessionId}`);

    // 1. Mark as processing
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
      // 2. fetch full session with questions
      const session = await this.prisma.interviewSession.findFirstOrThrow({
        where: { id: sessionId },
        include: {
          questions: { orderBy: { sequenceNumber: 'asc' } },
        },
      });

      // 3. build transcript array

      // Only include questions that have been answered by the candidate
      const answeredQuestions = session.questions.filter(
        (q) => q.userAnswer !== null,
      );

      const majors = answeredQuestions.filter((q) => !q.parentQuestionId);

      const transcript: TranscriptMessage[] = majors.flatMap((mq) => {
        const followUps = answeredQuestions.filter(
          (q) => q.parentQuestionId === mq.id,
        );

        const turns: TranscriptMessage[] = [
          {
            role: 'interviewer' as const,
            content: mq.questionText,
            questionCategory: mq.category,
            timestamp: mq.askedAt.toISOString(),
          },
          {
            role: 'candidate' as const,
            content: mq.userAnswer!,
            timestamp: mq.answeredAt?.toISOString() ?? mq.askedAt.toISOString(),
          },
        ];

        for (const f of followUps) {
          turns.push(
            {
              role: 'interviewer' as const,
              content: f.questionText,
              questionCategory: 'FOLLOW_UP',
              timestamp: f.askedAt.toISOString(),
            },
            {
              role: 'candidate' as const,
              content: f.userAnswer!,
              timestamp: f.answeredAt?.toISOString() ?? f.askedAt.toISOString(),
            },
          );
        }

        return turns;
      });

      // 4. Build evaluator prompt
      const prompt = buildEvaluatorPrompt({
        targetRole: session.targetRole,
        difficulty: session.difficulty,
        transcript,
        sessionDurationSeconds: session.durationSeconds ?? 0,
      });

      // 5. Call LLM (non-streaming , structured output)
      const rawResponse = await this.aiService.generateEvaluation(prompt);

      // 6. Parse and validate response

      const evaluation = parseEvaluatorResponse(rawResponse);

      // 7. write to DB
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
        `Feedback complete for session ${sessionId}. Overall score: ${evaluation.overallScore}`,
      );
    } catch (error) {
      this.logger.error(`Feedback job failed for session ${sessionId}:`, error);
      await this.prisma.feedbackReport.update({
        where: { sessionId },
        data: {
          status: FeedbackStatus.FAILED,
          errorMessage:
            error instanceof Error ? error.message : 'Unknown error',
          processingEndedAt: new Date(),
        },
      });
      throw error; // Re-throw so BullMQ can retry with backoff
    }
  }
}
