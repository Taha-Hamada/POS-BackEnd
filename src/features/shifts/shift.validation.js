import { z } from 'zod';

import {
  idParam,
  objectId,
  paginationQuery,
} from '../../core/base/commonSchemas.js';
import { SHIFT_STATUS_VALUES } from '../../core/constants/index.js';

export const openShiftSchema = {
  body: z.object({
    branch: objectId.optional(),
    openingBalance: z.number().min(0, 'الرصيد الافتتاحي مينفعش يكون سالب'),
  }),
};

export const closeShiftSchema = {
  params: idParam,
  body: z.object({
    countedCash: z.number().min(0, 'المبلغ المعدود مينفعش يكون سالب'),
    note: z.string().trim().max(500).optional(),
  }),
};

export const cashMovementSchema = {
  params: idParam,
  body: z.object({
    direction: z.enum(['in', 'out']),
    amount: z.number().positive('المبلغ لازم يكون أكبر من صفر'),
    reason: z.string().trim().min(2, 'اكتب سبب الحركة').max(200),
  }),
};

export const listShiftsSchema = {
  query: paginationQuery.extend({
    branch: objectId.optional(),
    cashier: objectId.optional(),
    status: z.enum(SHIFT_STATUS_VALUES).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  }),
};

export const getShiftSchema = { params: idParam };

export default {
  openShiftSchema,
  closeShiftSchema,
  cashMovementSchema,
  listShiftsSchema,
  getShiftSchema,
};
