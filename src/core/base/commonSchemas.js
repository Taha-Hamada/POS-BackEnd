import mongoose from 'mongoose';
import { z } from 'zod';

/** معرّف MongoDB — بنتحقق منه في طبقة التحقق بدل ما نستنى CastError من الداتابيز. */
export const objectId = z
  .string()
  .refine((value) => mongoose.Types.ObjectId.isValid(value), {
    message: 'معرّف غير صالح',
  });

export const idParam = z.object({ id: objectId });

export const paginationQuery = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  search: z.string().trim().min(1).optional(),
  sort: z.string().trim().optional(),
});

export const booleanQuery = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true');

export const dateRangeQuery = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

/**
 * التجميع (aggregate) مبيحوّلش النصوص لـ ObjectId زي الاستعلام العادي،
 * فأي مطابقة داخل pipeline لازم تعدي من هنا الأول وإلا هترجع فاضية من غير خطأ.
 */
export const toObjectId = (value) =>
  value instanceof mongoose.Types.ObjectId
    ? value
    : new mongoose.Types.ObjectId(String(value));

/** بيحوّل نص بحث لتعبير نمطي آمن — من غير الهروب ده أي قوس بيكسر الاستعلام. */
export const toSearchRegex = (search) =>
  new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

export default { objectId, idParam, paginationQuery, dateRangeQuery, toSearchRegex };
