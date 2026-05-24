import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { FeedbackProducer } from '../src/modules/queue/producers/feedback.producer';
import { PrismaService } from '../src/prisma/prisma.service';
import { FeedbackReport, QuestionCategory } from '@prisma/client';

async function bootstrap() {
  console.log('--- Initializing NestJS App Context ---');
  const app = await NestFactory.createApplicationContext(AppModule);

  const prisma = app.get(PrismaService);
  const producer = app.get(FeedbackProducer);

  // 1. Fetch or create a seed user
  let user = await prisma.user.findFirst();
  if (!user) {
    user = await prisma.user.create({
      data: {
        email: 'test-feedback@example.com',
        displayName: 'Test Feedback User',
        passwordHash: 'dummyhash',
      },
    });
  }

  console.log(`Using User ID: ${user.id}`);

  // 2. Create a Mock completed Interview Session with transcript questions
  const session = await prisma.interviewSession.create({
    data: {
      userId: user.id,
      mode: 'TEXT',
      targetRole: 'Node.js Backend Developer',
      difficulty: 3,
      durationSeconds: 300,
      questionCount: 2,
      questions: {
        create: [
          {
            sequenceNumber: 1,
            category: QuestionCategory.TECHNICAL,
            questionText:
              'What is the event loop in Node.js, and how does it handle asynchronous I/O?',
            userAnswer:
              'The event loop is a single-threaded loop that delegates operations to the kernel or a worker pool. When an operation finishes, Node.js runs the callback. It consists of phases like timers, poll, and check.',
          },
          {
            sequenceNumber: 2,
            category: QuestionCategory.SYSTEM_DESIGN,
            questionText:
              'How would you scale a heavy Node.js API server to handle 10,000 requests per second?',
            userAnswer:
              'I would use clustering to utilize multi-core processors. I would also add Nginx as a load balancer and cache database responses using Redis to reduce latency.',
          },
        ],
      },
    },
  });

  console.log(`Created Mock Session: ${session.id}`);

  // 3. Create the Feedback Report placeholder
  await prisma.feedbackReport.create({
    data: {
      sessionId: session.id,
    },
  });

  console.log('Mock Feedback Report initialized in DB.');

  // 4. Enqueue the feedback job
  console.log('Enqueuing BullMQ job...');
  const job = await producer.enqueueFeedbackJob({
    sessionId: session.id,
    userId: user.id,
  });

  console.log(`Job enqueued successfully! ID: ${job.id}`);
  console.log(
    'Waiting dynamically (up to 45s) for worker and LLM to complete...',
  );

  // 5. Poll database dynamically until status is no longer PENDING or PROCESSING
  let report: FeedbackReport | null = null;
  const startTime = Date.now();
  const timeoutMs = 45000;

  while (Date.now() - startTime < timeoutMs) {
    report = await prisma.feedbackReport.findUnique({
      where: { sessionId: session.id },
    });

    if (
      report &&
      report.status !== 'PENDING' &&
      report.status !== 'PROCESSING'
    ) {
      break;
    }
    // Wait 1.5 seconds between polls
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  console.log('\n--- VERIFICATION RESULTS ---');
  if (!report) {
    console.error(
      '❌ Verification Failed: Feedback report could not be found!',
    );
  } else {
    console.log(`Status: ${report.status}`);
    console.log(`Overall Score: ${report.overallScore?.toString()}`);
    console.log(`Technical Score: ${report.technicalScore?.toString()}`);
    console.log(`Code Quality Score: ${report.codeQualityScore?.toString()}`);
    console.log('Strengths:', JSON.stringify(report.strengths, null, 2));
    console.log('Improvements:', JSON.stringify(report.improvements, null, 2));

    if (report.status === 'COMPLETED') {
      console.log('✅ Success! Async Feedback Engine works perfectly!');
    } else {
      console.error(
        `❌ Verification Failed! Status is ${report.status}. Error: ${report.errorMessage}`,
      );
    }
  }

  await app.close();
}

bootstrap().catch((err) => {
  console.error('Feedback Error', err);
  process.exit(1);
});
