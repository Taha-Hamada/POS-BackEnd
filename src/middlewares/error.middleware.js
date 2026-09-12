import mongoose from 'mongoose';

import env from '../config/env.js';
import logger from '../config/logger.js';
import ApiError from '../core/errors/ApiError.js';

export const notFoundHandler = (req, _res, next) => {
  next(ApiError.notFound(`المسار ${req.method} ${req.originalUrl} غير موجود`));
};

/** بيترجم أخطاء Mongoose و JWT لأخطاء API مفهومة قبل ما تتبعت للعميل. */
const normalize = (error) => {
  if (error instanceof ApiError) return error;

  if (error instanceof mongoose.Error.ValidationError) {
    return ApiError.unprocessable('البيانات المرسلة غير صالحة', {
      code: 'VALIDATION_ERROR',
      details: Object.values(error.errors).map((item) => ({
        field: item.path,
        message: item.message,
      })),
    });
  }

  if (error instanceof mongoose.Error.CastError) {
    return ApiError.badRequest(`قيمة غير صالحة للحقل ${error.path}`, {
      code: 'INVALID_ID',
    });
  }

  if (error?.code === 11000) {
    const fields = Object.keys(error.keyPattern ?? {});
    return ApiError.conflict('القيمة مستخدمة قبل كده', {
      code: 'DUPLICATE_KEY',
      details: fields.map((field) => ({
        field,
        message: `${field} مستخدم بالفعل`,
      })),
    });
  }

  if (error?.name === 'TokenExpiredError') {
    return ApiError.unauthorized('انتهت صلاحية الجلسة، سجّل دخول تاني', {
      code: 'TOKEN_EXPIRED',
    });
  }

  if (error?.name === 'JsonWebTokenError') {
    return ApiError.unauthorized('رمز الدخول غير صالح', {
      code: 'INVALID_TOKEN',
    });
  }

  if (error?.type === 'entity.parse.failed') {
    return ApiError.badRequest('صيغة JSON في جسم الطلب غير صحيحة', {
      code: 'MALFORMED_JSON',
    });
  }

  return null;
};

// eslint-disable-next-line no-unused-vars -- إكسبريس بيتعرّف على معالج الأخطاء بعدد الوسائط
export const errorHandler = (error, req, res, _next) => {
  const apiError = normalize(error);

  if (!apiError) {
    logger.error(`خطأ غير متوقّع في ${req.method} ${req.originalUrl}`, error);
  } else if (apiError.statusCode >= 500) {
    logger.error(`${apiError.code} في ${req.method} ${req.originalUrl}`, error);
  }

  const statusCode = apiError?.statusCode ?? 500;

  res.status(statusCode).json({
    success: false,
    message: apiError?.message ?? 'حصل خطأ في السيرفر',
    error: {
      code: apiError?.code ?? 'INTERNAL_ERROR',
      ...(apiError?.details ? { details: apiError.details } : {}),
      ...(env.isProduction ? {} : { stack: error?.stack }),
    },
  });
};

export default { notFoundHandler, errorHandler };
