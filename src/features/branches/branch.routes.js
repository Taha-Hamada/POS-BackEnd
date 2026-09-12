import { Router } from 'express';

import { PERMISSIONS } from '../../core/constants/index.js';
import {
  authenticate,
  requirePermissions,
} from '../../middlewares/auth.middleware.js';
import validate from '../../middlewares/validate.middleware.js';

import * as controller from './branch.controller.js';
import {
  createBranchSchema,
  deleteBranchSchema,
  getBranchSchema,
  listBranchesSchema,
  setOpenStateSchema,
  updateBranchSchema,
} from './branch.validation.js';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  requirePermissions(PERMISSIONS.BRANCH_VIEW),
  validate(listBranchesSchema),
  controller.list,
);

router.get(
  '/:id',
  requirePermissions(PERMISSIONS.BRANCH_VIEW),
  validate(getBranchSchema),
  controller.getOne,
);

router.post(
  '/',
  requirePermissions(PERMISSIONS.BRANCH_MANAGE),
  validate(createBranchSchema),
  controller.create,
);

router.patch(
  '/:id',
  requirePermissions(PERMISSIONS.BRANCH_MANAGE),
  validate(updateBranchSchema),
  controller.update,
);

// فتح وقفل الفرع إجراء يومي، فمربوط بصلاحية العرض مش الإدارة.
router.patch(
  '/:id/open-state',
  requirePermissions(PERMISSIONS.BRANCH_VIEW),
  validate(setOpenStateSchema),
  controller.setOpenState,
);

router.delete(
  '/:id',
  requirePermissions(PERMISSIONS.BRANCH_MANAGE),
  validate(deleteBranchSchema),
  controller.deactivate,
);

export default router;
