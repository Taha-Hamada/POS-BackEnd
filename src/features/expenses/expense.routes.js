import { Router } from 'express';

import { PERMISSIONS } from '../../core/constants/index.js';
import {
  authenticate,
  requirePermissions,
} from '../../middlewares/auth.middleware.js';
import validate from '../../middlewares/validate.middleware.js';

import * as controller from './expense.controller.js';
import {
  createExpenseSchema,
  getExpenseSchema,
  listExpensesSchema,
  reviewExpenseSchema,
  summarySchema,
  updateExpenseSchema,
} from './expense.validation.js';

const router = Router();

router.use(authenticate);

const canView = requirePermissions(PERMISSIONS.EXPENSE_VIEW);
const canManage = requirePermissions(PERMISSIONS.EXPENSE_MANAGE);
const canApprove = requirePermissions(PERMISSIONS.EXPENSE_APPROVE);

router.get('/summary', canView, validate(summarySchema), controller.summary);

router.get('/', canView, validate(listExpensesSchema), controller.list);
router.get('/:id', canView, validate(getExpenseSchema), controller.getOne);

router.post('/', canManage, validate(createExpenseSchema), controller.create);
router.patch('/:id', canManage, validate(updateExpenseSchema), controller.update);
router.delete('/:id', canManage, validate(getExpenseSchema), controller.remove);

router.post('/:id/review', canApprove, validate(reviewExpenseSchema), controller.review);

export default router;
