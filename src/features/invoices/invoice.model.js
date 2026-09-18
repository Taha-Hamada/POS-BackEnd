import mongoose from 'mongoose';

import {
  DISCOUNT_TYPE_VALUES,
  INVOICE_STATUSES,
  INVOICE_STATUS_VALUES,
  PAYMENT_METHOD_VALUES,
} from '../../core/constants/index.js';

/**
 * سطر الفاتورة بيخزن اسم المنتج وسعره وقت البيع.
 * لو المنتج اتغير سعره أو اتمسح بعدين، الفاتورة القديمة تفضل تعرض اللي حصل فعلا.
 */
const invoiceLineSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    name: { type: String, required: true, trim: true },
    sku: { type: String, trim: true, default: '' },
    unit: { type: String, trim: true, default: '' },

    quantity: { type: Number, required: true, min: 0.001 },
    unitPrice: { type: Number, required: true, min: 0 },
    unitCost: { type: Number, required: true, min: 0 },

    discountType: { type: String, enum: DISCOUNT_TYPE_VALUES, default: null },
    discountValue: { type: Number, default: 0, min: 0 },
    discountAmount: { type: Number, default: 0, min: 0 },

    /** العرض اللي عمل خصم السطر، لو الخصم جه من عرض مش من الكاشير. */
    promotion: { type: mongoose.Schema.Types.ObjectId, ref: 'Promotion', default: null },
    promotionName: { type: String, trim: true, default: '' },

    isTaxable: { type: Boolean, default: true },
    taxAmount: { type: Number, default: 0, min: 0 },

    /** الإجمالي بعد الخصم وقبل الضريبة. */
    lineTotal: { type: Number, required: true, min: 0 },

    returnedQuantity: { type: Number, default: 0, min: 0 },
  },
  { _id: true },
);

const paymentSchema = new mongoose.Schema(
  {
    method: { type: String, enum: PAYMENT_METHOD_VALUES, required: true },
    amount: { type: Number, required: true, min: 0 },
    reference: { type: String, trim: true, default: '' },
  },
  { _id: false },
);

const invoiceSchema = new mongoose.Schema(
  {
    /** رقم مقروء للبشر زي INV-000123 — بيتولّد عند اعتماد الفاتورة. */
    number: { type: String, trim: true, default: null },

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

    status: {
      type: String,
      enum: INVOICE_STATUS_VALUES,
      default: INVOICE_STATUSES.COMPLETED,
    },

    lines: {
      type: [invoiceLineSchema],
      validate: {
        validator: (lines) => lines.length > 0,
        message: 'الفاتورة لازم يكون فيها صنف واحد على الأقل',
      },
    },

    /** خصم على مستوى الفاتورة كلها، غير خصومات السطور. */
    discountType: { type: String, enum: DISCOUNT_TYPE_VALUES, default: null },
    discountValue: { type: Number, default: 0, min: 0 },

    subtotal: { type: Number, required: true, min: 0 },
    lineDiscountTotal: { type: Number, default: 0, min: 0 },

    /** خصم الفاتورة اليدوي. */
    invoiceDiscount: { type: Number, default: 0, min: 0 },
    taxRate: { type: Number, default: 0, min: 0, max: 1 },
    taxAmount: { type: Number, default: 0, min: 0 },
    total: { type: Number, required: true, min: 0 },

    /** التكلفة وقت البيع — بنخزنها عشان تقرير الأرباح ميعتمدش على تكلفة النهاردة. */
    costTotal: { type: Number, default: 0, min: 0 },

    payments: { type: [paymentSchema], default: [] },
    paidAmount: { type: Number, default: 0, min: 0 },
    creditAmount: { type: Number, default: 0, min: 0 },
    changeDue: { type: Number, default: 0, min: 0 },

    returnedTotal: { type: Number, default: 0, min: 0 },

    /** اسم التبويب في شاشة البيع لما الكاشير بيشتغل على أكتر من فاتورة. */
    label: { type: String, trim: true, default: '' },
    note: { type: String, trim: true, default: '' },

    voidedAt: { type: Date, default: null },
    voidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    voidReason: { type: String, trim: true, default: '' },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

invoiceSchema.index(
  { number: 1 },
  { unique: true, partialFilterExpression: { number: { $type: 'string' } } },
);
invoiceSchema.index({ branch: 1, createdAt: -1 });
invoiceSchema.index({ customer: 1, createdAt: -1 });
invoiceSchema.index({ cashier: 1, createdAt: -1 });
invoiceSchema.index({ shift: 1 });
invoiceSchema.index({ status: 1, createdAt: -1 });

invoiceSchema.virtual('profit').get(function profit() {
  return Math.round((this.total - this.taxAmount - this.costTotal) * 100) / 100;
});

invoiceSchema.virtual('itemsCount').get(function itemsCount() {
  return this.lines.reduce((sum, line) => sum + line.quantity, 0);
});

export const Invoice = mongoose.model('Invoice', invoiceSchema);

export default Invoice;
