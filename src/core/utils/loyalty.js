import { CUSTOMER_TIERS } from '../constants/index.js';

/** أعلى مستوى وصل لحده إجمالي مشتريات العميل، و«عادي» لو ماوصلش لأي واحد. */
export const tierForPurchases = (totalPurchases, tiers = []) => {
  const reached = [...tiers]
    .sort((a, b) => b.minPurchases - a.minPurchases)
    .find((tier) => totalPurchases >= tier.minPurchases);

  return reached?.key ?? CUSTOMER_TIERS.REGULAR;
};

/** نسبة خصم المستوى — صفر للعميل العادي أو لمستوى مش متعرّف. */
export const tierDiscountPercent = (tierKey, tiers = []) =>
  tiers.find((tier) => tier.key === tierKey)?.discountPercent ?? 0;

export default { tierForPurchases, tierDiscountPercent };
