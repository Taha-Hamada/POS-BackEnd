import { Router } from 'express';

import { PERMISSIONS } from '../../core/constants/index.js';
import {
  authenticate,
  requirePermissions,
} from '../../middlewares/auth.middleware.js';
import validate from '../../middlewares/validate.middleware.js';

import * as controller from './promotion.controller.js';
import {
  createPromotionSchema,
  getPromotionSchema,
  listPromotionsSchema,
  setActiveSchema,
  updatePromotionSchema,
} from './promotion.validation.js';

const router = Router();

router.use(authenticate);

const canView = requirePermissions(PERMISSIONS.PROMOTION_VIEW);
const canManage = requirePermissions(PERMISSIONS.PROMOTION_MANAGE);

// قبل '/:id' عشان الكلمات دي متتقريش كمعرّف عرض.
router.get('/summary', canView, controller.summary);
router.get('/live', canView, controller.live);

router.get('/', canView, validate(listPromotionsSchema), controller.list);
router.get('/:id', canView, validate(getPromotionSchema), controller.getOne);

router.post('/', canManage, validate(createPromotionSchema), controller.create);
router.patch('/:id', canManage, validate(updatePromotionSchema), controller.update);
router.patch('/:id/active', canManage, validate(setActiveSchema), controller.setActive);

export default router;
