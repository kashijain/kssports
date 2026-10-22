import fs from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import multer from 'multer';
import { ZodError } from 'zod';
import { clientDist, config, uploadsDir } from './config.js';
import { HttpError } from './http.js';
import { authRouter } from './routes/auth.js';
import { businessRouter, metaRouter, settingsRouter, taxRouter } from './routes/business.js';
import { customerRouter, productRouter } from './routes/catalog.js';
import { invoiceRouter, paymentRouter, publicRouter } from './routes/invoices.js';
import { opsRouter } from './routes/operations.js';
import { reportRouter } from './routes/reports.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
  app.use(cors({
    origin(origin, callback) {
      if (!origin || origin === config.clientOrigin) {
        callback(null, true);
        return;
      }
      const local = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin);
      const preview = origin.endsWith('.cvm.dev') || origin.endsWith('.cursor.com');
      callback(null, local || preview);
    },
    credentials: true,
  }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  if (!config.isTest) {
    const authLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });
    app.use('/api/auth/login', authLimit);
    app.use('/api/auth/register', authLimit);
    app.use('/api/auth/forgot-password', authLimit);
  }

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });
  app.use('/api/meta', metaRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/business', businessRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/tax-rates', taxRouter);
  app.use('/api/customers', customerRouter);
  app.use('/api/products', productRouter);
  app.use('/api/invoices', invoiceRouter);
  app.use('/api/payments', paymentRouter);
  app.use('/api/public', publicRouter);
  app.use('/api/reports', reportRouter);
  app.use('/api', opsRouter);
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: { message: 'Not found.' } });
  });

  app.use('/uploads', (req, res, next) => {
    if (req.path.includes('/private/')) {
      res.status(404).json({ error: { message: 'Not found.' } });
      return;
    }
    next();
  }, express.static(uploadsDir));
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.use((req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof ZodError) {
      const fields: Record<string, string> = {};
      for (const issue of error.issues) fields[issue.path.join('.') || 'form'] = issue.message;
      res.status(400).json({ error: { message: error.issues[0]?.message || 'Check the highlighted fields.', fields } });
      return;
    }
    if (error instanceof multer.MulterError) {
      res.status(400).json({ error: { message: 'Image must be a PNG, JPG, or WebP under 1.5 MB.' } });
      return;
    }
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: { message: error.message, fields: error.fields } });
      return;
    }
    console.error(error);
    res.status(500).json({ error: { message: 'Something went wrong. Please try again.' } });
  });

  return app;
}
