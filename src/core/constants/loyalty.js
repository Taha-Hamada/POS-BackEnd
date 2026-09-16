import { CUSTOMER_TIERS } from './index.js';

/** المستويات اللي بتتعدّل من شاشة الولاء — «عادي» هو اللي تحتهم ومالوش مزايا. */
export const EDITABLE_TIER_KEYS = Object.freeze([
  CUSTOMER_TIERS.SILVER,
  CUSTOMER_TIERS.GOLD,
  CUSTOMER_TIERS.PLATINUM,
]);

/**
 * المستويات الافتراضية لو المدير لسه ماعدّلهاش.
 * الترقية على إجمالي المشتريات مش رصيد النقاط، لأن الرصيد بيقل مع الاستبدال
 * والعميل مايصحش ينزل مستواه عشان استخدم نقطه.
 */
export const DEFAULT_LOYALTY_TIERS = Object.freeze([
  {
    key: CUSTOMER_TIERS.SILVER,
    name: 'فضي',
    minPurchases: 15_000,
    discountPercent: 3,
    benefits: ['خصم 3% تلقائي على كل فاتورة', 'إشعارات العروض قبل الجميع'],
  },
  {
    key: CUSTOMER_TIERS.GOLD,
    name: 'ذهبي',
    minPurchases: 50_000,
    discountPercent: 7,
    benefits: ['خصم 7% تلقائي على كل فاتورة', 'أولوية في خدمة العملاء'],
  },
  {
    key: CUSTOMER_TIERS.PLATINUM,
    name: 'بلاتيني',
    minPurchases: 120_000,
    discountPercent: 12,
    benefits: ['خصم 12% تلقائي على كل فاتورة', 'حد ائتماني أعلى', 'مدير حساب مخصص'],
  },
]);

export default { EDITABLE_TIER_KEYS, DEFAULT_LOYALTY_TIERS };
