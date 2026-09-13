import { Router } from 'express';

import { PERMISSIONS } from '../../core/constants/index.js';
import {
  authenticate,
  requirePermissions,
} from '../../middlewares/auth.middleware.js';
import validate from '../../middlewares/validate.middleware.js';

import * as controller from './return.controller.js';
import {
  createReturnSchema,
  getReturnSchema,
  listReturnsSchema,
  returnableSchema,
  summarySchema,
} from './return.validation.js';

const router = Router();

router.use(authenticate);

const canView = requirePermissions(PERMISSIONS.RETURN_VIEW);
const canManage = requirePermissions(PERMISSIONS.RETURN_MANAGE);

router.get('/summary', canView, validate(summarySchema), controller.summary);
router.get(
  '/returnable/:invoiceId',
  canView,
  validate(returnableSchema),
  controller.returnable,
);

router.get('/', canView, validate(listReturnsSchema), controller.list);
router.get('/:id', canView, validate(getReturnSchema), controller.getOne);

router.post('/', canManage, validate(createReturnSchema), controller.create);

export default router;
