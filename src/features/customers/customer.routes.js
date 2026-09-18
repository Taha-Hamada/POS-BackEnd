import { Router } from 'express';

import { PERMISSIONS } from '../../core/constants/index.js';
import {
  authenticate,
  requirePermissions,
} from '../../middlewares/auth.middleware.js';
import validate from '../../middlewares/validate.middleware.js';

import * as controller from './customer.controller.js';
import {
  adjustSchema,
  createCustomerSchema,
  getCustomerSchema,
  ledgerSchema,
  listCustomersSchema,
  paymentSchema,
  phoneLookupSchema,
  setActiveStateSchema,
  updateCustomerSchema,
} from './customer.validation.js';

const router = Router();

router.use(authenticate);

const canView = requirePermissions(PERMISSIONS.CUSTOMER_VIEW);
const canManage = requirePermissions(PERMISSIONS.CUSTOMER_MANAGE);

router.get('/receivables', canView, controller.receivables);
router.get('/phone/:phone', canView, validate(phoneLookupSchema), controller.byPhone);

router.get('/', canView, validate(listCustomersSchema), controller.list);
router.get('/:id', canView, validate(getCustomerSchema), controller.getOne);
router.get('/:id/ledger', canView, validate(ledgerSchema), controller.ledger);

router.post('/', canManage, validate(createCustomerSchema), controller.create);
router.post('/:id/payments', canManage, validate(paymentSchema), controller.pay);

// التعديل اليدوي على الرصيد بيغيّر أرقام مالية، فمربوط بصلاحية المحاسبة.
router.post(
  '/:id/adjustments',
  requirePermissions(PERMISSIONS.EXPENSE_APPROVE),
  validate(adjustSchema),
  controller.adjust,
);

router.patch('/:id', canManage, validate(updateCustomerSchema), controller.update);
router.patch(
  '/:id/active',
  canManage,
  validate(setActiveStateSchema),
  controller.setActiveState,
);

export default router;
