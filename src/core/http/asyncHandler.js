/**
 * بيلفّ الكنترولر عشان أي رفض لوعد يروح لمعالج الأخطاء بدل ما يفضل معلّق.
 * إكسبريس 5 بيعمل ده لوحده، بس الالتفاف الصريح بيخلي النية واضحة في الراوتر.
 */
export const asyncHandler = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

export default asyncHandler;
