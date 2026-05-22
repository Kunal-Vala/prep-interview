import { Request } from 'express';
import { Socket } from 'socket.io';

// 1. The universal source of truth for your token claims
export interface JwtPayload {
  sub: string;
  email: string;
}

// 2. HTTP specific interface
export interface AuthenticatedRequest extends Request {
  user: JwtPayload;
}

// 3. WebSocket specific interface
export interface AuthenticatedSocket extends Socket {
  data: {
    userId: string;
    email: string;
  };
}
