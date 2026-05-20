import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { AiService } from '../src/modules/ai/ai.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const aiService = app.get(AiService);

  console.log('--- Testing LLM Stream (GitHub Models) ---');

  const messages = [
    { role: 'user' as const, content: 'I am a fresher interested in graphic design' }
  ];

  process.stdout.write('AI Response: ');

  await aiService.streamInterviewerResponse(messages, (token) => {
    process.stdout.write(token);
  });

  console.log('\n\n✅ Test finished successfully!');
  await app.close();
}

bootstrap();
