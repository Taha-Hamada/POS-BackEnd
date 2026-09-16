import {
  DISCOUNT_TYPES,
  PROMOTION_TYPES,
} from '../../core/constants/index.js';
import { round2 } from '../../core/utils/money.js';

import { PROMOTION_SCOPES } from './promotion.model.js';

/**
 * تطبيق العروض على سطور الفاتورة.
 *
 * دوال صافية زي حسبة الفاتورة: نفس المدخلات بتدي نفس الخصم، والكاشير
 * بيعمل نفس الخطوات بالظبط عشان الرقم اللي بيشوفه هو اللي بيتحصّل.
 */

const sameId = (a, b) => a != null && b != null && String(a) === String(b);

/** العرض يخص السطر ده؟ */
export const promotionAppliesTo = (promotion, line) => {
  switch (promotion.scope) {
    case PROMOTION_SCOPES.CATEGORY:
      return sameId(promotion.category, line.category);
    case PROMOTION_SCOPES.PRODUCTS:
      return (promotion.products ?? []).some((id) => sameId(id, line.product));
    default:
      return true;
  }
};

/** قيمة خصم عرض واحد على سطر — مبتعديش قيمة السطر أبدًا. */
export const promotionDiscountFor = (promotion, line) => {
  const gross = round2(line.unitPrice * line.quantity);
  let amount = 0;

  switch (promotion.type) {
    case PROMOTION_TYPES.PERCENTAGE:
      amount = (gross * promotion.discountPercent) / 100;
      break;

    case PROMOTION_TYPES.QUANTITY_DISCOUNT:
      amount =
        line.quantity >= promotion.minQuantity
          ? (gross * promotion.discountPercent) / 100
          : 0;
      break;

    case PROMOTION_TYPES.BUY_X_GET_Y: {
      // كل مجموعة كاملة (اشترِ + مجاني) بتدي القطع المجانية بتاعتها.
      const groupSize = promotion.buyQuantity + promotion.getQuantity;
      const freeUnits = Math.floor(line.quantity / groupSize) * promotion.getQuantity;
      amount = freeUnits * line.unitPrice;
      break;
    }

    default:
      amount = 0;
  }

  return round2(Math.min(Math.max(amount, 0), gross));
};

/**
 * بيحط على كل سطر أحسن عرض ليه.
 *
 * العروض مبتتجمعش على نفس السطر — العميل بياخد الأكبر بس. والسطر اللي
 * الكاشير حط عليه خصم يدوي بيفضل على خصمه، لأن ده قرار مقصود.
 */
export const applyPromotions = (lines, promotions = []) =>
  lines.map((line) => {
    if (line.discountType) return line;

    let best = null;
    let bestAmount = 0;

    for (const promotion of promotions) {
      if (!promotionAppliesTo(promotion, line)) continue;

      const amount = promotionDiscountFor(promotion, line);
      if (amount > bestAmount) {
        best = promotion;
        bestAmount = amount;
      }
    }

    if (!best) return line;

    return {
      ...line,
      discountType: DISCOUNT_TYPES.FIXED,
      discountValue: bestAmount,
      promotion: best._id,
      promotionName: best.name,
    };
  });

/** معرّفات العروض اللي اتطبقت فعلًا، من غير تكرار. */
export const appliedPromotionIds = (lines) => [
  ...new Set(lines.filter((line) => line.promotion).map((line) => String(line.promotion))),
];

export default {
  promotionAppliesTo,
  promotionDiscountFor,
  applyPromotions,
  appliedPromotionIds,
};
