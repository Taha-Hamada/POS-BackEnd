import mongoose from 'mongoose';

const openingHoursSchema = new mongoose.Schema(
  {
    from: { type: String, default: '09:00', trim: true },
    to: { type: String, default: '23:00', trim: true },
  },
  { _id: false },
);

const branchSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 20,
    },
    address: { type: String, trim: true, default: '' },
    phone: { type: String, trim: true, default: '' },

    /** الفرع الرئيسي واحد بس — الخدمة هي اللي بتفرض ده. */
    isMain: { type: Boolean, default: false },

    manager: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    /** مفتوح دلوقتي ولا لأ — بيتقلب يدويًا من شاشة الفروع. */
    isOpen: { type: Boolean, default: true },
    openingHours: { type: openingHoursSchema, default: () => ({}) },

    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

branchSchema.index({ code: 1 }, { unique: true });
branchSchema.index({ name: 'text' });
branchSchema.index({ isActive: 1, isMain: -1 });

export const Branch = mongoose.model('Branch', branchSchema);

export default Branch;
