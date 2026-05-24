import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { AiService } from '@/modules/ai/ai.service';
import { FeedbackStatus } from '@prisma/client';
import {
  buildEvaluatorPrompt,
  parseEvaluatorResponse,
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
