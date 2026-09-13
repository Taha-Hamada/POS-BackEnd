import { z } from 'zod';

import {
  booleanQuery,
  idParam,
  paginationQuery,
} from '../../core/base/commonSchemas.js';

const phone = z
  .string()
  .trim()
  .min(7, 'رقم الموبايل قصير')
  .max(30)
  .regex(/^[0-9+\-\s()]+$/, 'رقم الموبايل فيه حروف مش مسموحة');

const supplierBody = z.object({
  name: z.string().trim().min(2, 'الاسم قصير جدا').max(150),
  phone,
  contactPerson: z.string().trim().max(120).optional(),
  email: z.string().trim().email('البريد غير صالح').nullish(),
  address: z.string().trim().max(300).optional(),
  taxNumber: z.string().trim().max(40).optional(),
  paymentTermDays: z.number().int().min(0).max(365).optional(),
  note: z.string().trim().max(500).optional(),
  isActive: z.boolean().optional(),
});

export const listSuppliersSchema = {
  query: paginationQuery.extend({
    isActive: booleanQuery.optional(),
    hasDue: booleanQuery.optional(),
  }),
};

export const getSupplierSchema = { params: idParam };

export const createSupplierSchema = { body: supplierBody };

export const updateSupplierSchema = {
  params: idParam,
  body: supplierBody.partial().refine(
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
    note: z.string().trim().max(300).optional(),
  }),
};

export default {
  listSuppliersSchema,
  getSupplierSchema,
  createSupplierSchema,
  updateSupplierSchema,
  setActiveStateSchema,
  paymentSchema,
};
