import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  Req,
} from '@nestjs/common';
import { InterviewService } from './interview.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '@/common/interfaces/request.interface';

@Controller('interview')
@UseGuards(JwtAuthGuard)
export class InterviewController {
  constructor(private readonly interviewService: InterviewService) {}

  @Post('sessions')
  createSession(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateSessionDto,
  ) {
    return this.interviewService.createSession(req.user.sub, dto);
  }
}
