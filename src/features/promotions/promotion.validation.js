import { z } from 'zod';

import {
  idParam,
  objectId,
  paginationQuery,
} from '../../core/base/commonSchemas.js';
import { PROMOTION_TYPE_VALUES } from '../../core/constants/index.js';

import { PROMOTION_SCOPE_VALUES } from './promotion.model.js';

export const PROMOTION_STATUS_VALUES = Object.freeze([
  'active',
  'scheduled',
  'expired',
  'stopped',
]);

/**
 * الحقول بس هنا — الشروط اللي بتعتمد على نوع العرض (زي إن خصم الكمية محتاج
 * حد أدنى) بتتفحص في الخدمة على العرض بعد الدمج، عشان التعديل الجزئي يتفحص صح.
 */
const promotionBody = z.object({
  name: z.string().trim().min(2, 'اسم العرض قصير جدًا').max(120),
  description: z.string().trim().max(300).optional(),
  type: z.enum(PROMOTION_TYPE_VALUES),
  discountPercent: z.number().min(0).max(100).optional(),
  minQuantity: z.number().int().min(1).optional(),
  buyQuantity: z.number().int().min(1).optional(),
  getQuantity: z.number().int().min(1).optional(),
  scope: z.enum(PROMOTION_SCOPE_VALUES).optional(),
  category: objectId.nullish(),
  products: z.array(objectId).max(500).optional(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  isActive: z.boolean().optional(),
});

export const listPromotionsSchema = {
  query: paginationQuery.extend({
    status: z.enum(PROMOTION_STATUS_VALUES).optional(),
    type: z.enum(PROMOTION_TYPE_VALUES).optional(),
  }),
};

export const getPromotionSchema = { params: idParam };

export const createPromotionSchema = { body: promotionBody };

export const updatePromotionSchema = {
  params: idParam,
  body: promotionBody.partial().refine(
    (value) => Object.keys(value).length > 0,
    'لازم تبعت حقل واحد على الأقل للتعديل',
  ),
};

export const setActiveSchema = {
  params: idParam,
  body: z.object({ isActive: z.boolean() }),
};

export default {
  listPromotionsSchema,
  getPromotionSchema,
  createPromotionSchema,
  updatePromotionSchema,
  setActiveSchema,
};
