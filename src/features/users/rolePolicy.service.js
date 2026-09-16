import {
  PERMISSION_VALUES,
  PERMISSIONS,
  ROLES,
  ROLE_LABELS,
  ROLE_PERMISSIONS,
  getRolePermissions,
  isRoleCustomized,
  setRolePermissionOverride,
} from '../../core/constants/index.js';
import ApiError from '../../core/errors/ApiError.js';

import RolePolicy from './rolePolicy.model.js';
import User from './user.model.js';

/** بتتنادى مرة عند تشغيل السيرفر قبل ما يستقبل أي طلب. */
export const loadRolePolicies = async () => {
  const policies = await RolePolicy.find().lean();
  policies.forEach((policy) => {
    setRolePermissionOverride(policy.role, policy.permissions);
  });
  return policies.length;
};

const assertEditable = (role) => {
  if (!ROLE_LABELS[role]) throw ApiError.notFound('الدور غير موجود');
  if (role === ROLES.ADMIN) {
    throw ApiError.badRequest('صلاحيات مدير النظام كاملة ومينفعش تتعدّل');
  }
};

/** كتالوج الأدوار والصلاحيات — الفرونت بيبني منه شاشة الصلاحيات. */
export const getCatalog = async () => {
  const counts = await User.aggregate([
    { $match: { isActive: true } },
    { $group: { _id: '$role', count: { $sum: 1 } } },
  ]);
  const countByRole = new Map(counts.map((row) => [row._id, row.count]));

  return {
    roles: Object.entries(ROLE_LABELS).map(([value, label]) => ({
      value,
      label,
      permissions: getRolePermissions(value),
      defaultPermissions: ROLE_PERMISSIONS[value] ?? [],
      customized: isRoleCustomized(value),
      editable: value !== ROLES.ADMIN,
      usersCount: countByRole.get(value) ?? 0,
    })),
    permissions: Object.entries(PERMISSIONS).map(([key, value]) => ({
      key,
      value,
      group: value.split(':')[0],
    })),
  };
};

export const updateRolePermissions = async (role, permissions, { userId } = {}) => {
  assertEditable(role);

  const unique = [...new Set(permissions)].filter((permission) =>
    PERMISSION_VALUES.includes(permission),
  );

  await RolePolicy.findOneAndUpdate(
    { role },
    { $set: { permissions: unique, updatedBy: userId ?? null } },
    { upsert: true, new: true, runValidators: true },
  );

  setRolePermissionOverride(role, unique);

  return getCatalog();
};

/** بيرجّع الدور لباقته الافتراضية من الكود. */
export const resetRolePermissions = async (role) => {
  assertEditable(role);

  await RolePolicy.deleteOne({ role });
  setRolePermissionOverride(role, null);

  return getCatalog();
};

export default {
  loadRolePolicies,
  getCatalog,
  updateRolePermissions,
  resetRolePermissions,
};
