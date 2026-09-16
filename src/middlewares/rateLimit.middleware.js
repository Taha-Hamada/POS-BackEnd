import rateLimit from 'express-rate-limit';

import env from '../config/env.js';
import ApiError from '../core/errors/ApiError.js';

const handler = (_req, _res, next) => {
  next(ApiError.tooMany());
};

/**
 * حد عام على كل مسارات الـ API.
 *
 * على جهاز التطوير الحد بيترفع: اختبارات الفرونت بتعمل آلاف الطلبات في
 * دقايق، وكانت بتاخد 429 وتفشل لأسباب مالهاش علاقة بالكود.
 */
export const apiRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
  limit: env.isProduction
    ? env.RATE_LIMIT_MAX
    : Math.max(env.RATE_LIMIT_MAX, 50000),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => env.isTest,
  handler,
});

/** حد أضيق على تسجيل الدخول عشان تخمين كلمات السر يبقى مكلّف. */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  skip: () => env.isTest,
  handler,
});

export default { apiRateLimiter, authRateLimiter };
