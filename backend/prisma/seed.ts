import {
  PrismaClient,
  RoleType,
  InterviewMode,
  SessionStatus,
  QuestionCategory,
  FeedbackStatus,
} from '../generated/prisma/client';
import * as bcrypt from 'bcryptjs';
import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Starting seed...');

  // --- Admin User ---
  const adminPassword = await bcrypt.hash('Admin@1234!', 12);
  await prisma.user.upsert({
    where: { email: 'admin@prepinterview.dev' },
    update: {},
    create: {
      email: 'admin@prepinterview.dev',
      passwordHash: adminPassword,
      displayName: 'Platform Admin',
      role: RoleType.ADMIN,
      isVerified: true,
    },
  });

  // --- Demo User ---
  const demoPassword = await bcrypt.hash('Demo@1234!', 12);
  const demoUser = await prisma.user.upsert({
    where: { email: 'demo@prepinterview.dev' },
    update: {},
    create: {
      email: 'demo@prepinterview.dev',
      passwordHash: demoPassword,
      displayName: 'Demo Candidate',
      role: RoleType.PREMIUM,
      isVerified: true,
    },
  });

  const session = await prisma.interviewSession.create({
    data: {
      userId: demoUser.id,
      mode: InterviewMode.TEXT,
      status: SessionStatus.COMPLETED,
      targetRole: 'Senior Backend Engineer',
      difficulty: 4,
      questionCount: 3,
      durationSeconds: 1260,
      startedAt: new Date(Date.now() - 1000 * 60 * 90),
      endedAt: new Date(Date.now() - 1000 * 60 * 69),
    },
  });

  const questions = [
    {
      sequenceNumber: 1,
      category: QuestionCategory.TECHNICAL,
      questionText:
        'Explain the differences between horizontal and vertical scaling. When would you choose one over the other?',
      userAnswer:
        'Horizontal scaling adds more machines to your pool of resources, while vertical scaling increases the power of an existing machine. I would choose horizontal scaling for stateless services that need high availability, and vertical scaling for databases in the early stages before sharding becomes necessary.',
      askedAt: new Date(Date.now() - 1000 * 60 * 88),
      answeredAt: new Date(Date.now() - 1000 * 60 * 85),
      answerDuration: 180,
    },
    {
      sequenceNumber: 2,
      category: QuestionCategory.SYSTEM_DESIGN,
      questionText:
        'Design a rate limiter that works across a distributed cluster of API servers.',
      userAnswer:
        'I would use a sliding window counter algorithm stored in Redis. Each server increments a key scoped to the user ID and time window. Lua scripts ensure atomic increment-and-check operations to prevent race conditions across servers.',
      askedAt: new Date(Date.now() - 1000 * 60 * 84),
      answeredAt: new Date(Date.now() - 1000 * 60 * 79),
      answerDuration: 300,
    },
    {
      sequenceNumber: 3,
      category: QuestionCategory.BEHAVIORAL,
      questionText:
        'Describe a time when you had to advocate for a technical decision that was initially unpopular with your team.',
      userAnswer:
        'In a previous role, I pushed for adopting TypeScript when the team was comfortable with plain JavaScript. I prepared a short proof-of-concept showing how it caught three bugs in existing code within an hour. After that demo, the team gradually adopted it over two sprints.',
      askedAt: new Date(Date.now() - 1000 * 60 * 78),
      answeredAt: new Date(Date.now() - 1000 * 60 * 71),
      answerDuration: 420,
    },
  ];

  for (const q of questions) {
    await prisma.interviewQuestion.create({
      data: { sessionId: session.id, ...q },
    });
  }

  // --- Demo Feedback Report ---
  await prisma.feedbackReport.create({
    data: {
      sessionId: session.id,
      status: FeedbackStatus.COMPLETED,
      overallScore: 7.8,
      technicalScore: 8.2,
      communicationScore: 7.5,
      pacingScore: 7.0,
      codeQualityScore: 6.5,
      behavioralScore: 8.5,
      strengths: [
        'Strong conceptual grasp of distributed systems',
        'Effective use of concrete examples in behavioral questions',
        'Confident and structured communication style',
      ],
      improvements: [
        {
          area: 'Code Quality',
          detail:
            'When discussing system design, incorporate specific data structures and time complexities.',
          example:
            'Instead of saying "I would store this in Redis", say "I would use a Redis Sorted Set with O(log N) ZADD for the priority queue."',
        },
        {
          area: 'Pacing',
          detail:
            'Some answers were slightly rushed. Pausing for 2–3 seconds before responding signals thoughtful processing.',
          example:
            'For Q2 (rate limiter), taking a moment to draw out the architecture mentally would have improved the delivery.',
        },
      ],
      processingStartedAt: new Date(Date.now() - 1000 * 60 * 68),
      processingEndedAt: new Date(Date.now() - 1000 * 60 * 65),
    },
  });

  console.log('✅ Seed complete.');
  console.log(`   Admin: admin@prepinterview.dev / Admin@1234!`);
  console.log(`   Demo:  demo@prepinterview.dev  / Demo@1234!`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
