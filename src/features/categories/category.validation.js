import { z } from 'zod';

import {
  booleanQuery,
  idParam,
  objectId,
  paginationQuery,
} from '../../core/base/commonSchemas.js';

const categoryBody = z.object({
  name: z.string().trim().min(2, 'اسم القسم قصير جدا').max(100),
  icon: z.string().trim().max(60).optional(),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'اللون لازم يكون بصيغة #RRGGBB')
    .optional(),
  parent: objectId.nullish(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export const listCategoriesSchema = {
  query: paginationQuery.extend({
    parent: z.union([z.literal('root'), objectId]).optional(),
    isActive: booleanQuery.optional(),
    withProductCount: booleanQuery.optional(),
  }),
};

export const getCategorySchema = { params: idParam };

export const createCategorySchema = { body: categoryBody };

export const updateCategorySchema = {
  params: idParam,
  body: categoryBody.partial().refine(
    (value) => Object.keys(value).length > 0,
    'لازم تبعت حقل واحد على الأقل للتعديل',
  ),
};

export const deleteCategorySchema = { params: idParam };

export default {
  listCategoriesSchema,
  getCategorySchema,
  createCategorySchema,
  updateCategorySchema,
  deleteCategorySchema,
};
