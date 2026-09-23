import http from 'http';
import { Server } from 'socket.io';
import app from './app';
import env from './config/env';
import logger from './config/logger';
import { initConfig } from './config';
import { initSocket } from './sockets';

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: env.corsOrigins,
    credentials: true,
  },
});

app.set('io', io);

const bootstrap = async (): Promise<void> => {
  await initConfig();
  await initSocket(io);

  server.listen(env.PORT, () => {
    logger.info(`${env.APP_NAME} running on port ${env.PORT} [${env.NODE_ENV}]`);
    logger.info(`Hello route: http://localhost:${env.PORT}${env.API_PREFIX}/hello`);
  });
};

process.on('unhandledRejection', (reason) => {
  logger.error(`Unhandled Rejection: ${reason}`);
});

process.on('uncaughtException', (error) => {
  logger.error(`Uncaught Exception: ${error.message}`, { stack: error.stack });
  process.exit(1);
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down');
  server.close(() => process.exit(0));
});

void bootstrap();
