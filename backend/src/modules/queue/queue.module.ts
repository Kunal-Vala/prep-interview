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
      useFactory: (config: ConfigService) => {
        const redisPort = Number.parseInt(config.get('REDIS_PORT') ?? '', 10);

        return {
          connection: {
            host: config.get('REDIS_HOST', 'localhost'),
            port: Number.isNaN(redisPort) ? 6379 : redisPort,
            password: config.get('REDIS_PASSWORD') || undefined,
          },
        };
      },
      inject: [ConfigService],
    }),
    BullModule.registerQueue({ name: FEEDBACK_QUEUE }, { name: RESUME_QUEUE }),
    AiModule,
  ],
  providers: [FeedbackProcessor, FeedbackProducer],
  exports: [FeedbackProducer],
})
export class QueueModule {}
