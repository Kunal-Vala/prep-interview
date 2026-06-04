import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { SessionStatus } from '@prisma/client';

@Injectable()
export class InterviewService {
  constructor(private readonly prisma: PrismaService) {}

  async createSession(userId: string, dto: CreateSessionDto) {
    return this.prisma.interviewSession.create({
      data: {
        userId,
        mode: dto.mode,
        targetRole: dto.targetRole,
        difficulty: dto.difficulty,
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
  }

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

    if (!session) throw new NotFoundException('Session Not FOund');
    if (session.userId !== userId)
      throw new ForbiddenException('Unauthorized access');

    return session;
  }

  async getSessionFeedback(sessionId: string, userId: string) {
    const session = await this.prisma.interviewSession.findUnique({
      where: { id: sessionId },
      select: { userId: true },
    });
    if (!session) throw new NotFoundException('Session not found');
    if (session.userId !== userId)
      throw new ForbiddenException('Unauthorized access');
    const report = await this.prisma.feedbackReport.findUnique({
      where: { sessionId },
    });
    if (!report) throw new NotFoundException('Feedback report not found');
    return report;
  }
}
