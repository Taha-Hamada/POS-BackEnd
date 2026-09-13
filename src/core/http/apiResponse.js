/**
 * استعلامات lean بترجّع كائنات خام من مونجو من غير الحقول المشتقة،
 * فبيكون فيها _id من غير id، بينما مستندات Mongoose بترجّع الاتنين.
 * الفرق ده بيخلي نفس العنصر شكله مختلف حسب المسار اللي جابه،
 * فبنوحّد الشكل هنا في مكان واحد بدل ما كل خدمة تفتكر لوحدها.
 */
const normalize = (value) => {
  if (value === null || typeof value !== 'object') return value;

  if (Array.isArray(value)) return value.map(normalize);

  // التواريخ ومعرّفات مونجو بتتسلسل لوحدها صح، فمبنفكّهاش.
  if (value instanceof Date || value._bsontype !== undefined) return value;

  // مستندات Mongoose بتطبّق تحويلاتها الأول، زي إخفاء هاش كلمة السر.
  if (typeof value.toJSON === 'function') return normalize(value.toJSON());

  const result = {};

  for (const [key, item] of Object.entries(value)) {
    result[key] = normalize(item);
  }

  if (result._id !== undefined && result.id === undefined) {
    result.id = String(result._id);
  }

  return result;
};

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
    data: normalize(data),
    ...(meta ? { meta } : {}),
  });

export const sendCreated = (res, { message, data } = {}) =>
  sendSuccess(res, { status: 201, message, data });

export const sendNoContent = (res) => res.status(204).send();

/** رد صفحة مقسّمة — بيحط بيانات الترقيم في meta بدل ما يخلطها بالداتا. */
export const sendPaginated = (res, { items, pagination, message = null }) =>
  sendSuccess(res, { message, data: items, meta: { pagination } });

export default { sendSuccess, sendCreated, sendNoContent, sendPaginated };
