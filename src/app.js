import compression from 'compression';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';

import env from './config/env.js';
import logger from './config/logger.js';
import { uploadsRoot } from './config/uploads.js';
import { errorHandler, notFoundHandler } from './middlewares/error.middleware.js';
import { apiRateLimiter } from './middlewares/rateLimit.middleware.js';
import apiRouter from './routes/index.js';

export const createApp = () => {
  const app = express();

  // خلف بروكسي (nginx أو منصة استضافة) عشان الـ IP وحدود المعدل تبقى صح.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet());
  app.use(
    cors({
      origin: env.corsOrigins,
      credentials: true,
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  if (!env.isTest) {
    app.use(
      morgan(env.isProduction ? 'combined' : 'dev', {
        stream: { write: (line) => logger.info(line.trim()) },
      }),
    );
  }

  // صور المنتجات ملفات ثابتة. الـCORP لازم cross-origin عشان نسخة الويب
  // (على بورت تاني) تقدر تعرضها — helmet بيقفلها افتراضيًا.
  app.use(
    '/uploads',
    express.static(uploadsRoot, {
      index: false,
      maxAge: '7d',
      setHeaders: (res) => res.set('Cross-Origin-Resource-Policy', 'cross-origin'),
    }),
  );

  app.use(env.API_PREFIX, apiRateLimiter, apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};

export default createApp;
