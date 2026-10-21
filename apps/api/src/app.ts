import express, { type Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import crypto from 'node:crypto';
import { getConfig } from './config/env';
import { logger } from './config/logger';
import { attachSession } from './modules/auth/session.service';
import { csrfProtection, originGuard } from './middleware/auth';
import { createRateLimiter } from './middleware/rateLimit';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { prisma } from './lib/prisma';
import { authRouter } from './routes/auth.routes';
import { ticketRouter, notificationRouter } from './routes/tickets.routes';
import { staffRouter } from './routes/staff.routes';
import { departmentRouter } from './routes/departments.routes';
import { adminRouter } from './routes/admin.routes';

export function createApp(): Express {
  const config = getConfig();
  const app = express();

  app.set('trust proxy', config.TRUST_PROXY ? 1 : false);
  app.disable('x-powered-by');

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );

  app.use(
    cors({
      origin: config.CORS_ORIGINS,
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
    }),
  );

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));
  app.use(cookieParser());

  // Request id for traceability in logs and error payloads.
  app.use((req, _res, next) => {
    req.requestId = req.get('x-request-id') ?? crypto.randomUUID();
    next();
  });

  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok', service: 'campus-resolve-api', at: new Date().toISOString() });
  });

  app.get('/readyz', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: 'ready', database: 'up' });
    } catch {
      res.status(503).json({ status: 'unavailable', database: 'down' });
    }
  });

  const api = express.Router();
  api.use(
    createRateLimiter({
      windowMs: config.RATE_LIMIT_WINDOW_MS,
      max: config.RATE_LIMIT_MAX,
    }),
  );
  api.use(originGuard);
  api.use(attachSession);
  api.use(csrfProtection);

  api.use('/auth', authRouter);
  api.use('/tickets', ticketRouter);
  api.use('/notifications', notificationRouter);
  api.use('/staff', staffRouter);
  api.use('/departments', departmentRouter);
  api.use('/admin', adminRouter);

  app.use('/api/v1', api);

  app.use(notFoundHandler);
  app.use(errorHandler);

  logger.info('API initialised', { environment: config.NODE_ENV, cors: config.CORS_ORIGINS });

  return app;
}
