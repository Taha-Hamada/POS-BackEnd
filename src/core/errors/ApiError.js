/**
 * خطأ متوقّع بنرميه من أي طبقة، ومعالج الأخطاء بيحوّله لرد JSON مرتّب.
 * أي خطأ تاني غير ده بيتعامل معاه كخطأ سيرفر 500 من غير ما نسرّب تفاصيله للعميل.
 */
export class ApiError extends Error {
  constructor(statusCode, message, { code, details } = {}) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code ?? defaultCodeFor(statusCode);
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace?.(this, ApiError);
  }

  static badRequest(message = 'طلب غير صالح', options) {
    return new ApiError(400, message, options);
  }

  static unauthorized(message = 'غير مصرّح بالدخول', options) {
    return new ApiError(401, message, options);
  }

  static forbidden(message = 'ليس لديك صلاحية لهذا الإجراء', options) {
    return new ApiError(403, message, options);
  }

  static notFound(message = 'العنصر غير موجود', options) {
    return new ApiError(404, message, options);
  }

  static conflict(message = 'تعارض مع بيانات موجودة', options) {
    return new ApiError(409, message, options);
  }

  static unprocessable(message = 'البيانات غير صالحة', options) {
    return new ApiError(422, message, options);
  }

  static tooMany(message = 'عدد طلبات كبير جدًا، حاول بعد شوية', options) {
    return new ApiError(429, message, options);
  }

  static internal(message = 'حصل خطأ في السيرفر', options) {
    return new ApiError(500, message, options);
  }
}

const defaultCodeFor = (statusCode) =>
  ({
    400: 'BAD_REQUEST',
    401: 'UNAUTHORIZED',
    403: 'FORBIDDEN',
    404: 'NOT_FOUND',
    409: 'CONFLICT',
    422: 'UNPROCESSABLE_ENTITY',
    429: 'TOO_MANY_REQUESTS',
  })[statusCode] ?? 'INTERNAL_ERROR';

export default ApiError;
