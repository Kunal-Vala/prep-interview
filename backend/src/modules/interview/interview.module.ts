import { Module } from '@nestjs/common';
import { InterviewGateway } from './interview.gateway';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { WsJwtGuard } from '../../common/guards/ws-jwt.guard';
@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get('JWT_ACCESS_SECRET'),
      }),
    }),
  ],
  providers: [InterviewGateway, WsJwtGuard],
})
export class InterviewModule {}
