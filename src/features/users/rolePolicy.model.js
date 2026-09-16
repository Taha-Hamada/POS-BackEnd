import mongoose from 'mongoose';

import { PERMISSION_VALUES, ROLES, ROLE_VALUES } from '../../core/constants/index.js';

/**
 * باقة صلاحيات دور بعد ما المدير عدّلها.
 *
 * الدور اللي مالوش مستند هنا بياخد الباقة الافتراضية من الكود،
 * فاستعادة الافتراضي معناها مسح المستند بس.
 */
const rolePolicySchema = new mongoose.Schema(
  {
    role: {
      type: String,
      required: true,
      enum: ROLE_VALUES.filter((role) => role !== ROLES.ADMIN),
    },
    permissions: [{ type: String, enum: PERMISSION_VALUES }],
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

rolePolicySchema.index({ role: 1 }, { unique: true });

export const RolePolicy = mongoose.model('RolePolicy', rolePolicySchema);

export default RolePolicy;
