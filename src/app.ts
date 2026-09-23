import express from 'express';
import path from 'path';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import env from './config/env';
import logger from './config/logger';
import routes from './routes';
import { notFound, errorHandler, createRateLimiter } from './middleware';

const app = express();

app.set('trust proxy', 1);

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);
app.use(
  cors({
    origin: env.corsOrigins,
    credentials: true,
  })
);
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser(env.COOKIE_SECRET));
app.use(
  morgan(env.isProd ? 'combined' : 'dev', {
    stream: { write: (message: string) => logger.info(message.trim()) },
  })
);
app.use(
  '/uploads',
  express.static(path.join(__dirname, '../uploads'), {
    maxAge: '7d',
    etag: true,
    lastModified: true,
    setHeaders(res) {
      res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    },
  })
);
app.use(env.API_PREFIX, createRateLimiter());
app.use(env.API_PREFIX, routes);

app.use(notFound);
app.use(errorHandler);

export default app;
