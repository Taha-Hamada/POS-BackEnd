import ApiError from '../core/errors/ApiError.js';
import { ROLES } from '../core/constants/index.js';
import asyncHandler from '../core/http/asyncHandler.js';
import { verifyAccessToken } from '../features/auth/token.service.js';
import userRepository from '../features/users/user.repository.js';

const extractToken = (req) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;

  const token = header.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
};

/**
 * بيتأكد من التوكن وبيحمّل المستخدم من الداتابيز في كل طلب.
 * بنقرأ المستخدم بدل ما نثق في التوكن لوحده عشان التعطيل أو تغيير الدور يسري فورًا.
 */
export const authenticate = asyncHandler(async (req, _res, next) => {
  const token = extractToken(req);
  if (!token) throw ApiError.unauthorized('لازم تسجّل دخول الأول');

  const payload = verifyAccessToken(token);
  const user = await userRepository.findById(payload.sub);

  if (!user) throw ApiError.unauthorized('الحساب مش موجود');
  if (!user.isActive) throw ApiError.forbidden('الحساب معطّل');
  if (!user.isTokenStillValid(payload.iat)) {
    throw ApiError.unauthorized('الجلسة انتهت، سجّل دخول تاني', {
      code: 'SESSION_REVOKED',
    });
  }

  req.user = user;
  req.permissions = new Set(user.permissions);

  next();
});

/** بيسمح للأدوار المذكورة بس. مدير النظام بيعدّي دايمًا. */
export const authorizeRoles = (...roles) => (req, _res, next) => {
  if (!req.user) {
    next(ApiError.unauthorized('لازم تسجّل دخول الأول'));
    return;
  }

  if (req.user.role === ROLES.ADMIN || roles.includes(req.user.role)) {
    next();
    return;
  }

  next(ApiError.forbidden('دورك مايسمحش بالإجراء ده'));
};

/** بيطلب كل الصلاحيات المذكورة مع بعض. */
export const requirePermissions = (...required) => (req, _res, next) => {
  if (!req.user) {
    next(ApiError.unauthorized('لازم تسجّل دخول الأول'));
    return;
  }

  if (req.user.role === ROLES.ADMIN) {
    next();
    return;
  }

  const missing = required.filter((permission) => !req.permissions.has(permission));

  if (missing.length > 0) {
    next(
      ApiError.forbidden('ليس لديك صلاحية لهذا الإجراء', {
        code: 'MISSING_PERMISSION',
        details: missing.map((permission) => ({ permission })),
      }),
    );
    return;
  }

  next();
};

/**
 * غير مدير النظام بيشوف فرعه بس.
 * بيثبّت الفرع في الكويري عشان كل استعلامات الفيتشر تتفلتر من غير ما كل خدمة تفتكر.
 */
export const scopeToBranch = (req, _res, next) => {
  if (!req.user) {
    next(ApiError.unauthorized('لازم تسجّل دخول الأول'));
    return;
  }

  if (req.user.role === ROLES.ADMIN) {
    next();
    return;
  }

  if (!req.user.branch) {
    next(ApiError.forbidden('الحساب مش مربوط بفرع'));
    return;
  }

  Object.defineProperty(req, 'query', {
    value: { ...req.query, branch: String(req.user.branch) },
    writable: true,
    configurable: true,
    enumerable: true,
  });

  next();
};

export default { authenticate, authorizeRoles, requirePermissions, scopeToBranch };
