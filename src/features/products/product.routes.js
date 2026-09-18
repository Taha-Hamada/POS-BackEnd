import { Router } from 'express';

import { PERMISSIONS } from '../../core/constants/index.js';
import {
  authenticate,
  requirePermissions,
} from '../../middlewares/auth.middleware.js';
import validate from '../../middlewares/validate.middleware.js';

import * as controller from './product.controller.js';
import { productImageUpload } from './product.upload.js';
import {
  barcodeSchema,
  createProductSchema,
  expiringSchema,
  getProductSchema,
  listProductsSchema,
  searchProductsSchema,
  setActiveStateSchema,
  updateProductSchema,
} from './product.validation.js';

const router = Router();

router.use(authenticate);

const canView = requirePermissions(PERMISSIONS.PRODUCT_VIEW);
const canManage = requirePermissions(PERMISSIONS.PRODUCT_MANAGE);

// المسارات الثابتة قبل /:id عشان متتفهمش كمعرّف.
router.get('/search', canView, validate(searchProductsSchema), controller.search);
router.get('/expiring', canView, validate(expiringSchema), controller.expiring);
router.get('/barcode/:barcode', canView, validate(barcodeSchema), controller.byBarcode);

router.get('/', canView, validate(listProductsSchema), controller.list);
router.get('/:id', canView, validate(getProductSchema), controller.getOne);

router.post('/', canManage, validate(createProductSchema), controller.create);
router.patch('/:id', canManage, validate(updateProductSchema), controller.update);
router.patch(
  '/:id/active',
  canManage,
  validate(setActiveStateSchema),
  controller.setActiveState,
);

// الصورة multipart مش JSON، فبتعدّي على الرفع بعد التحقق من المعرّف.
router.post(
  '/:id/image',
  canManage,
  validate(getProductSchema),
  productImageUpload,
  controller.uploadImage,
);
router.delete('/:id/image', canManage, validate(getProductSchema), controller.removeImage);

export default router;
