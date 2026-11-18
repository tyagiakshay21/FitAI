import path from 'path';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { env } from './config/env';
import { logger } from './config/logger';
import { errorHandler, notFound } from './middlewares/error';
import { globalLimiter } from './middlewares/rateLimit';
import routes from './routes';
import { authenticate } from './middlewares/auth';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: env.CLIENT_URL.split(','), credentials: true }));
  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/api/health' } }));
  app.use(globalLimiter);
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  // Progress photos are private: served only to authenticated users (filenames are unguessable UUIDs).
  app.use('/uploads', authenticate, express.static(path.resolve(env.UPLOAD_DIR)));
  app.use('/api', routes);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
