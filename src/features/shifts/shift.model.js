import mongoose from 'mongoose';

import {
  SHIFT_STATUSES,
  SHIFT_STATUS_VALUES,
} from '../../core/constants/index.js';

/** حركة كاش يدوية جوه الوردية: إيداع في الدرج أو سحب منه. */
const cashMovementSchema = new mongoose.Schema(
  {
    direction: { type: String, enum: ['in', 'out'], required: true },
    amount: { type: Number, required: true, min: 0.01 },
    reason: { type: String, trim: true, default: '' },
    at: { type: Date, default: Date.now },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { _id: true },
);

const shiftSchema = new mongoose.Schema(
  {
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

    status: {
      type: String,
      enum: SHIFT_STATUS_VALUES,
      default: SHIFT_STATUSES.OPEN,
    },

    openedAt: { type: Date, default: Date.now },
    closedAt: { type: Date, default: null },

    openingBalance: { type: Number, required: true, min: 0 },

    cashMovements: { type: [cashMovementSchema], default: [] },

    /**
     * أرقام التقفيل — بتتحسب من الفواتير وقت الإقفال وبتتجمّد هنا،
     * عشان التقرير مايتغيرش لو حصل تعديل على فاتورة قديمة بعد كده.
     */
    closing: {
      countedCash: { type: Number, default: null },
      expectedCash: { type: Number, default: null },
      difference: { type: Number, default: null },
      salesTotal: { type: Number, default: null },
      invoicesCount: { type: Number, default: null },
      returnsTotal: { type: Number, default: null },
      byMethod: { type: mongoose.Schema.Types.Mixed, default: null },

      // الأرقام دي كانت ناقصة، فتقرير أي وردية مقفولة كان بيطلع فيها أصفار.
      cashSales: { type: Number, default: null },
      cashIn: { type: Number, default: null },
      cashOut: { type: Number, default: null },
      cashRefunds: { type: Number, default: null },
      cashExpenses: { type: Number, default: null },
      profit: { type: Number, default: null },
      taxTotal: { type: Number, default: null },
      discountTotal: { type: Number, default: null },
      note: { type: String, trim: true, default: '' },
      closedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
      },
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

shiftSchema.index(
  { number: 1 },
  { unique: true, partialFilterExpression: { number: { $type: 'string' } } },
);
shiftSchema.index({ branch: 1, openedAt: -1 });
shiftSchema.index({ cashier: 1, status: 1 });

// وردية مفتوحة واحدة بس لكل كاشير في أي وقت.
shiftSchema.index(
  { cashier: 1 },
  {
    unique: true,
    partialFilterExpression: { status: SHIFT_STATUSES.OPEN },
    name: 'one_open_shift_per_cashier',
  },
);

shiftSchema.virtual('cashIn').get(function cashIn() {
  return sumMovements(this.cashMovements, 'in');
});

shiftSchema.virtual('cashOut').get(function cashOut() {
  return sumMovements(this.cashMovements, 'out');
});

const sumMovements = (movements, direction) =>
  Math.round(
    (movements ?? [])
      .filter((movement) => movement.direction === direction)
      .reduce((sum, movement) => sum + movement.amount, 0) * 100,
  ) / 100;

export const Shift = mongoose.model('Shift', shiftSchema);

export default Shift;
