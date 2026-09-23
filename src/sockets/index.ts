import type { Server as SocketIOServer } from 'socket.io';
import logger from '../config/logger';
import { bindIo } from './bus';

export async function initSocket(io: SocketIOServer): Promise<void> {
  bindIo(io);
  io.on('connection', (socket) => {
    socket.on('join', (payload: { organizationId?: string; visitorId?: string }) => {
      if (payload?.organizationId) socket.join(`org:${payload.organizationId}`);
      if (payload?.visitorId) socket.join(`visitor:${payload.visitorId}`);
    });
    socket.on('leave', (payload: { organizationId?: string; visitorId?: string }) => {
      if (payload?.organizationId) socket.leave(`org:${payload.organizationId}`);
      if (payload?.visitorId) socket.leave(`visitor:${payload.visitorId}`);
    });
    socket.on('disconnect', () => {
      logger.info(`Socket disconnected: ${socket.id}`);
    });
  });
}
