import { Module } from '@nestjs/common';
import { WhisperService } from './whisper/whisper.service';
import { AiService } from './ai.service';

@Module({
  providers: [WhisperService, AiService]
})
export class AiModule {}
