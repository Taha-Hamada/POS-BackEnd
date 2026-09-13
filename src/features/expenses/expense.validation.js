import { z } from 'zod';

import {
  idParam,
  objectId,
  paginationQuery,
} from '../../core/base/commonSchemas.js';
import {
  EXPENSE_STATUS_VALUES,
  PAYMENT_METHOD_VALUES,
} from '../../core/constants/index.js';

const expenseBody = z.object({
  branch: objectId.optional(),
  category: z.string().trim().min(2, 'اكتب بند المصروف').max(80),
  amount: z.number().positive('المبلغ لازم يكون أكبر من صفر'),
  date: z.coerce.date().optional(),
  paymentMethod: z.enum(PAYMENT_METHOD_VALUES).optional(),
  note: z.string().trim().max(500).optional(),
  attachmentUrl: z.string().trim().url('رابط المرفق غير صالح').nullish(),
});

export const listExpensesSchema = {
  query: paginationQuery.extend({
    branch: objectId.optional(),
    category: z.string().trim().optional(),
    status: z.enum(EXPENSE_STATUS_VALUES).optional(),
    createdBy: objectId.optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  }),
};

export const getExpenseSchema = { params: idParam };

export const createExpenseSchema = { body: expenseBody };

export const updateExpenseSchema = {
  params: idParam,
  body: expenseBody.partial().refine(
    (value) => Object.keys(value).length > 0,
    'لازم تبعت حقل واحد على الأقل للتعديل',
  ),
};

export const reviewExpenseSchema = {
  params: idParam,
  body: z
    .object({
      approve: z.boolean(),
      reason: z.string().trim().max(300).optional(),
    })
    .refine(
      (value) => value.approve || Boolean(value.reason),
      'الرفض لازم له سبب',
    ),
};

export const summarySchema = {
  query: z.object({
    branch: objectId.optional(),
    status: z.enum(EXPENSE_STATUS_VALUES).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  }),
};

export default {
  listExpensesSchema,
  getExpenseSchema,
  createExpenseSchema,
  updateExpenseSchema,
  reviewExpenseSchema,
  summarySchema,
};
