/**
 * الفلوس بتتخزن أرقام عشرية، والقسمة بتسيب كسور طويلة.
 * بنقرّب لخانتين عشريتين في كل خطوة حساب عشان مجموع السطور يساوي إجمالي الفاتورة.
 */
export const round2 = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

export const sumBy = (items, selector) =>
  round2(items.reduce((total, item) => total + Number(selector(item) || 0), 0));

/** بيحسب قيمة خصم سواء نسبة أو مبلغ ثابت، ومبيعديش قيمة الأساس. */
export const applyDiscount = (base, { type, value }) => {
  const amount = type === 'percentage' ? (base * Number(value)) / 100 : Number(value);
  return round2(Math.min(Math.max(amount, 0), base));
};

export default { round2, sumBy, applyDiscount };
