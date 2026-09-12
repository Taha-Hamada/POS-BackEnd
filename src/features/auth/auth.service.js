import ApiError from '../../core/errors/ApiError.js';
import { ROLES } from '../../core/constants/index.js';
import userRepository from '../users/user.repository.js';

import { issueTokens, verifyRefreshToken } from './token.service.js';

const PUBLIC_FIELDS = [
  'id',
  'name',
  'username',
  'email',
  'phone',
  'role',
  'branch',
  'isActive',
  'lastLoginAt',
];

/** الشكل اللي الفرونت بيستقبله للمستخدم — من غير هاش ولا حقول داخلية. */
export const toAuthUser = (user) => {
  const plain = user.toJSON ? user.toJSON() : user;
  const result = Object.fromEntries(
    PUBLIC_FIELDS.map((field) => [field, plain[field] ?? null]),
  );
  result.permissions = user.permissions ?? [];
  return result;
};

export const login = async ({ username, password }) => {
  const user = await userRepository.findByUsernameWithPassword(username);

  // نفس الرسالة للحساب الغلط والباسورد الغلط عشان محدش يعرف الأسماء الموجودة.
  const invalid = ApiError.unauthorized('اسم المستخدم أو كلمة السر غير صحيحة');

  if (!user) throw invalid;
  if (!(await user.comparePassword(password))) throw invalid;
  if (!user.isActive) throw ApiError.forbidden('الحساب معطل، كلم المدير');

  user.lastLoginAt = new Date();
  await user.save();

  await user.populate({ path: 'branch', select: 'name code isMain' });

  return { user: toAuthUser(user), tokens: issueTokens(user) };
};

export const refreshSession = async (refreshToken) => {
  const payload = verifyRefreshToken(refreshToken);
  const user = await userRepository.findById(payload.sub);

  if (!user) throw ApiError.unauthorized('الحساب مش موجود');
  if (!user.isActive) throw ApiError.forbidden('الحساب معطل');
  if (!user.isTokenStillValid(payload.iat)) {
    throw ApiError.unauthorized('الجلسة انتهت، سجل دخول تاني', {
      code: 'SESSION_REVOKED',
    });
  }

  return { user: toAuthUser(user), tokens: issueTokens(user) };
};

export const getProfile = async (userId) => {
  const user = await userRepository.findById(userId, {
    populate: { path: 'branch', select: 'name code isMain' },
  });

  if (!user) throw ApiError.notFound('الحساب مش موجود');
  return toAuthUser(user);
};

export const changePassword = async (userId, { currentPassword, newPassword }) => {
  const user = await userRepository.findByIdWithPassword(userId);
  if (!user) throw ApiError.notFound('الحساب مش موجود');

  if (!(await user.comparePassword(currentPassword))) {
    throw ApiError.badRequest('كلمة السر الحالية غير صحيحة');
  }

  if (currentPassword === newPassword) {
    throw ApiError.badRequest('كلمة السر الجديدة لازم تكون مختلفة');
  }

  // الحفظ بيعمل الهاش وبيحدث tokensValidFrom، فكل الجلسات القديمة بتسقط.
  user.password = newPassword;
  await user.save();

  return { user: toAuthUser(user), tokens: issueTokens(user) };
};

/** تسجيل خروج من كل الأجهزة — بنقدم تاريخ صلاحية التوكنات بدل ما نمسك قايمة سوداء. */
export const revokeAllSessions = async (userId) => {
  const user = await userRepository.findById(userId);
  if (!user) throw ApiError.notFound('الحساب مش موجود');

  user.tokensValidFrom = new Date();
  await user.save();

  return { revokedAt: user.tokensValidFrom };
};

/**
 * تجهيز أول حساب مدير عند تشغيل النظام لأول مرة.
 * بيرفض لو فيه مدير موجود بالفعل عشان المسار ده ميبقاش باب خلفي.
 */
export const bootstrapAdmin = async (payload) => {
  const adminsCount = await userRepository.countByRole(ROLES.ADMIN);
  if (adminsCount > 0) {
    throw ApiError.forbidden('النظام متجهز بالفعل');
  }

  const user = await userRepository.create({ ...payload, role: ROLES.ADMIN });

  return { user: toAuthUser(user), tokens: issueTokens(user) };
};

export default {
  login,
  refreshSession,
  getProfile,
  changePassword,
  revokeAllSessions,
  bootstrapAdmin,
  toAuthUser,
};
