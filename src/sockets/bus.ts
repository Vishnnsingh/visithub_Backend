import type { Server } from 'socket.io';

let io: Server | null = null;

export function bindIo(server: Server) {
  io = server;
}

export function emitToOrg(organizationId: string, event: string, payload: unknown) {
  io?.to(`org:${organizationId}`).emit(event, payload);
}

export function emitToVisitor(visitorId: string, event: string, payload: unknown) {
  io?.to(`visitor:${visitorId}`).emit(event, payload);
}
