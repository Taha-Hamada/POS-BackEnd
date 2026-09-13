import { z } from 'zod';

import {
  idParam,
  objectId,
  paginationQuery,
} from '../../core/base/commonSchemas.js';
import { PAYMENT_METHOD_VALUES } from '../../core/constants/index.js';

const returnLine = z.object({
  invoiceLine: objectId,
  quantity: z.number().positive('الكمية لازم تكون أكبر من صفر'),
  restock: z.boolean().optional(),
  reason: z.string().trim().max(200).optional(),
});

export const createReturnSchema = {
  body: z.object({
    invoice: objectId,
    lines: z.array(returnLine).min(1, 'اختار صنف واحد على الأقل').max(200),
    refundMethod: z.enum(PAYMENT_METHOD_VALUES),
    shift: objectId.nullish(),
    reason: z.string().trim().max(300).optional(),
    note: z.string().trim().max(500).optional(),
  }),
};

export const listReturnsSchema = {
  query: paginationQuery.extend({
    branch: objectId.optional(),
    invoice: objectId.optional(),
    customer: objectId.optional(),
    shift: objectId.optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  }),
};

export const getReturnSchema = { params: idParam };

export const returnableSchema = {
  params: z.object({ invoiceId: objectId }),
};

export const summarySchema = {
  query: z.object({
    branch: objectId.optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  }),
};

export default {
  createReturnSchema,
  listReturnsSchema,
  getReturnSchema,
  returnableSchema,
  summarySchema,
};
