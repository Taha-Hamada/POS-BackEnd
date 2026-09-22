import mongoose from 'mongoose';

/** متغير المنتج (مقاس/لون) — ليه SKU وسعر خاص لو اتحدد. */
const variantSchema = new mongoose.Schema(
  {
    size: { type: String, trim: true, default: '' },
    color: { type: String, trim: true, default: '' },
    sku: { type: String, trim: true, default: '' },
    barcode: { type: String, trim: true, default: '' },
    priceOverride: { type: Number, default: null, min: 0 },
  },
  { _id: true },
);

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 200 },
    sku: { type: String, required: true, trim: true, uppercase: true, maxlength: 40 },
    barcode: { type: String, trim: true, default: null },

    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: true,
    },
    brand: { type: String, trim: true, default: '' },
    unit: { type: String, trim: true, default: 'قطعة' },
    description: { type: String, trim: true, default: '', maxlength: 500 },

    price: { type: Number, required: true, min: 0 },
    cost: { type: Number, required: true, min: 0 },
    cartonPrice: { type: Number, default: null, min: 0 },
    piecesPerCarton: { type: Number, default: 1, min: 1 },

    /**
     * الرصيد نفسه متخزن في مجموعة Stock لكل فرع.
     * هنا بنحتفظ بحد الطلب الافتراضي اللي الفرع بيرثه لما يتعمل له رصيد أول مرة.
     */
    minStock: { type: Number, default: 0, min: 0 },

    /** خدمات زي التغليف مالهاش مخزون، فبنعدّي البيع عليها من غير فحص رصيد. */
    trackStock: { type: Boolean, default: true },
    isTaxable: { type: Boolean, default: true },

    expiryDate: { type: Date, default: null },
    variants: { type: [variantSchema], default: [] },

    imageUrl: { type: String, trim: true, default: null },
    colorIndex: { type: Number, default: 0, min: 0 },

    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

productSchema.index({ sku: 1 }, { unique: true });
productSchema.index(
  { barcode: 1 },
  { unique: true, partialFilterExpression: { barcode: { $type: 'string' } } },
);
productSchema.index({ category: 1, isActive: 1 });
productSchema.index({ name: 'text', brand: 'text' });
productSchema.index({ expiryDate: 1 });

/** هامش الربح بيتحسب وقت القراءة عشان مايبقاش محتاج تحديث مع كل تغيير سعر. */
productSchema.virtual('profitMargin').get(function profitMargin() {
  if (!this.price) return 0;
  return Math.round(((this.price - this.cost) / this.price) * 10000) / 100;
});

export const Product = mongoose.model('Product', productSchema);

export default Product;
