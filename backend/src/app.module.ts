import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { InterviewGateway } from './modules/interview/interview.gateway';
import { InterviewModule } from './modules/interview/interview.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    UsersModule,
    InterviewModule,
  ],
  controllers: [AppController],
  providers: [AppService, InterviewGateway],
})
export class AppModule {}
