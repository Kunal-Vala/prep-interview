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
}
