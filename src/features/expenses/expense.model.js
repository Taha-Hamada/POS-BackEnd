import mongoose from 'mongoose';

import {
  EXPENSE_STATUSES,
  EXPENSE_STATUS_VALUES,
  PAYMENT_METHODS,
  PAYMENT_METHOD_VALUES,
} from '../../core/constants/index.js';

const expenseSchema = new mongoose.Schema(
  {
    number: { type: String, trim: true, default: null },

    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      required: true,
    },

    /** بند المصروف كنص حر عشان كل متجر يسمي بنوده زي ما يحب. */
    category: { type: String, required: true, trim: true, maxlength: 80 },

    amount: { type: Number, required: true, min: 0.01 },
    date: { type: Date, required: true, default: Date.now },

    paymentMethod: {
      type: String,
      enum: PAYMENT_METHOD_VALUES,
      default: PAYMENT_METHODS.CASH,
    },

    /** المصروف الكاش بيتخصم من درج الوردية، فبنربطه بيها. */
    shift: { type: mongoose.Schema.Types.ObjectId, ref: 'Shift', default: null },

    status: {
      type: String,
      enum: EXPENSE_STATUS_VALUES,
      default: EXPENSE_STATUSES.PENDING,
    },

    note: { type: String, trim: true, default: '' },
    attachmentUrl: { type: String, trim: true, default: null },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    reviewedAt: { type: Date, default: null },
    rejectionReason: { type: String, trim: true, default: '' },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

expenseSchema.index(
  { number: 1 },
  { unique: true, partialFilterExpression: { number: { $type: 'string' } } },
);
expenseSchema.index({ branch: 1, date: -1 });
expenseSchema.index({ status: 1, date: -1 });
expenseSchema.index({ category: 1 });
expenseSchema.index({ shift: 1 });

export const Expense = mongoose.model('Expense', expenseSchema);

export default Expense;
