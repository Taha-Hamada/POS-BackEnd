/**
 * كل ردود الـ API بتخرج بالشكل ده عشان الفرونت يقرأها بنفس الطريقة دايمًا:
 * { success, message, data, meta }
 */
export const sendSuccess = (
  res,
  { status = 200, message = null, data = null, meta = null } = {},
) =>
  res.status(status).json({
    success: true,
    message,
    data,
    ...(meta ? { meta } : {}),
  });

export const sendCreated = (res, { message, data } = {}) =>
  sendSuccess(res, { status: 201, message, data });

export const sendNoContent = (res) => res.status(204).send();

/** رد صفحة مقسّمة — بيحط بيانات الترقيم في meta بدل ما يخلطها بالداتا. */
export const sendPaginated = (res, { items, pagination, message = null }) =>
  sendSuccess(res, { message, data: items, meta: { pagination } });

export default { sendSuccess, sendCreated, sendNoContent, sendPaginated };
