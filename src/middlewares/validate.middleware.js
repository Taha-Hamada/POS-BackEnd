import { ZodError } from 'zod';

import ApiError from '../core/errors/ApiError.js';

/**
 * بيتحقق من body و params و query قبل ما الطلب يوصل للكنترولر،
 * وبيستبدلهم بالنسخة المتحوّلة عشان الكنترولر يشتغل على بيانات نضيفة ومحوّلة الأنواع.
 */
export const validate = (schemas) => (req, _res, next) => {
  try {
    for (const key of ['params', 'query', 'body']) {
      const schema = schemas[key];
      if (!schema) continue;

      const parsed = schema.parse(req[key]);

      // req.query في إكسبريس 5 خاصية قراءة فقط، فبنعرّفها من جديد.
      if (key === 'query') {
        Object.defineProperty(req, 'query', {
          value: parsed,
          writable: true,
          configurable: true,
          enumerable: true,
        });
      } else {
        req[key] = parsed;
      }
    }

    next();
  } catch (error) {
    if (error instanceof ZodError) {
      next(
        ApiError.unprocessable('البيانات المرسلة غير صالحة', {
          code: 'VALIDATION_ERROR',
          details: error.issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message,
          })),
        }),
      );
      return;
    }

    next(error);
  }
};

export default validate;
