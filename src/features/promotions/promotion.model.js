import mongoose from 'mongoose';

import { PROMOTION_TYPE_VALUES } from '../../core/constants/index.js';

/** العرض بيتطبق على إيه: كل المنتجات، قسم واحد، أو منتجات مختارة. */
export const PROMOTION_SCOPES = Object.freeze({
  ALL: 'all',
  CATEGORY: 'category',
  PRODUCTS: 'products',
});

export const PROMOTION_SCOPE_VALUES = Object.freeze(Object.values(PROMOTION_SCOPES));

/**
 * عرض بيتطبق تلقائي على سطور الفاتورة.
 *
 * كل نوع بيستخدم حقول مختلفة، والخدمة هي اللي بتتأكد إن الحقول المطلوبة
 * للنوع موجودة — الموديل بيخزّن بس.
 */
const promotionSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, trim: true, default: '', maxlength: 300 },

    type: { type: String, enum: PROMOTION_TYPE_VALUES, required: true },

    /** نسبة الخصم — لعروض النسبة وخصم الكمية. */
    discountPercent: { type: Number, default: 0, min: 0, max: 100 },

    /** أقل كمية في السطر عشان خصم الكمية يشتغل. */
    minQuantity: { type: Number, default: 1, min: 1 },

    /** اشترِ [buyQuantity] واحصل على [getQuantity] مجانًا. */
    buyQuantity: { type: Number, default: 1, min: 1 },
    getQuantity: { type: Number, default: 1, min: 1 },

    scope: {
      type: String,
      enum: PROMOTION_SCOPE_VALUES,
      default: PROMOTION_SCOPES.ALL,
    },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
    products: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],

    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },

    /** الإيقاف اليدوي — العرض بيفضل في السجل من غير ما يتطبق. */
    isActive: { type: Boolean, default: true },

    /** عدد الفواتير اللي العرض اتطبق فيها. */
    usageCount: { type: Number, default: 0, min: 0 },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

promotionSchema.index({ isActive: 1, startsAt: 1, endsAt: 1 });
promotionSchema.index({ name: 'text' });

export const Promotion = mongoose.model('Promotion', promotionSchema);

export default Promotion;
