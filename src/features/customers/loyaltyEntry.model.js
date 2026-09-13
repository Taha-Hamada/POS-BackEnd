import mongoose from 'mongoose';

import { LOYALTY_ENTRY_TYPE_VALUES } from '../../core/constants/index.js';

/** سجل نقط الولاء — سطر لكل كسب أو استبدال أو تعديل. */
const loyaltyEntrySchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
    },

    type: { type: String, enum: LOYALTY_ENTRY_TYPE_VALUES, required: true },

    /** موجب = نقط زادت، سالب = نقط اتستهلكت. */
    points: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },

    /** قيمة الاستبدال بالعملة — بتتحسب وقت الاستبدال بس. */
    valueAmount: { type: Number, default: 0, min: 0 },

    referenceType: { type: String, trim: true, default: null },
    reference: { type: mongoose.Schema.Types.ObjectId, default: null },

    note: { type: String, trim: true, default: '' },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

loyaltyEntrySchema.index({ customer: 1, createdAt: -1 });
loyaltyEntrySchema.index({ reference: 1 });

export const LoyaltyEntry = mongoose.model('LoyaltyEntry', loyaltyEntrySchema);

export default LoyaltyEntry;
