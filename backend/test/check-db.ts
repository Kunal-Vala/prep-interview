import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const prisma = app.get(PrismaService);

  const reports = await prisma.feedbackReport.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5,
  });

  console.log('--- LATEST 5 FEEDBACK REPORTS ---');
  for (const r of reports) {
    console.log({
      id: r.id,
      sessionId: r.sessionId,
      status: r.status,
      overallScore: r.overallScore?.toString(),
      errorMessage: r.errorMessage,
      createdAt: r.createdAt,
    });
  }

  await app.close();
}

bootstrap();
