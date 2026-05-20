import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiService } from './ai.service';
import { WhisperService } from './whisper/whisper.service';

@Module({
  imports: [ConfigModule],
  providers: [AiService, WhisperService],
  exports: [AiService, WhisperService],
})
export class AiModule {}
