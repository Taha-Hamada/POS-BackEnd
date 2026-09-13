import mongoose from 'mongoose';

import { PAYMENT_METHOD_VALUES } from '../../core/constants/index.js';

const returnLineSchema = new mongoose.Schema(
  {
    /** سطر الفاتورة الأصلي — بيه بنعرف الكمية المسموح إرجاعها. */
    invoiceLine: { type: mongoose.Schema.Types.ObjectId, required: true },

    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    name: { type: String, required: true, trim: true },

    quantity: { type: Number, required: true, min: 0.001 },
    unitPrice: { type: Number, required: true, min: 0 },
    unitCost: { type: Number, required: true, min: 0 },

    /** نصيب السطر من الخصومات والضريبة، محسوب من الفاتورة الأصلية. */
    lineTotal: { type: Number, required: true, min: 0 },
    taxAmount: { type: Number, default: 0, min: 0 },

    /** الصنف رجع سليم ولا تالف — التالف مبيرجعش للمخزون. */
    restock: { type: Boolean, default: true },
    reason: { type: String, trim: true, default: '' },
  },
  { _id: true },
);

const returnSchema = new mongoose.Schema(
  {
    number: { type: String, trim: true, default: null },

    invoice: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Invoice',
      required: true,
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      required: true,
    },
    cashier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    shift: { type: mongoose.Schema.Types.ObjectId, ref: 'Shift', default: null },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      default: null,
    },

    lines: {
      type: [returnLineSchema],
      validate: {
        validator: (lines) => lines.length > 0,
        message: 'المرتجع لازم يكون فيه صنف واحد على الأقل',
      },
    },

    subtotal: { type: Number, required: true, min: 0 },
    taxAmount: { type: Number, default: 0, min: 0 },
    total: { type: Number, required: true, min: 0 },
    costTotal: { type: Number, default: 0, min: 0 },

    /**
     * طريقة رد الفلوس. لو credit فالمبلغ بيتخصم من مديونية العميل
     * بدل ما يتصرف كاش من الدرج.
     */
    refundMethod: {
      type: String,
      enum: PAYMENT_METHOD_VALUES,
      required: true,
    },

    reason: { type: String, trim: true, default: '' },
    note: { type: String, trim: true, default: '' },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

returnSchema.index(
  { number: 1 },
  { unique: true, partialFilterExpression: { number: { $type: 'string' } } },
);
returnSchema.index({ invoice: 1 });
returnSchema.index({ branch: 1, createdAt: -1 });
returnSchema.index({ customer: 1, createdAt: -1 });
returnSchema.index({ shift: 1 });

export const SaleReturn = mongoose.model('SaleReturn', returnSchema);

export default SaleReturn;
