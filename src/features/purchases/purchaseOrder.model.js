import mongoose from 'mongoose';

import {
  PURCHASE_ORDER_STATUSES,
  PURCHASE_ORDER_STATUS_VALUES,
} from '../../core/constants/index.js';

const orderLineSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    name: { type: String, required: true, trim: true },
    sku: { type: String, trim: true, default: '' },

    quantity: { type: Number, required: true, min: 0.001 },
    receivedQuantity: { type: Number, default: 0, min: 0 },

    unitCost: { type: Number, required: true, min: 0 },
    lineTotal: { type: Number, required: true, min: 0 },
  },
  { _id: true },
);

const purchaseOrderSchema = new mongoose.Schema(
  {
    number: { type: String, trim: true, default: null },

    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Supplier',
      required: true,
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      required: true,
    },

    status: {
      type: String,
      enum: PURCHASE_ORDER_STATUS_VALUES,
      default: PURCHASE_ORDER_STATUSES.DRAFT,
    },

    orderDate: { type: Date, default: Date.now },
    expectedDate: { type: Date, default: null },

    lines: {
      type: [orderLineSchema],
      validate: {
        validator: (lines) => lines.length > 0,
        message: 'أمر الشراء لازم يكون فيه صنف واحد على الأقل',
      },
    },

    subtotal: { type: Number, required: true, min: 0 },
    /** مصاريف شحن بتتوزع على التكلفة عند الاستلام. */
    shippingCost: { type: Number, default: 0, min: 0 },
    total: { type: Number, required: true, min: 0 },

    /** القيمة المستلمة فعلًا — هي اللي بتتحمّل على حساب المورد. */
    receivedValue: { type: Number, default: 0, min: 0 },

    note: { type: String, trim: true, default: '' },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    confirmedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    cancelReason: { type: String, trim: true, default: '' },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

purchaseOrderSchema.index(
  { number: 1 },
  { unique: true, partialFilterExpression: { number: { $type: 'string' } } },
);
purchaseOrderSchema.index({ supplier: 1, orderDate: -1 });
purchaseOrderSchema.index({ branch: 1, status: 1 });

purchaseOrderSchema.virtual('totalQuantity').get(function totalQuantity() {
  return this.lines.reduce((sum, line) => sum + line.quantity, 0);
});

purchaseOrderSchema.virtual('receivedQuantity').get(function receivedQuantity() {
  return this.lines.reduce((sum, line) => sum + line.receivedQuantity, 0);
});

/** نسبة الاستلام من 0 لـ 1 — شريط التقدم في شاشة المشتريات. */
purchaseOrderSchema.virtual('receivedRatio').get(function receivedRatio() {
  const ordered = this.totalQuantity;
  return ordered === 0 ? 0 : this.receivedQuantity / ordered;
});

export const PurchaseOrder = mongoose.model('PurchaseOrder', purchaseOrderSchema);

export default PurchaseOrder;
