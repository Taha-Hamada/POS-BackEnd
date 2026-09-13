import { Router } from 'express';

import { PERMISSIONS } from '../../core/constants/index.js';
import {
  authenticate,
  requirePermissions,
} from '../../middlewares/auth.middleware.js';
import validate from '../../middlewares/validate.middleware.js';

import * as controller from './supplier.controller.js';
import {
  createSupplierSchema,
  getSupplierSchema,
  listSuppliersSchema,
  paymentSchema,
  setActiveStateSchema,
  updateSupplierSchema,
} from './supplier.validation.js';

const router = Router();

router.use(authenticate);

const canView = requirePermissions(PERMISSIONS.SUPPLIER_VIEW);
const canManage = requirePermissions(PERMISSIONS.SUPPLIER_MANAGE);

router.get('/payables', canView, controller.payables);

router.get('/', canView, validate(listSuppliersSchema), controller.list);
router.get('/:id', canView, validate(getSupplierSchema), controller.getOne);

router.post('/', canManage, validate(createSupplierSchema), controller.create);
router.post('/:id/payments', canManage, validate(paymentSchema), controller.pay);

router.patch('/:id', canManage, validate(updateSupplierSchema), controller.update);
router.patch(
  '/:id/active',
  canManage,
  validate(setActiveStateSchema),
  controller.setActiveState,
);

export default router;
