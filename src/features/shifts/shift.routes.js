import { Router } from 'express';

import { PERMISSIONS } from '../../core/constants/index.js';
import {
  authenticate,
  requirePermissions,
} from '../../middlewares/auth.middleware.js';
import validate from '../../middlewares/validate.middleware.js';

import * as controller from './shift.controller.js';
import {
  cashMovementSchema,
  closeShiftSchema,
  getShiftSchema,
  listShiftsSchema,
  openShiftSchema,
} from './shift.validation.js';

const router = Router();

router.use(authenticate);

const canView = requirePermissions(PERMISSIONS.SHIFT_VIEW);
const canManage = requirePermissions(PERMISSIONS.SHIFT_MANAGE);

router.get('/current', canView, controller.current);
router.get('/', canView, validate(listShiftsSchema), controller.list);
router.get('/:id', canView, validate(getShiftSchema), controller.getOne);

router.post('/', canManage, validate(openShiftSchema), controller.open);
router.post('/:id/cash', canManage, validate(cashMovementSchema), controller.addCash);
router.post('/:id/close', canManage, validate(closeShiftSchema), controller.close);

export default router;
