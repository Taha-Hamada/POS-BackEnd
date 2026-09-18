import { z } from 'zod';

import {
  booleanQuery,
  idParam,
  objectId,
  paginationQuery,
} from '../../core/base/commonSchemas.js';

import { LEDGER_TYPE_VALUES } from './customerLedger.model.js';

const phone = z
  .string()
  .trim()
  .min(7, 'رقم الموبايل قصير')
  .max(30)
  .regex(/^[0-9+\-\s()]+$/, 'رقم الموبايل فيه حروف مش مسموحة');

const customerBody = z.object({
  name: z.string().trim().min(2, 'الاسم قصير جدا').max(150),
  phone,
  email: z.string().trim().email('البريد غير صالح').nullish(),
  address: z.string().trim().max(300).optional(),
  note: z.string().trim().max(500).optional(),
  isActive: z.boolean().optional(),
});

export const listCustomersSchema = {
  query: paginationQuery.extend({
    isActive: booleanQuery.optional(),
    hasDebt: booleanQuery.optional(),
  }),
};

export const getCustomerSchema = { params: idParam };

export const phoneLookupSchema = { params: z.object({ phone }) };

export const createCustomerSchema = { body: customerBody };

export const updateCustomerSchema = {
  params: idParam,
  body: customerBody.partial().refine(
    (value) => Object.keys(value).length > 0,
    'لازم تبعت حقل واحد على الأقل للتعديل',
  ),
};

export const setActiveStateSchema = {
  params: idParam,
  body: z.object({ isActive: z.boolean() }),
};

export const paymentSchema = {
  params: idParam,
  body: z.object({
    amount: z.number().positive('المبلغ لازم يكون أكبر من صفر'),
    branch: objectId.optional(),
    note: z.string().trim().max(300).optional(),
  }),
};

export const adjustSchema = {
  params: idParam,
  body: z.object({
    amount: z.number().refine((value) => value !== 0, 'المبلغ مينفعش يكون صفر'),
    branch: objectId.optional(),
    note: z.string().trim().min(3, 'اكتب سبب التعديل').max(300),
  }),
};

export const ledgerSchema = {
  params: idParam,
  query: paginationQuery.extend({
    type: z.enum(LEDGER_TYPE_VALUES).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  }),
};

export default {
  listCustomersSchema,
  getCustomerSchema,
  phoneLookupSchema,
  createCustomerSchema,
  updateCustomerSchema,
  setActiveStateSchema,
  paymentSchema,
  adjustSchema,
  ledgerSchema,
};
