import mongoose from 'mongoose';

import { STOCK_MOVEMENT_REASON_VALUES } from '../../core/constants/index.js';

/**
 * سجل حركة مخزون — سطر واحد لكل تغيير في الرصيد.
 * ده المصدر اللي بنرجع له لما رصيد يبان غلط، فبنكتب فيه ومبنعدلش عليه أبدا.
 */
const stockMovementSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      required: true,
    },

    /** موجب = دخول للمخزن، سالب = خروج منه. */
    quantity: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },

    reason: {
      type: String,
      enum: STOCK_MOVEMENT_REASON_VALUES,
      required: true,
    },

    /** المستند اللي سبب الحركة — فاتورة أو أمر شراء أو مرتجع. */
    referenceType: { type: String, trim: true, default: null },
    reference: { type: mongoose.Schema.Types.ObjectId, default: null },

    unitCost: { type: Number, default: null, min: 0 },
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

stockMovementSchema.index({ product: 1, branch: 1, createdAt: -1 });
stockMovementSchema.index({ branch: 1, createdAt: -1 });
stockMovementSchema.index({ reference: 1 });

export const StockMovement = mongoose.model('StockMovement', stockMovementSchema);

export default StockMovement;
