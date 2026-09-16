import { CUSTOMER_TIERS } from '../../core/constants/index.js';
import { DEFAULT_LOYALTY_TIERS } from '../../core/constants/loyalty.js';
import Customer from '../customers/customer.model.js';

import Settings, { SETTINGS_ID } from './settings.model.js';

/**
 * المستند القديم اتعمل قبل ما المستويات تتضاف، والقراءة lean مبتطبّقش
 * القيم الافتراضية، فبنكمّلها هنا عشان كل اللي بيقرا الإعدادات يلاقيها.
 * المستويات بترجع مرتبة تصاعديًا بالحد الأدنى.
 */
const withDefaults = (settings) => {
  if (!settings) return settings;

  const tiers = settings.loyaltyTiers?.length
    ? settings.loyaltyTiers
    : DEFAULT_LOYALTY_TIERS.map((tier) => ({ ...tier }));

  return {
    ...settings,
    loyaltyTiers: [...tiers].sort((a, b) => a.minPurchases - b.minPurchases),
  };
};

/**
 * بيرجّع الإعدادات وبينشئها بقيمها الافتراضية لو أول مرة.
 * الـ upsert بيخلي القراءة الأولى مأمونة من غير خطوة تجهيز منفصلة.
 */
export const getSettings = async () =>
  withDefaults(
    await Settings.findByIdAndUpdate(
      SETTINGS_ID,
      { $setOnInsert: { _id: SETTINGS_ID } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).lean(),
  );

/**
 * تغيير حدود المستويات بيغيّر مستوى عملاء موجودين، فبنعيد حسابه للكل
 * في استعلام واحد بدل ما العميل يفضل على مستواه القديم لحد فاتورته الجاية.
 */
const recalculateCustomerTiers = (tiers) => {
  const branches = [...tiers]
    .sort((a, b) => b.minPurchases - a.minPurchases)
    .map((tier) => ({
      case: { $gte: ['$totalPurchases', tier.minPurchases] },
      then: tier.key,
    }));

  return Customer.updateMany({}, [
    { $set: { tier: { $switch: { branches, default: CUSTOMER_TIERS.REGULAR } } } },
  ]);
};

export const updateSettings = async (payload, { userId } = {}) => {
  const settings = await Settings.findByIdAndUpdate(
    SETTINGS_ID,
    { $set: { ...payload, updatedBy: userId ?? null } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
  ).lean();

  if (payload.loyaltyTiers) await recalculateCustomerTiers(payload.loyaltyTiers);

  return withDefaults(settings);
};

export default { getSettings, updateSettings };
