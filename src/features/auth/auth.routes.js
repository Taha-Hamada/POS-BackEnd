import { Router } from 'express';

import { authenticate } from '../../middlewares/auth.middleware.js';
import { authRateLimiter } from '../../middlewares/rateLimit.middleware.js';
import validate from '../../middlewares/validate.middleware.js';

import * as controller from './auth.controller.js';
import {
  bootstrapSchema,
  changePasswordSchema,
  loginSchema,
  refreshSchema,
} from './auth.validation.js';

const router = Router();

// مسارات مفتوحة، وعليها حد معدل أضيق لأنها بوابة الدخول.
router.post('/bootstrap', authRateLimiter, validate(bootstrapSchema), controller.bootstrap);
router.post('/login', authRateLimiter, validate(loginSchema), controller.login);
router.post('/refresh', authRateLimiter, validate(refreshSchema), controller.refresh);

// كل اللي تحت محتاج جلسة صالحة.
router.use(authenticate);

router.get('/me', controller.me);
router.post('/change-password', validate(changePasswordSchema), controller.changePassword);
router.post('/logout-all', controller.logoutAll);

export default router;
