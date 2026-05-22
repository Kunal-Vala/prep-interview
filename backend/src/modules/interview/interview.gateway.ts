import {
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UseGuards } from '@nestjs/common';
import { WsJwtGuard } from '../../common/guards/ws-jwt.guard';

interface AuthenticatedSocket extends Socket {
  data: {
    userId: string;
  };
}

@WebSocketGateway({ namespace: '/interview' })
export class InterviewGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(InterviewGateway.name);

  handleConnection(client: Socket) {
    this.logger.log(`Client Connected : ${client.id}`);
  }
  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('join-session')
  async handleJoinSession(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { sessionId: string },
  ) {
    this.logger.log(
      `User ${client.data.userId} joining session ${data.sessionId}`,
    );
    await client.join(data.sessionId);

    client.emit('next-question', {
      questionId: 'mock-q-1',
      sequenceNumber: 1,
      category: 'TECHNICAL',
      questionText: 'Gateway connected! Tell me about yourself.',
    });
  }
}
