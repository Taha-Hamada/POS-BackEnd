import { Router } from 'express';

import { PERMISSIONS } from '../../core/constants/index.js';
import {
  authenticate,
  requirePermissions,
} from '../../middlewares/auth.middleware.js';
import validate from '../../middlewares/validate.middleware.js';

import * as controller from './inventory.controller.js';
import {
  adjustSchema,
  listMovementsSchema,
  listStockSchema,
  lowStockSchema,
  minStockSchema,
  stocktakeSchema,
  transferSchema,
} from './inventory.validation.js';

const router = Router();

router.use(authenticate);

const canView = requirePermissions(PERMISSIONS.INVENTORY_VIEW);
const canAdjust = requirePermissions(PERMISSIONS.INVENTORY_ADJUST);
const canTransfer = requirePermissions(PERMISSIONS.INVENTORY_TRANSFER);

router.get('/stock', canView, validate(listStockSchema), controller.listStock);
router.get('/summary', canView, validate(lowStockSchema), controller.summary);
router.get('/movements', canView, validate(listMovementsSchema), controller.listMovements);
router.get('/low-stock', canView, validate(lowStockSchema), controller.lowStock);

router.post('/adjust', canAdjust, validate(adjustSchema), controller.adjust);
router.post('/stocktake', canAdjust, validate(stocktakeSchema), controller.stocktake);
router.post('/transfer', canTransfer, validate(transferSchema), controller.transfer);
router.patch('/min-stock', canAdjust, validate(minStockSchema), controller.setMinStock);

export default router;
