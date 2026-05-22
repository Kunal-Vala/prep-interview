import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI, { toFile } from 'openai';

@Injectable()
export class WhisperService {
  private readonly openai: OpenAI;
  private readonly logger = new Logger(WhisperService.name);

  constructor(private config: ConfigService) {
    this.openai = new OpenAI({
      apiKey: this.config.get<string>('OPENAI_API_KEY'),
    });
  }

  /**
   * Transcribes raw audio buffer (e.g., from WebM/Ogg) into text.
   */

  async transcribe(
    audioBuffer: Buffer,
    fileName = 'audio.webm',
  ): Promise<string> {
    this.logger.log(
      `Transcribing audio chunk of size ${audioBuffer.length} bytes`,
    );

    try {
      // OpenAI provides a 'toFile' utility to correctly convert a Node Buffer to a File object.
      const audioFile = await toFile(audioBuffer, fileName, {
        type: 'audio/webm',
      });

      const response = await this.openai.audio.transcriptions.create({
        file: audioFile,
        model: this.config.get<string>('OPENAI_WHISPER_MODEL', 'whisper-1'),
        language: 'en',
      });

      return response.text;
    } catch (error) {
      this.logger.error('Failed to transcribe audio', error);
      throw error;
    }
  }
}
