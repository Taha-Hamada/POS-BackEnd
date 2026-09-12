import mongoose from 'mongoose';

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },

    /**
     * اسم أيقونة وكود لون بيتخزنوا كنص عشان الفرونت يترجمهم لأيقونة فلاتر.
     * الباك اند مالوش دعوة بشكلهم، بيخزنهم ويرجعهم بس.
     */
    icon: { type: String, trim: true, default: 'category' },
    color: { type: String, trim: true, default: '#6366F1' },

    /** قسم فرعي لقسم تاني — مستوى واحد كفاية لشاشات نقطة البيع. */
    parent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      default: null,
    },

    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

categorySchema.index({ name: 1 }, { unique: true });
categorySchema.index({ parent: 1, sortOrder: 1 });
categorySchema.index({ isActive: 1 });

export const Category = mongoose.model('Category', categorySchema);

export default Category;
