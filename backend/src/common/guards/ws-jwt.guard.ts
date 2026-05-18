// backend/src/common/guards/ws-jwt.guard.ts
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Socket } from 'socket.io';
import { WsException } from '@nestjs/websockets';

@Injectable()
export class WsJwtGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const client: Socket = context.switchToWs().getClient();
    // Token sent in handshake: socket = io(url, { auth: { token: 'Bearer ...' } })
    const token = client.handshake.auth?.token?.replace('Bearer ', '');

    if (!token) throw new WsException('No authentication token');

    try {
      const payload = this.jwt.verify(token, {
        secret: this.config.get('JWT_ACCESS_SECRET'),
      });
      client.data.userId = payload.sub;
      client.data.email = payload.email;
      return true;
    } catch {
      throw new WsException('Invalid or expired token');
    }
  }
}
