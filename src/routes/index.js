import { Router } from 'express';

import env from '../config/env.js';
import authRoutes from '../features/auth/auth.routes.js';
import branchRoutes from '../features/branches/branch.routes.js';
import userRoutes from '../features/users/user.routes.js';

const router = Router();

/** فحص حياة الخدمة — بيستخدمه الفرونت والمراقبة عشان يتأكدوا إن الـ API شغالة. */
router.get('/health', (_req, res) => {
  res.json({
    success: true,
    message: 'الخدمة شغالة',
    data: {
      status: 'ok',
      environment: env.NODE_ENV,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    },
  });
});

/**
 * كل فيتشر بيتسجّل هنا بسطر واحد.
 * الترتيب مش مهم لأن المسارات مالهاش تداخل، بس بنسيبه مرتّب عشان القراءة.
 */
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/branches', branchRoutes);

export default router;
