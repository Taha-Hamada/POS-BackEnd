import { Router } from 'express';

import { PERMISSIONS } from '../../core/constants/index.js';
import {
  authenticate,
  requirePermissions,
} from '../../middlewares/auth.middleware.js';
import validate from '../../middlewares/validate.middleware.js';

import * as controller from './category.controller.js';
import {
  createCategorySchema,
  deleteCategorySchema,
  getCategorySchema,
  listCategoriesSchema,
  updateCategorySchema,
} from './category.validation.js';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  requirePermissions(PERMISSIONS.CATEGORY_VIEW),
  validate(listCategoriesSchema),
  controller.list,
);

router.get(
  '/:id',
  requirePermissions(PERMISSIONS.CATEGORY_VIEW),
  validate(getCategorySchema),
  controller.getOne,
);

router.post(
  '/',
  requirePermissions(PERMISSIONS.CATEGORY_MANAGE),
  validate(createCategorySchema),
  controller.create,
);

router.patch(
  '/:id',
  requirePermissions(PERMISSIONS.CATEGORY_MANAGE),
  validate(updateCategorySchema),
  controller.update,
);

router.delete(
  '/:id',
  requirePermissions(PERMISSIONS.CATEGORY_MANAGE),
  validate(deleteCategorySchema),
  controller.remove,
);

export default router;
