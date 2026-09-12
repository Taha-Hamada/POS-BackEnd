import { toSearchRegex } from '../../core/base/commonSchemas.js';
import { ROLES } from '../../core/constants/index.js';
import ApiError from '../../core/errors/ApiError.js';
import branchRepository from '../branches/branch.repository.js';

import userRepository from './user.repository.js';

const POPULATE_BRANCH = { path: 'branch', select: 'name code isMain' };

const buildFilter = ({ search, role, branch, isActive }) => {
  const filter = {};

  if (search) {
    const regex = toSearchRegex(search);
    filter.$or = [{ name: regex }, { username: regex }, { phone: regex }];
  }
  if (role) filter.role = role;
  if (branch) filter.branch = branch;
  if (isActive !== undefined) filter.isActive = isActive;

  return filter;
};

const assertBranchExists = async (branchId) => {
  if (!branchId) return;

  const exists = await branchRepository.exists({ _id: branchId, isActive: true });
  if (!exists) throw ApiError.badRequest('الفرع المختار غير موجود أو معطل');
};

/** الكاشير والمحاسب وأمين المخزن لازم يبقوا على فرع، المدير ممكن يبقى على النظام كله. */
const assertBranchRequirement = (role, branchId) => {
  if (role !== ROLES.ADMIN && !branchId) {
    throw ApiError.badRequest('الدور ده لازم يتربط بفرع');
  }
};

export const listUsers = ({ page, limit, sort, search, role, branch, isActive }) =>
  userRepository.paginate(buildFilter({ search, role, branch, isActive }), {
    page,
    limit,
    sort: sort ?? 'name',
    populate: POPULATE_BRANCH,
  });

export const getUserById = async (id) => {
  const user = await userRepository.findById(id, { populate: POPULATE_BRANCH });
  if (!user) throw ApiError.notFound('المستخدم غير موجود');
  return user;
};

export const createUser = async (payload) => {
  const taken = await userRepository.findByUsername(payload.username);
  if (taken) throw ApiError.conflict('اسم المستخدم محجوز');

  assertBranchRequirement(payload.role ?? ROLES.CASHIER, payload.branch);
  await assertBranchExists(payload.branch);

  const user = await userRepository.create(payload);
  return user.populate(POPULATE_BRANCH);
};

export const updateUser = async (id, payload) => {
  const user = await userRepository.findById(id);
  if (!user) throw ApiError.notFound('المستخدم غير موجود');

  if (payload.username && payload.username !== user.username) {
    const taken = await userRepository.findByUsername(payload.username);
    if (taken) throw ApiError.conflict('اسم المستخدم محجوز');
  }

  const nextRole = payload.role ?? user.role;
  const nextBranch = 'branch' in payload ? payload.branch : user.branch;

  assertBranchRequirement(nextRole, nextBranch);
  if (payload.branch) await assertBranchExists(payload.branch);

  Object.assign(user, payload);
  await user.save();

  return user.populate(POPULATE_BRANCH);
};

/** إعادة تعيين كلمة السر من المدير — بتسقط كل جلسات المستخدم تلقائيا. */
export const resetUserPassword = async (id, newPassword) => {
  const user = await userRepository.findByIdWithPassword(id);
  if (!user) throw ApiError.notFound('المستخدم غير موجود');

  user.password = newPassword;
  await user.save();

  return { id: user.id, tokensValidFrom: user.tokensValidFrom };
};

export const updateUserPermissions = async (id, { granted = [], revoked = [] }) => {
  const user = await userRepository.findById(id);
  if (!user) throw ApiError.notFound('المستخدم غير موجود');

  // الصلاحية الواحدة مينفعش تبقى ممنوحة ومسحوبة في نفس الوقت.
  const clash = granted.filter((permission) => revoked.includes(permission));
  if (clash.length > 0) {
    throw ApiError.badRequest('في صلاحيات ممنوحة ومسحوبة في نفس الوقت', {
      details: clash.map((permission) => ({ permission })),
    });
  }

  user.grantedPermissions = granted;
  user.revokedPermissions = revoked;
  await user.save();

  return user;
};

export const setUserActiveState = async (id, isActive, actingUserId) => {
  if (String(id) === String(actingUserId) && !isActive) {
    throw ApiError.badRequest('مينفعش تعطل حسابك بنفسك');
  }

  const user = await userRepository.findById(id);
  if (!user) throw ApiError.notFound('المستخدم غير موجود');

  // لازم يفضل مدير نظام واحد شغال على الأقل.
  if (!isActive && user.role === ROLES.ADMIN) {
    const activeAdmins = await userRepository.countByRole(ROLES.ADMIN);
    if (activeAdmins <= 1) {
      throw ApiError.badRequest('مينفعش تعطل آخر مدير نظام');
    }
  }

  user.isActive = isActive;
  if (!isActive) user.tokensValidFrom = new Date();
  await user.save();

  return user;
};

export default {
  listUsers,
  getUserById,
  createUser,
  updateUser,
  resetUserPassword,
  updateUserPermissions,
  setUserActiveState,
};
