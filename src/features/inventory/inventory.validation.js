import { z } from 'zod';

import { objectId, paginationQuery } from '../../core/base/commonSchemas.js';
import { STOCK_MOVEMENT_REASON_VALUES } from '../../core/constants/index.js';

export const listStockSchema = {
  query: paginationQuery.extend({
    branch: objectId.optional(),
    category: objectId.optional(),
    status: z.enum(['all', 'ok', 'low', 'out']).optional(),
  }),
};

export const listMovementsSchema = {
  query: paginationQuery.extend({
    branch: objectId.optional(),
    product: objectId.optional(),
    reason: z.enum(STOCK_MOVEMENT_REASON_VALUES).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  }),
};

export const adjustSchema = {
  body: z.object({
    product: objectId,
    branch: objectId.optional(),
    // الفرق مش الرصيد النهائي: موجب بيزود وسالب بينقص.
    quantity: z.number().int().refine((value) => value !== 0, 'الكمية مينفعش تكون صفر'),
    note: z.string().trim().max(300).optional(),
  }),
};

export const stocktakeSchema = {
  body: z.object({
    product: objectId,
    branch: objectId.optional(),
    countedQuantity: z.number().int().min(0),
    note: z.string().trim().max(300).optional(),
  }),
};

export const transferSchema = {
  body: z.object({
    product: objectId,
    fromBranch: objectId,
    toBranch: objectId,
    quantity: z.number().int().positive('الكمية لازم تكون أكبر من صفر'),
    note: z.string().trim().max(300).optional(),
  }),
};

export const minStockSchema = {
  body: z.object({
    product: objectId,
    branch: objectId.optional(),
    minStock: z.number().int().min(0),
  }),
};

export const lowStockSchema = {
  query: z.object({
    branch: objectId.optional(),
    limit: z.coerce.number().int().positive().max(200).optional(),
  }),
};

export default {
  listStockSchema,
  listMovementsSchema,
  adjustSchema,
  stocktakeSchema,
  transferSchema,
  minStockSchema,
  lowStockSchema,
};
