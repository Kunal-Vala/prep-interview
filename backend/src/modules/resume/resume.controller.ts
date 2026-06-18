import {
  Controller,
  Post,
  Get,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Req,
  Body,
} from '@nestjs/common';
import 'multer';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ResumeService, MulterFile } from './resume.service';
import type { AuthenticatedRequest } from '@/common/interfaces/request.interface';

@Controller('resume')
@UseGuards(JwtAuthGuard)
export class ResumeController {
  constructor(private readonly resumeService: ResumeService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  uploadResume(
    @Req() req: AuthenticatedRequest,
    @UploadedFile() file: MulterFile,
    @Body('targetRole') targetRole: string,
  ) {
    return this.resumeService.uploadAndAnalyze(req.user.sub, file, targetRole);
  }

  @Get()
  getResume(@Req() req: AuthenticatedRequest) {
    return this.resumeService.getResumeAnalysis(req.user.sub);
  }
}
