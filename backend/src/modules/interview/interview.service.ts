import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { SessionStatus } from '@prisma/client';

@Injectable()
export class InterviewService {
  // Instantiating a contextual logger bound to this specific service class
  private readonly logger = new Logger(InterviewService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Initializes an AI Mock Interview session and generates a corresponding blank feedback report.
   */
  async createSession(userId: string, dto: CreateSessionDto) {
    const session = await this.prisma.interviewSession.create({
      data: {
        userId,
        targetRole: dto.targetRole,
        difficulty: dto.difficulty,
        mode: dto.mode,
        questionCount: dto.questionCount ?? 7,
        status: SessionStatus.IN_PROGRESS,
        feedbackReport: {
          create: {
            status: 'PENDING',
          },
        },
      },
      include: {
        feedbackReport: true,
      },
    });

    this.logger.log(
      `User [${userId}] successfully initiated interview session [${session.id}]`,
    );
    return session;
  }

  /**
   * Retrieves all historical interview sessions for a specific user.
   * Leverages data projections to keep payloads light.
   */
  async listUserSessions(userId: string) {
    return this.prisma.interviewSession.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        feedbackReport: {
          select: {
            status: true,
            overallScore: true,
          },
        },
        _count: {
          select: { questions: true },
        },
      },
    });
  }

  /**
   * Fetches the complete structural details of a session, including questions.
   * Validates both existence and resource ownership.
   */
  async getSession(sessionId: string, userId: string) {
    const session = await this.prisma.interviewSession.findUnique({
      where: { id: sessionId },
      include: {
        questions: {
          orderBy: { sequenceNumber: 'asc' },
        },
        feedbackReport: true,
      },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (session.userId !== userId) {
      this.logger.warn(
        `Unauthorized resource access attempt: User [${userId}] tried to access Session [${sessionId}]`,
      );
      throw new ForbiddenException('Unauthorized access');
    }

    return session;
  }

  /**
   * Retrieves the specific grading/feedback report for an interview session.
   * Performs an early resource/ownership check before executing the final query.
   */
  async getSessionFeedback(sessionId: string, userId: string) {
    const session = await this.prisma.interviewSession.findUnique({
      where: { id: sessionId },
      include: {
        questions: {
          orderBy: { sequenceNumber: 'asc' },
        },
      },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (session.userId !== userId) {
      this.logger.warn(
        `Unauthorized resource access attempt: User [${userId}] tried to access Feedback for Session [${sessionId}]`,
      );
      throw new ForbiddenException('Unauthorized access');
    }

    const report = await this.prisma.feedbackReport.findUnique({
      where: { sessionId },
    });

    if (!report) {
      throw new NotFoundException('Feedback report not found');
    }

    // Safely parse raw LLM response if available to extract extra fields
    let hiringRecommendation = 'PENDING';
    let hiringRationale = '';
    let studyRecommendations: string[] = [];

    if (report.rawLlmResponse) {
      try {
        const cleaned = report.rawLlmResponse
          .replace(/^```json\s*/i, '')
          .replace(/```\s*$/, '')
          .trim();
        const parsed = JSON.parse(cleaned) as {
          hiringRecommendation?: string;
          hiringRationale?: string;
          studyRecommendations?: string[];
        };
        hiringRecommendation = parsed.hiringRecommendation || 'PENDING';
        hiringRationale = parsed.hiringRationale || '';
        studyRecommendations = parsed.studyRecommendations || [];
      } catch (e) {
        this.logger.error(
          'Failed to parse raw LLM response for extra feedback fields:',
          e,
        );
      }
    }

    return {
      ...report,
      targetRole: session.targetRole,
      difficulty: session.difficulty,
      hiringRecommendation,
      hiringRationale,
      studyRecommendations,
      questions: session.questions,
    };
  }

  async deleteSession(sessionId: string, userId: string): Promise<void> {
    const session = await this.prisma.interviewSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (session.userId !== userId) {
      throw new ForbiddenException('Unauthorized access');
    }

    await this.prisma.interviewSession.delete({
      where: { id: sessionId },
    });
  }
}
