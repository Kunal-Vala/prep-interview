import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { WsException } from '@nestjs/websockets';
import {
  AuthenticatedSocket,
  JwtPayload,
} from '../interfaces/request.interface';
@Injectable()
export class WsJwtGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    // Cast the client instance to our typed interface
    const client = context.switchToWs().getClient<AuthenticatedSocket>();

    // Explicitly cast the auth payload property to a string lookup
    const authHeader = client.handshake.auth?.['token'] as string | undefined;
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      throw new WsException('No authentication token');
    }

    try {
      // 3. Inform the compiler that verify() returns our exact interface layout
      const payload = this.jwt.verify<JwtPayload>(token, {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      });

      // These assignments are now perfectly typed and clear of errors
      client.data.userId = payload.sub;
      client.data.email = payload.email;

      return true;
    } catch {
      throw new WsException('Invalid or expired token');
    }
  }
}
