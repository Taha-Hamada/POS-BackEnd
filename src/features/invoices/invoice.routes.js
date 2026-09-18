import { Router } from 'express';

import { PERMISSIONS } from '../../core/constants/index.js';
import {
  authenticate,
  requirePermissions,
} from '../../middlewares/auth.middleware.js';
import validate from '../../middlewares/validate.middleware.js';

import * as controller from './invoice.controller.js';
import {
  createInvoiceSchema,
  getInvoiceSchema,
  listInvoicesSchema,
  numberLookupSchema,
  summarySchema,
  voidInvoiceSchema,
} from './invoice.validation.js';

const router = Router();

router.use(authenticate);

const canView = requirePermissions(PERMISSIONS.INVOICE_VIEW);
const canCreate = requirePermissions(PERMISSIONS.INVOICE_CREATE);
const canVoid = requirePermissions(PERMISSIONS.INVOICE_VOID);

router.get('/summary', canView, validate(summarySchema), controller.summary);
router.get('/number/:number', canView, validate(numberLookupSchema), controller.byNumber);

router.get('/', canView, validate(listInvoicesSchema), controller.list);
router.get('/:id', canView, validate(getInvoiceSchema), controller.getOne);

router.post('/', canCreate, validate(createInvoiceSchema), controller.create);
router.post('/:id/void', canVoid, validate(voidInvoiceSchema), controller.voidOne);

export default router;
