import { z } from 'zod';

import {
  booleanQuery,
  idParam,
  objectId,
  paginationQuery,
} from '../../core/base/commonSchemas.js';

const variant = z.object({
  size: z.string().trim().max(40).optional(),
  color: z.string().trim().max(40).optional(),
  sku: z.string().trim().max(40).optional(),
  barcode: z.string().trim().max(40).optional(),
  priceOverride: z.number().min(0).nullish(),
});

const productBody = z.object({
  name: z.string().trim().min(2, 'اسم المنتج قصير جدا').max(200),
  sku: z.string().trim().min(2).max(40),
  barcode: z.string().trim().min(4).max(40).nullish(),
  category: objectId,
  brand: z.string().trim().max(80).optional(),
  unit: z.string().trim().max(20).optional(),
  description: z.string().trim().max(500).optional(),
  price: z.number().min(0, 'السعر مينفعش يكون سالب'),
  cost: z.number().min(0, 'التكلفة مينفعش تكون سالبة'),
  minStock: z.number().int().min(0).optional(),
  trackStock: z.boolean().optional(),
  isTaxable: z.boolean().optional(),
  expiryDate: z.coerce.date().nullish(),
  variants: z.array(variant).max(50).optional(),
  // رابط خارجي، أو مسار صورة مرفوعة على السيرفر نفسه.
  imageUrl: z
    .string()
    .trim()
    .refine(
      (value) => value.startsWith('/uploads/') || z.string().url().safeParse(value).success,
      'رابط الصورة غير صالح',
    )
    .nullish(),
  colorIndex: z.number().int().min(0).max(20).optional(),
  isActive: z.boolean().optional(),
});

export const listProductsSchema = {
  query: paginationQuery.extend({
    category: objectId.optional(),
    brand: z.string().trim().optional(),
    branch: objectId.optional(),
    isActive: booleanQuery.optional(),
    isTaxable: booleanQuery.optional(),
  }),
};

export const getProductSchema = {
  params: idParam,
  query: z.object({ branch: objectId.optional() }),
};

export const searchProductsSchema = {
  query: z.object({
    search: z.string().trim().min(1, 'اكتب حاجة تدور عليها'),
    category: objectId.optional(),
    branch: objectId.optional(),
    limit: z.coerce.number().int().positive().max(50).optional(),
  }),
};

export const barcodeSchema = {
  params: z.object({ barcode: z.string().trim().min(4).max(40) }),
  query: z.object({ branch: objectId.optional() }),
};

export const createProductSchema = {
  body: productBody.extend({
    openingStock: z
      .object({ branch: objectId, quantity: z.number().int().min(0) })
      .optional(),
  }),
};

export const updateProductSchema = {
  params: idParam,
  body: productBody.partial().refine(
    (value) => Object.keys(value).length > 0,
    'لازم تبعت حقل واحد على الأقل للتعديل',
  ),
};

export const bulkPriceSchema = {
  body: z
    .object({
      productIds: z.array(objectId).min(1).max(500).optional(),
      category: objectId.optional(),
      mode: z.enum(['percentage', 'fixed']),
      value: z.number(),
    })
    .refine(
      (value) => Boolean(value.productIds?.length) || Boolean(value.category),
      'حدد منتجات أو قسم للتعديل',
    ),
};

export const setActiveStateSchema = {
  params: idParam,
  body: z.object({ isActive: z.boolean() }),
};

export const expiringSchema = {
  query: z.object({ days: z.coerce.number().int().positive().max(365).optional() }),
};

export default {
  listProductsSchema,
  getProductSchema,
  searchProductsSchema,
  barcodeSchema,
  createProductSchema,
  updateProductSchema,
  bulkPriceSchema,
  setActiveStateSchema,
  expiringSchema,
};
