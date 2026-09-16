import { z } from 'zod';

import {
  booleanQuery,
  idParam,
  objectId,
  paginationQuery,
} from '../../core/base/commonSchemas.js';

const openingHours = z.object({
  from: z.string().regex(/^\d{2}:\d{2}$/, 'الصيغة لازم تكون HH:MM'),
  to: z.string().regex(/^\d{2}:\d{2}$/, 'الصيغة لازم تكون HH:MM'),
});

const branchBody = z.object({
  name: z.string().trim().min(2, 'اسم الفرع قصير جدًا').max(120),
  code: z.string().trim().min(2).max(20),
  address: z.string().trim().max(300).optional(),
  phone: z.string().trim().max(30).optional(),
  isMain: z.boolean().optional(),
  isOpen: z.boolean().optional(),
  openingHours: openingHours.optional(),
  /** null بيشيل المسؤول عن الفرع. */
  manager: objectId.nullish(),
});

export const listBranchesSchema = {
  query: paginationQuery.extend({
    isActive: booleanQuery.optional(),
    isOpen: booleanQuery.optional(),
  }),
};

export const getBranchSchema = { params: idParam };

export const createBranchSchema = { body: branchBody };

export const updateBranchSchema = {
  params: idParam,
  body: branchBody.partial().refine(
    (value) => Object.keys(value).length > 0,
    'لازم تبعت حقل واحد على الأقل للتعديل',
  ),
};

export const deleteBranchSchema = { params: idParam };

export const setOpenStateSchema = {
  params: idParam,
  body: z.object({ isOpen: z.boolean() }),
};

export default {
  listBranchesSchema,
  getBranchSchema,
  createBranchSchema,
  updateBranchSchema,
  deleteBranchSchema,
  setOpenStateSchema,
};
