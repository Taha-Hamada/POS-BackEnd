import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';

import {
  PERMISSION_VALUES,
  ROLES,
  ROLE_VALUES,
  resolvePermissions,
} from '../../core/constants/index.js';

const SALT_ROUNDS = 12;

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },

    /** اسم الدخول — بيتخزّن حروف صغيرة عشان الدخول ميبقاش حساس لحالة الحروف. */
    username: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      minlength: 3,
      maxlength: 40,
    },
    email: { type: String, trim: true, lowercase: true, default: null },
    phone: { type: String, trim: true, default: '' },

    /** select: false عشان الهاش ميطلعش بالغلط في أي استعلام عادي. */
    password: { type: String, required: true, select: false },

    role: { type: String, enum: ROLE_VALUES, default: ROLES.CASHIER },

    /** صلاحيات فوق باقة الدور، واستثناءات بتتشال منها. */
    grantedPermissions: [{ type: String, enum: PERMISSION_VALUES }],
    revokedPermissions: [{ type: String, enum: PERMISSION_VALUES }],

    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null },

    salary: { type: Number, default: 0, min: 0 },
    hiredAt: { type: Date, default: Date.now },

    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date, default: null },

    /**
     * كل التوكنات اللي اتصدرت قبل التاريخ ده بتبقى لاغية.
     * بنستخدمه في تسجيل الخروج من كل الأجهزة وبعد تغيير كلمة السر.
     */
    tokensValidFrom: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

userSchema.index({ username: 1 }, { unique: true });
userSchema.index(
  { email: 1 },
  { unique: true, partialFilterExpression: { email: { $type: 'string' } } },
);
userSchema.index({ branch: 1, isActive: 1 });
userSchema.index({ role: 1 });

/** الصلاحيات الفعلية محسوبة — مش متخزّنة — عشان تعديل باقة الدور يسري فورًا. */
userSchema.virtual('permissions').get(function permissions() {
  return resolvePermissions({
    role: this.role,
    granted: this.grantedPermissions ?? [],
    revoked: this.revokedPermissions ?? [],
  });
});

userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();

  this.password = await bcrypt.hash(this.password, SALT_ROUNDS);

  // كلمة سر جديدة = كل الجلسات القديمة تسقط.
  if (!this.isNew) this.tokensValidFrom = new Date();

  return next();
});

userSchema.methods.comparePassword = function comparePassword(plain) {
  return bcrypt.compare(plain, this.password);
};

/** بيتأكد إن التوكن اتصدر بعد آخر تغيير أمني على الحساب. */
userSchema.methods.isTokenStillValid = function isTokenStillValid(issuedAtSeconds) {
  if (!this.tokensValidFrom) return true;
  return issuedAtSeconds * 1000 >= Math.floor(this.tokensValidFrom.getTime() / 1000) * 1000;
};

userSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret) => {
    delete ret.password;
    return ret;
  },
});

export const User = mongoose.model('User', userSchema);

export default User;
