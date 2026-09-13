import mongoose from 'mongoose';

import {
  CUSTOMER_TIERS,
  CUSTOMER_TIER_VALUES,
} from '../../core/constants/index.js';

const customerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 150 },
    phone: { type: String, required: true, trim: true, maxlength: 30 },
    email: { type: String, trim: true, lowercase: true, default: null },
    address: { type: String, trim: true, default: '' },

    tier: {
      type: String,
      enum: CUSTOMER_TIER_VALUES,
      default: CUSTOMER_TIERS.REGULAR,
    },

    /**
     * موجب = العميل دافع مقدم وليه رصيد عندنا.
     * سالب = عليه فلوس آجل.
     * بيتعدّل من خدمة العملاء بس عشان يفضل متسق مع كشف الحساب.
     */
    balance: { type: Number, default: 0 },

    /** سقف الآجل المسموح — صفر معناه مفيش بيع آجل للعميل ده. */
    creditLimit: { type: Number, default: 0, min: 0 },

    points: { type: Number, default: 0, min: 0 },

    /** إجماليات تراكمية بتتحدّث مع كل فاتورة عشان القوايم تفضل سريعة. */
    totalPurchases: { type: Number, default: 0, min: 0 },
    ordersCount: { type: Number, default: 0, min: 0 },
    lastVisitAt: { type: Date, default: null },

    note: { type: String, trim: true, default: '' },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

customerSchema.index({ phone: 1 }, { unique: true });
customerSchema.index({ name: 'text' });
customerSchema.index({ tier: 1, isActive: 1 });
customerSchema.index({ balance: 1 });

customerSchema.virtual('isOverdue').get(function isOverdue() {
  return this.balance < 0;
});

/** الباقي المسموح بيه للبيع الآجل. */
customerSchema.virtual('availableCredit').get(function availableCredit() {
  return Math.max(0, this.creditLimit + Math.min(0, this.balance));
});

export const Customer = mongoose.model('Customer', customerSchema);

export default Customer;
