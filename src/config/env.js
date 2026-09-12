import process from 'node:process';

import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

/**
 * مخطّط متغيرات البيئة.
 * أي متغير ناقص أو بصيغة غلط بيوقف السيرفر من أول ثانية بدل ما يقع في نص الشغل.
 */
const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  API_PREFIX: z.string().startsWith('/').default('/api/v1'),

  MONGO_URI: z.string().min(1, 'MONGO_URI مطلوب'),

  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET قصير جدًا'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET قصير جدًا'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),

  CORS_ORIGINS: z.string().default('*'),

  RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().positive().default(15),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),

  DEFAULT_TAX_RATE: z.coerce.number().min(0).max(1).default(0.14),
  DEFAULT_CURRENCY: z.string().default('EGP'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  • ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  throw new Error(`إعدادات البيئة غير صالحة:\n${issues}`);
}

const raw = parsed.data;

export const env = Object.freeze({
  ...raw,
  isProduction: raw.NODE_ENV === 'production',
  isTest: raw.NODE_ENV === 'test',
  corsOrigins:
    raw.CORS_ORIGINS === '*'
      ? '*'
      : raw.CORS_ORIGINS.split(',')
          .map((origin) => origin.trim())
          .filter(Boolean),
});

export default env;
