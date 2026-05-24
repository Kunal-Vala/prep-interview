import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiModule } from '../ai/ai.module';
import { FEEDBACK_QUEUE, RESUME_QUEUE } from './queue.constants';
import { FeedbackProcessor } from './processors/feedback.processor';
import { FeedbackProducer } from './producers/feedback.producer';

@Module({
  imports: [
    BullModule.forRootAsync({
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get('REDIS_HOST', 'localhost'),
          port: config.get('REDIS_HOST', 6379),
          password: config.get('REDIS_PASSWORD') || undefined,
        },
      }),
      inject: [ConfigService],
    }),
    BullModule.registerQueue({ name: FEEDBACK_QUEUE }, { name: RESUME_QUEUE }),
    AiModule,
  ],
  providers: [FeedbackProcessor, FeedbackProducer],
  exports: [FeedbackProducer],
})
export class QueueModule {}
