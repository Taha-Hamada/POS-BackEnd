import { z } from 'zod';

import {
  idParam,
  objectId,
  paginationQuery,
} from '../../core/base/commonSchemas.js';
import { PURCHASE_ORDER_STATUS_VALUES } from '../../core/constants/index.js';

const orderLine = z.object({
  product: objectId,
  quantity: z.number().positive('الكمية لازم تكون أكبر من صفر'),
  unitCost: z.number().min(0).optional(),
});

export const createOrderSchema = {
  body: z.object({
    supplier: objectId,
    branch: objectId.optional(),
    lines: z.array(orderLine).min(1, 'ضيف صنف واحد على الأقل').max(200),
    expectedDate: z.coerce.date().nullish(),
    shippingCost: z.number().min(0).optional(),
    note: z.string().trim().max(500).optional(),
  }),
};

export const updateOrderSchema = {
  params: idParam,
  body: z
    .object({
      lines: z.array(orderLine).min(1).max(200),
      expectedDate: z.coerce.date().nullable(),
      shippingCost: z.number().min(0),
      note: z.string().trim().max(500),
    })
    .partial()
    .refine(
      (value) => Object.keys(value).length > 0,
      'لازم تبعت حقل واحد على الأقل للتعديل',
    ),
};

export const receiveOrderSchema = {
  params: idParam,
  body: z.object({
    lines: z
      .array(
        z.object({
          orderLine: objectId,
          quantity: z.number().positive('الكمية لازم تكون أكبر من صفر'),
          unitCost: z.number().min(0).optional(),
        }),
      )
      .min(1, 'حدد صنف واحد على الأقل للاستلام'),
    updateCost: z.boolean().optional(),
  }),
};

export const cancelOrderSchema = {
  params: idParam,
  body: z.object({
    reason: z.string().trim().min(3, 'اكتب سبب الإلغاء').max(300),
  }),
};

export const listOrdersSchema = {
  query: paginationQuery.extend({
    supplier: objectId.optional(),
    branch: objectId.optional(),
    status: z.enum(PURCHASE_ORDER_STATUS_VALUES).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  }),
};

export const summarySchema = {
  query: z.object({
    branch: objectId.optional(),
    supplier: objectId.optional(),
  }),
};

export const getOrderSchema = { params: idParam };

export default {
  createOrderSchema,
  updateOrderSchema,
  receiveOrderSchema,
  cancelOrderSchema,
  listOrdersSchema,
  summarySchema,
  getOrderSchema,
};
