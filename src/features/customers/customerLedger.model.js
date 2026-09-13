import mongoose from 'mongoose';

export const LEDGER_TYPES = Object.freeze({
  SALE: 'sale',
  PAYMENT: 'payment',
  REFUND: 'refund',
  ADJUSTMENT: 'adjustment',
});

export const LEDGER_TYPE_VALUES = Object.freeze(Object.values(LEDGER_TYPES));

/**
 * كشف حساب العميل — سطر لكل حركة على رصيده.
 * زي حركات المخزون: بنضيف عليه بس ومبنعدلش، عشان يفضل مرجع نقدر نراجع بيه أي رصيد.
 */
const customerLedgerSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
    },

    type: { type: String, enum: LEDGER_TYPE_VALUES, required: true },

    /** موجب = رصيد العميل بيزيد (دفع)، سالب = بيقل (بيع آجل). */
    amount: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },

    referenceType: { type: String, trim: true, default: null },
    reference: { type: mongoose.Schema.Types.ObjectId, default: null },

    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null },
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

customerLedgerSchema.index({ customer: 1, createdAt: -1 });
customerLedgerSchema.index({ reference: 1 });

export const CustomerLedger = mongoose.model(
  'CustomerLedger',
  customerLedgerSchema,
);

export default CustomerLedger;
