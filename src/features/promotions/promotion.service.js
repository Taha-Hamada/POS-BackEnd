import { toSearchRegex } from '../../core/base/commonSchemas.js';
import { PROMOTION_TYPES } from '../../core/constants/index.js';
import ApiError from '../../core/errors/ApiError.js';
import Category from '../categories/category.model.js';
import Product from '../products/product.model.js';

import { PROMOTION_SCOPES } from './promotion.model.js';
import promotionRepository from './promotion.repository.js';

const POPULATE = [
  { path: 'category', select: 'name' },
  { path: 'products', select: 'name sku' },
];

/** حالة العرض محسوبة من التواريخ والإيقاف — مش متخزّنة عشان متقدمش. */
export const statusOf = (promotion, now = new Date()) => {
  if (!promotion.isActive) return 'stopped';
  if (new Date(promotion.startsAt) > now) return 'scheduled';
  if (new Date(promotion.endsAt) < now) return 'expired';
  return 'active';
};

const statusFilter = (status, now) => {
  switch (status) {
    case 'stopped':
      return { isActive: false };
    case 'scheduled':
      return { isActive: true, startsAt: { $gt: now } };
    case 'expired':
      return { isActive: true, endsAt: { $lt: now } };
    case 'active':
      return { isActive: true, startsAt: { $lte: now }, endsAt: { $gte: now } };
    default:
      return {};
  }
};

const withStatus = (promotion) => {
  const plain = promotion.toJSON ? promotion.toJSON() : promotion;
  return { ...plain, status: statusOf(plain) };
};

/**
 * بيتأكد إن العرض كامل ومنطقي بعد دمج التعديل مع القديم.
 * الرسايل بالعربي لأنها بتظهر للمدير في حوار العرض زي ما هي.
 */
const assertShape = async (promotion) => {
  if (new Date(promotion.endsAt) <= new Date(promotion.startsAt)) {
    throw ApiError.badRequest('تاريخ النهاية لازم يكون بعد تاريخ البداية');
  }

  switch (promotion.type) {
    case PROMOTION_TYPES.PERCENTAGE:
      if (!(promotion.discountPercent > 0)) {
        throw ApiError.badRequest('حدد نسبة الخصم');
      }
      break;

    case PROMOTION_TYPES.QUANTITY_DISCOUNT:
      if (!(promotion.discountPercent > 0)) {
        throw ApiError.badRequest('حدد نسبة الخصم');
      }
      if (!(promotion.minQuantity >= 2)) {
        throw ApiError.badRequest('خصم الكمية محتاج حد أدنى قطعتين على الأقل');
      }
      break;

    case PROMOTION_TYPES.BUY_X_GET_Y:
      if (!(promotion.buyQuantity >= 1) || !(promotion.getQuantity >= 1)) {
        throw ApiError.badRequest('حدد عدد القطع المشتراة والمجانية');
      }
      break;

    default:
      throw ApiError.badRequest('نوع العرض غير معروف');
  }

  if (promotion.scope === PROMOTION_SCOPES.CATEGORY) {
    if (!promotion.category) throw ApiError.badRequest('اختار القسم اللي العرض عليه');

    const exists = await Category.exists({ _id: promotion.category });
    if (!exists) throw ApiError.badRequest('القسم المختار غير موجود');
  }

  if (promotion.scope === PROMOTION_SCOPES.PRODUCTS) {
    const ids = promotion.products ?? [];
    if (ids.length === 0) throw ApiError.badRequest('اختار منتج واحد على الأقل');

    const found = await Product.countDocuments({ _id: { $in: ids } });
    if (found !== new Set(ids.map(String)).size) {
      throw ApiError.badRequest('في منتج مختار مش موجود');
    }
  }
};

/** بيشيل حقول النطاق اللي مش مستخدمة عشان متتطبقش بالغلط بعدين. */
const normalizeScope = (payload) => {
  const scope = payload.scope ?? PROMOTION_SCOPES.ALL;

  return {
    ...payload,
    scope,
    category: scope === PROMOTION_SCOPES.CATEGORY ? payload.category : null,
    products: scope === PROMOTION_SCOPES.PRODUCTS ? payload.products : [],
  };
};

export const listPromotions = async ({ page, limit, sort, search, status, type }) => {
  const now = new Date();
  const filter = { ...statusFilter(status, now) };

  if (type) filter.type = type;
  if (search) filter.name = toSearchRegex(search);

  const { items, pagination } = await promotionRepository.paginate(filter, {
    page,
    limit,
    sort: sort ?? '-startsAt',
    populate: POPULATE,
  });

  return { items: items.map(withStatus), pagination };
};

/** عدد العروض في كل حالة — لشرائح الفلترة فوق الشبكة. */
export const getPromotionsSummary = async () => {
  const now = new Date();
  const statuses = ['active', 'scheduled', 'expired', 'stopped'];

  const counts = await Promise.all(
    statuses.map((status) => promotionRepository.count(statusFilter(status, now))),
  );

  return Object.fromEntries(statuses.map((status, i) => [status, counts[i]]));
};

/** العروض الشغالة دلوقتي — الكاشير بيحمّلها عشان يعرض نفس خصم السيرفر. */
export const listLivePromotions = async () => {
  const promotions = await promotionRepository.findLive();
  return promotions.map(withStatus);
};

export const getPromotionById = async (id) => {
  const promotion = await promotionRepository.findById(id, {
    populate: POPULATE,
    lean: true,
  });

  if (!promotion) throw ApiError.notFound('العرض غير موجود');
  return withStatus(promotion);
};

export const createPromotion = async (payload, { userId } = {}) => {
  const normalized = normalizeScope(payload);
  await assertShape(normalized);

  const promotion = await promotionRepository.create({
    ...normalized,
    createdBy: userId ?? null,
  });

  return withStatus(await promotion.populate(POPULATE));
};

export const updatePromotion = async (id, payload) => {
  const promotion = await promotionRepository.findById(id);
  if (!promotion) throw ApiError.notFound('العرض غير موجود');

  const current = promotion.toObject();
  const merged = normalizeScope({
    ...current,
    ...payload,
    // لو النطاق ماتغيرش، بنحتفظ بحقوله القديمة بدل ما تتمسح.
    category: payload.category !== undefined ? payload.category : current.category,
    products: payload.products ?? current.products,
  });

  await assertShape(merged);

  Object.assign(promotion, {
    ...payload,
    scope: merged.scope,
    category: merged.category,
    products: merged.products,
  });
  await promotion.save();

  return withStatus(await promotion.populate(POPULATE));
};

export const setPromotionActive = async (id, isActive) => {
  const promotion = await promotionRepository.findById(id);
  if (!promotion) throw ApiError.notFound('العرض غير موجود');

  promotion.isActive = isActive;
  await promotion.save();

  return withStatus(await promotion.populate(POPULATE));
};

export default {
  statusOf,
  listPromotions,
  getPromotionsSummary,
  listLivePromotions,
  getPromotionById,
  createPromotion,
  updatePromotion,
  setPromotionActive,
};
