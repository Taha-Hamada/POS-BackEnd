import mongoose from 'mongoose';

const supplierSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 150 },
    contactPerson: { type: String, trim: true, default: '' },
    phone: { type: String, required: true, trim: true, maxlength: 30 },
    email: { type: String, trim: true, lowercase: true, default: null },
    address: { type: String, trim: true, default: '' },
    taxNumber: { type: String, trim: true, default: '' },

    /** المستحق للمورد علينا. موجب = إحنا مدينين له. */
    balanceDue: { type: Number, default: 0 },

    paymentTermDays: { type: Number, default: 0, min: 0 },

    totalPurchases: { type: Number, default: 0, min: 0 },
    ordersCount: { type: Number, default: 0, min: 0 },

    note: { type: String, trim: true, default: '' },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

supplierSchema.index({ phone: 1 }, { unique: true });
supplierSchema.index({ name: 'text' });
supplierSchema.index({ isActive: 1, balanceDue: -1 });

export const Supplier = mongoose.model('Supplier', supplierSchema);

export default Supplier;
