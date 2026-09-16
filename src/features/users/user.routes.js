import { Router } from 'express';

import { PERMISSIONS } from '../../core/constants/index.js';
import {
  authenticate,
  requirePermissions,
} from '../../middlewares/auth.middleware.js';
import validate from '../../middlewares/validate.middleware.js';

import * as controller from './user.controller.js';
import {
  createUserSchema,
  getUserSchema,
  listUsersSchema,
  resetPasswordSchema,
  roleParamSchema,
  setActiveStateSchema,
  updateRolePermissionsSchema,
  updatePermissionsSchema,
  updateUserSchema,
} from './user.validation.js';

const router = Router();

router.use(authenticate);

router.get('/catalog', requirePermissions(PERMISSIONS.USER_VIEW), controller.catalog);

// تعديل باقة الدور بيأثر على كل اللي عليه، فمربوط بإدارة المستخدمين.
router.patch(
  '/roles/:role',
  requirePermissions(PERMISSIONS.USER_MANAGE),
  validate(updateRolePermissionsSchema),
  controller.updateRolePermissions,
);

router.delete(
  '/roles/:role',
  requirePermissions(PERMISSIONS.USER_MANAGE),
  validate(roleParamSchema),
  controller.resetRolePermissions,
);

router.get(
  '/',
  requirePermissions(PERMISSIONS.USER_VIEW),
  validate(listUsersSchema),
  controller.list,
);

router.get(
  '/:id',
  requirePermissions(PERMISSIONS.USER_VIEW),
  validate(getUserSchema),
  controller.getOne,
);

router.post(
  '/',
  requirePermissions(PERMISSIONS.USER_MANAGE),
  validate(createUserSchema),
  controller.create,
);

router.patch(
  '/:id',
  requirePermissions(PERMISSIONS.USER_MANAGE),
  validate(updateUserSchema),
  controller.update,
);

router.patch(
  '/:id/password',
  requirePermissions(PERMISSIONS.USER_MANAGE),
  validate(resetPasswordSchema),
  controller.resetPassword,
);

router.patch(
  '/:id/permissions',
  requirePermissions(PERMISSIONS.USER_MANAGE),
  validate(updatePermissionsSchema),
  controller.updatePermissions,
);

router.patch(
  '/:id/active',
  requirePermissions(PERMISSIONS.USER_MANAGE),
  validate(setActiveStateSchema),
  controller.setActiveState,
);

export default router;
