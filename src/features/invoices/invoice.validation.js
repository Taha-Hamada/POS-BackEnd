import { z } from 'zod';

import {
  idParam,
  objectId,
  paginationQuery,
} from '../../core/base/commonSchemas.js';
import {
  DISCOUNT_TYPE_VALUES,
  INVOICE_STATUS_VALUES,
  PAYMENT_METHOD_VALUES,
} from '../../core/constants/index.js';

const discount = z.object({
  type: z.enum(DISCOUNT_TYPE_VALUES),
  value: z.number().min(0),
});

const saleLine = z.object({
  product: objectId,
  variantId: objectId.optional(),
  quantity: z.number().positive('الكمية لازم تكون أكبر من صفر'),
  discountType: z.enum(DISCOUNT_TYPE_VALUES).nullish(),
  discountValue: z.number().min(0).optional(),
});

const payment = z.object({
  method: z.enum(PAYMENT_METHOD_VALUES),
  amount: z.number().min(0),
  reference: z.string().trim().max(80).optional(),
});

const saleBase = z.object({
  branch: objectId.optional(),
  shift: objectId.nullish(),
  customer: objectId.nullish(),
  lines: z.array(saleLine).min(1, 'الفاتورة لازم يكون فيها صنف واحد على الأقل').max(200),
  discount: discount.nullish(),
  label: z.string().trim().max(60).optional(),
  note: z.string().trim().max(500).optional(),
});

export const createInvoiceSchema = {
  body: saleBase.extend({
    payments: z.array(payment).min(1, 'لازم تحدد طريقة دفع واحدة على الأقل').max(6),
  }),
};

export const holdInvoiceSchema = { body: saleBase };

export const checkoutHeldSchema = {
  params: idParam,
  body: z.object({
    payments: z.array(payment).min(1).max(6),
    discount: discount.nullish(),
    customer: objectId.nullish(),
  }),
};

export const listInvoicesSchema = {
  query: paginationQuery.extend({
    branch: objectId.optional(),
    cashier: objectId.optional(),
    customer: objectId.optional(),
    shift: objectId.optional(),
    status: z.enum(INVOICE_STATUS_VALUES).optional(),
    paymentMethod: z.enum(PAYMENT_METHOD_VALUES).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    minTotal: z.coerce.number().min(0).optional(),
    maxTotal: z.coerce.number().min(0).optional(),
  }),
};

export const listHeldSchema = {
  query: z.object({
    branch: objectId.optional(),
    cashier: objectId.optional(),
  }),
};

export const getInvoiceSchema = { params: idParam };

export const numberLookupSchema = {
  params: z.object({ number: z.string().trim().min(3).max(40) }),
};

export const voidInvoiceSchema = {
  params: idParam,
  body: z.object({
    reason: z.string().trim().min(3, 'اكتب سبب الإلغاء').max(300),
  }),
};

export const summarySchema = {
  query: z.object({
    branch: objectId.optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  }),
};

export default {
  createInvoiceSchema,
  holdInvoiceSchema,
  checkoutHeldSchema,
  listInvoicesSchema,
  listHeldSchema,
  getInvoiceSchema,
  numberLookupSchema,
  voidInvoiceSchema,
  summarySchema,
};
