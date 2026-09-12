import jwt from 'jsonwebtoken';

import env from '../../config/env.js';
import ApiError from '../../core/errors/ApiError.js';

const ACCESS = 'access';
const REFRESH = 'refresh';

const secretFor = (type) =>
  type === REFRESH ? env.JWT_REFRESH_SECRET : env.JWT_ACCESS_SECRET;

const expiresInFor = (type) =>
  type === REFRESH ? env.JWT_REFRESH_EXPIRES_IN : env.JWT_ACCESS_EXPIRES_IN;

const sign = (payload, type) =>
  jwt.sign({ ...payload, type }, secretFor(type), {
    expiresIn: expiresInFor(type),
    issuer: 'pos-system',
  });

/**
 * توكن الدخول قصير العمر وشايل الدور والفرع عشان الميدلوير يفلتر من غير ضربة داتابيز زيادة،
 * وتوكن التجديد طويل العمر وشايل المعرّف بس.
 */
export const issueTokens = (user) => ({
  accessToken: sign(
    { sub: String(user._id), role: user.role, branch: user.branch ? String(user.branch) : null },
    ACCESS,
  ),
  refreshToken: sign({ sub: String(user._id) }, REFRESH),
});

export const verifyToken = (token, type) => {
  const payload = jwt.verify(token, secretFor(type), { issuer: 'pos-system' });

  // من غير الفحص ده توكن التجديد ينفع يتقدّم كتوكن دخول.
  if (payload.type !== type) {
    throw ApiError.unauthorized('نوع الرمز غير مناسب للعملية دي', {
      code: 'INVALID_TOKEN_TYPE',
    });
  }

  return payload;
};

export const verifyAccessToken = (token) => verifyToken(token, ACCESS);
export const verifyRefreshToken = (token) => verifyToken(token, REFRESH);

export default { issueTokens, verifyAccessToken, verifyRefreshToken };
