import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue, Job } from 'bullmq';
import { FEEDBACK_QUEUE } from '../queue.constants';
import { FeedbackJobData } from '../processors/feedback.processor';

@Injectable()
export class FeedbackProducer {
  constructor(@InjectQueue(FEEDBACK_QUEUE) private readonly queue: Queue) {}

  async enqueueFeedbackJob(data: FeedbackJobData): Promise<Job> {
    return this.queue.add('generate-feedback', data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 }, // Retry after 5s, 10s, 20s
      removeOnComplete: { age: 3600 }, // Keep for 1 hour for debugging
      removeOnFail: { age: 86400 }, // Keep failures for 24 hours
    });
  }
}
