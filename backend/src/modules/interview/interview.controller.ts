import {
  Controller,
  Post,
  Get,
  Delete,
  HttpCode,
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

  @Get('sessions')
  listSessions(@Req() req: AuthenticatedRequest) {
    return this.interviewService.listUserSessions(req.user.sub);
  }

  @Get('sessions/:id')
  getSession(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.interviewService.getSession(id, req.user.sub);
  }

  @Get('sessions/:id/feedback')
  getFeedback(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.interviewService.getSessionFeedback(id, req.user.sub);
  }

  @Delete('sessions/:id')
  @HttpCode(204)
  deleteSession(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.interviewService.deleteSession(id, req.user.sub);
  }
}
