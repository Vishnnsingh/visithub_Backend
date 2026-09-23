import fs from 'fs';
import path from 'path';
import winston from 'winston';
import env from './env';

const logsDir = path.join(__dirname, '../../logs');
fs.mkdirSync(logsDir, { recursive: true });

const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: env.APP_NAME },
  transports: [
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
    }),
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
    }),
  ],
});

if (!env.isProd) {
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp({ format: 'HH:mm:ss' }),
        winston.format.printf((info) => {
          const timestamp = String(info.timestamp ?? '');
          const level = String(info.level);
          const message = String(info.message);
          const stack = typeof info.stack === 'string' ? info.stack : undefined;
          return stack
            ? `[${timestamp}] ${level}: ${message}\n${stack}`
            : `[${timestamp}] ${level}: ${message}`;
        })
      ),
    })
  );
}

export default logger;
