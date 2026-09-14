import { Router } from 'express';

import { PERMISSIONS } from '../../core/constants/index.js';
import {
  authenticate,
  requirePermissions,
} from '../../middlewares/auth.middleware.js';
import validate from '../../middlewares/validate.middleware.js';

import * as controller from './purchase.controller.js';
import {
  cancelOrderSchema,
  createOrderSchema,
  getOrderSchema,
  listOrdersSchema,
  receiveOrderSchema,
  summarySchema,
  updateOrderSchema,
} from './purchase.validation.js';

const router = Router();

router.use(authenticate);

const canView = requirePermissions(PERMISSIONS.PURCHASE_VIEW);
const canManage = requirePermissions(PERMISSIONS.PURCHASE_MANAGE);

router.get('/summary', canView, validate(summarySchema), controller.summary);

router.get('/', canView, validate(listOrdersSchema), controller.list);
router.get('/:id', canView, validate(getOrderSchema), controller.getOne);

router.post('/', canManage, validate(createOrderSchema), controller.create);
router.patch('/:id', canManage, validate(updateOrderSchema), controller.update);

router.post('/:id/confirm', canManage, validate(getOrderSchema), controller.confirm);
router.post('/:id/receive', canManage, validate(receiveOrderSchema), controller.receive);
router.post('/:id/cancel', canManage, validate(cancelOrderSchema), controller.cancel);

export default router;
