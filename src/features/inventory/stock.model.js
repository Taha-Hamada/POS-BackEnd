import mongoose from 'mongoose';

/**
 * رصيد منتج واحد في فرع واحد.
 * فصل الرصيد عن المنتج بيخلي الفروع تعدّل كمياتها من غير ما تتزاحم على نفس المستند.
 */
const stockSchema = new mongoose.Schema(
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

    quantity: { type: Number, required: true, default: 0 },

    /**
     * تجاوز حد الطلب لهذا الفرع بس.
     * null معناها الفرع ماشي على حد الطلب المسجل على المنتج نفسه.
     */
    minStock: { type: Number, default: null, min: 0 },

    lastCountedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

stockSchema.index({ product: 1, branch: 1 }, { unique: true });
stockSchema.index({ branch: 1, quantity: 1 });

stockSchema.virtual('isOutOfStock').get(function isOutOfStock() {
  return this.quantity <= 0;
});

stockSchema.virtual('isLowStock').get(function isLowStock() {
  const threshold = this.minStock ?? 0;
  return this.quantity > 0 && this.quantity <= threshold;
});

export const Stock = mongoose.model('Stock', stockSchema);

export default Stock;
