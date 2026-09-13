import { toSearchRegex } from '../../core/base/commonSchemas.js';
import {
  CUSTOMER_TIERS,
  LOYALTY_ENTRY_TYPES,
} from '../../core/constants/index.js';
import ApiError from '../../core/errors/ApiError.js';
import { round2 } from '../../core/utils/money.js';

import customerRepository from './customer.repository.js';
import { LEDGER_TYPES } from './customerLedger.model.js';

/** حدود الترقية للفئات — الترقية بتتحسب بعد كل فاتورة. */
const TIER_THRESHOLDS = [
  { tier: CUSTOMER_TIERS.GOLD, minPurchases: 50_000 },
  { tier: CUSTOMER_TIERS.SILVER, minPurchases: 15_000 },
  { tier: CUSTOMER_TIERS.REGULAR, minPurchases: 0 },
];

export const tierFor = (totalPurchases) =>
  TIER_THRESHOLDS.find((row) => totalPurchases >= row.minPurchases).tier;

const buildFilter = ({ search, tier, isActive, hasDebt }) => {
  const filter = {};

  if (search) {
    const regex = toSearchRegex(search);
    filter.$or = [{ name: regex }, { phone: regex }, { email: regex }];
  }
  if (tier) filter.tier = tier;
  if (isActive !== undefined) filter.isActive = isActive;
  if (hasDebt) filter.balance = { $lt: 0 };

  return filter;
};

export const listCustomers = ({
  page,
  limit,
  sort,
  search,
  tier,
  isActive,
  hasDebt,
}) =>
  customerRepository.paginate(buildFilter({ search, tier, isActive, hasDebt }), {
    page,
    limit,
    sort: sort ?? '-lastVisitAt name',
  });

export const getCustomerById = async (id) => {
  const customer = await customerRepository.findById(id, { lean: true });
  if (!customer) throw ApiError.notFound('العميل غير موجود');
  return customer;
};

export const findByPhone = async (phone) => {
  const customer = await customerRepository.findByPhone(phone);
  if (!customer) throw ApiError.notFound('مفيش عميل بالرقم ده');
  return customer;
};

export const createCustomer = async (payload) => {
  const existing = await customerRepository.findByPhone(payload.phone);
  if (existing) throw ApiError.conflict('رقم الموبايل مسجّل لعميل تاني');

  return customerRepository.create(payload);
};

export const updateCustomer = async (id, payload) => {
  const customer = await customerRepository.findById(id);
  if (!customer) throw ApiError.notFound('العميل غير موجود');

  if (payload.phone && payload.phone !== customer.phone) {
    const clash = await customerRepository.findByPhone(payload.phone);
    if (clash) throw ApiError.conflict('رقم الموبايل مسجّل لعميل تاني');
  }

  // الرصيد والنقط مالهمش تعديل مباشر — ليهم مسارات بتكتب في كشف الحساب.
  delete payload.balance;
  delete payload.points;
  delete payload.totalPurchases;
  delete payload.ordersCount;

  Object.assign(customer, payload);
  await customer.save();

  return customer;
};

export const setCustomerActiveState = async (id, isActive) => {
  const customer = await customerRepository.findById(id);
  if (!customer) throw ApiError.notFound('العميل غير موجود');

  if (!isActive && customer.balance < 0) {
    throw ApiError.badRequest('مينفعش تعطّل عميل عليه مديونية');
  }

  customer.isActive = isActive;
  await customer.save();

  return customer;
};

/**
 * الدالة الوحيدة اللي بتحرّك رصيد العميل.
 * بتعدّل الرصيد وتكتب سطر كشف الحساب مع بعض عشان الاتنين مايفترقوش أبدًا.
 */
export const applyBalanceChange = async (
  {
    customer: customerId,
    amount,
    type,
    referenceType = null,
    reference = null,
    branch = null,
    note = '',
    performedBy = null,
  },
  { session } = {},
) => {
  const delta = round2(amount);
  if (!delta) throw ApiError.badRequest('قيمة الحركة مينفعش تكون صفر');

  const customer = await customerRepository.applyBalanceDelta(customerId, delta, {
    session,
  });

  if (!customer) throw ApiError.notFound('العميل غير موجود');

  const entry = await customerRepository.addLedgerEntry(
    {
      customer: customerId,
      type,
      amount: delta,
      balanceAfter: round2(customer.balance),
      referenceType,
      reference,
      branch,
      note,
      performedBy,
    },
    { session },
  );

  return { customer, entry };
};

/** بيتأكد إن سقف الآجل يستحمل الفاتورة قبل ما نعتمدها. */
export const assertCreditAllowed = async (customerId, amount, { session } = {}) => {
  const customer = await customerRepository.findById(customerId, { session });
  if (!customer) throw ApiError.badRequest('العميل غير موجود');
  if (!customer.isActive) throw ApiError.badRequest('العميل معطّل');

  const projected = customer.balance - amount;

  if (projected < -customer.creditLimit) {
    throw ApiError.badRequest('المبلغ بيتعدى سقف الآجل المسموح للعميل', {
      code: 'CREDIT_LIMIT_EXCEEDED',
      details: [
        {
          creditLimit: customer.creditLimit,
          currentBalance: customer.balance,
          requested: amount,
        },
      ],
    });
  }

  return customer;
};

/** سداد من العميل — بيرفع رصيده ناحية الصفر. */
export const recordPayment = async ({
  customer: customerId,
  amount,
  branch,
  note,
  performedBy,
}) => {
  if (amount <= 0) throw ApiError.badRequest('مبلغ السداد لازم يكون موجب');

  const customer = await customerRepository.findById(customerId, { lean: true });
  if (!customer) throw ApiError.notFound('العميل غير موجود');

  if (customer.balance >= 0) {
    throw ApiError.badRequest('العميل مش عليه مديونية');
  }

  const debt = Math.abs(customer.balance);
  if (amount > debt) {
    throw ApiError.badRequest(`المبلغ أكبر من المديونية (${debt})`, {
      code: 'OVERPAYMENT',
    });
  }

  return applyBalanceChange({
    customer: customerId,
    amount,
    type: LEDGER_TYPES.PAYMENT,
    referenceType: 'manual_payment',
    branch,
    note: note || 'سداد نقدي',
    performedBy,
  });
};

/** تعديل يدوي بالموجب أو السالب — للحالات اللي محتاجة تصحيح. */
export const adjustBalance = async ({
  customer: customerId,
  amount,
  note,
  performedBy,
  branch,
}) =>
  applyBalanceChange({
    customer: customerId,
    amount,
    type: LEDGER_TYPES.ADJUSTMENT,
    referenceType: 'manual_adjustment',
    branch,
    note,
    performedBy,
  });

export const getLedger = ({ customer, type, from, to, page, limit }) => {
  const filter = { customer };

  if (type) filter.type = type;
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = from;
    if (to) filter.createdAt.$lte = to;
  }

  return customerRepository.listLedger(filter, {
    page,
    limit,
    sort: '-createdAt',
    populate: [
      { path: 'branch', select: 'name code' },
      { path: 'performedBy', select: 'name username' },
    ],
  });
};

/** بيتنادى بعد كل فاتورة عشان يحدّث الإجماليات ويرقّي الفئة لو استحقت. */
export const registerPurchase = async (
  { customer: customerId, amount },
  { session } = {},
) => {
  const customer = await customerRepository.recordPurchase(customerId, amount, {
    session,
  });

  if (!customer) return null;

  const nextTier = tierFor(customer.totalPurchases);

  if (nextTier !== customer.tier) {
    customer.tier = nextTier;
    await customer.save({ session });
  }

  return customer;
};

/** بيعكس إجماليات الشراء بعد إلغاء فاتورة، وبينزّل الفئة لو الإجمالي نقص. */
export const reversePurchase = async (
  { customer: customerId, amount, invoice },
  { session } = {},
) => {
  const customer = await customerRepository.reversePurchase(customerId, amount, {
    session,
  });

  if (!customer) return null;

  const nextTier = tierFor(customer.totalPurchases);
  if (nextTier !== customer.tier) {
    customer.tier = nextTier;
    await customer.save({ session });
  }

  // النقط اللي اتكسبت من الفاتورة الملغاة بترجع.
  const earned = await customerRepository.loyalty.findOne(
    { customer: customerId, reference: invoice, type: LOYALTY_ENTRY_TYPES.EARN },
    { lean: true },
  );

  if (earned) {
    await applyPointsChange(
      {
        customer: customerId,
        points: -earned.points,
        reason: LOYALTY_ENTRY_TYPES.ADJUST,
        referenceType: 'invoice_void',
        reference: invoice,
        note: 'سحب نقط فاتورة ملغاة',
        allowNegative: true,
      },
      { session },
    );
  }

  return customer;
};

/**
 * الدالة الوحيدة اللي بتحرّك نقط العميل.
 * الاستهلاك بيفشل لو النقط مش كفاية، والرصيد بعد التعديل بيتسجّل في سطر السجل.
 */
export const applyPointsChange = async (
  {
    customer: customerId,
    points,
    reason,
    valueAmount = 0,
    referenceType = null,
    reference = null,
    note = '',
    performedBy = null,
    allowNegative = false,
  },
  { session } = {},
) => {
  if (!points) throw ApiError.badRequest('عدد النقط مينفعش يكون صفر');

  const customer = await customerRepository.applyPointsDelta(customerId, points, {
    session,
    allowNegative,
  });

  if (!customer) {
    throw ApiError.badRequest('نقط العميل مش كفاية', {
      code: 'INSUFFICIENT_POINTS',
    });
  }

  // السحب المسموح له بالسالب ممكن ينزل تحت الصفر، فبنقفل الرصيد عند صفر.
  if (customer.points < 0) {
    customer.points = 0;
    await customer.save({ session });
  }

  const entry = await customerRepository.addLoyaltyEntry(
    {
      customer: customerId,
      type: reason,
      points,
      balanceAfter: customer.points,
      valueAmount,
      referenceType,
      reference,
      note,
      performedBy,
    },
    { session },
  );

  return { customer, entry };
};

/** استبدال نقط بخصم — بيرجّع قيمة الخصم بالعملة. */
export const redeemPoints = async ({
  customer: customerId,
  points,
  settings,
  performedBy,
}) => {
  if (points < settings.minPointsToRedeem) {
    throw ApiError.badRequest(
      `أقل عدد نقط للاستبدال ${settings.minPointsToRedeem}`,
      { code: 'BELOW_MIN_POINTS' },
    );
  }

  const valueAmount = round2(points * settings.currencyPerPoint);

  const result = await applyPointsChange({
    customer: customerId,
    points: -points,
    reason: LOYALTY_ENTRY_TYPES.REDEEM,
    valueAmount,
    referenceType: 'manual_redeem',
    note: `استبدال ${points} نقطة`,
    performedBy,
  });

  return { ...result, valueAmount };
};

export const getLoyaltyHistory = ({ customer, page, limit }) =>
  customerRepository.listLoyalty(
    { customer },
    {
      page,
      limit,
      sort: '-createdAt',
      populate: { path: 'performedBy', select: 'name username' },
    },
  );

export const getReceivablesSummary = () => customerRepository.totalReceivables();

export default {
  listCustomers,
  getCustomerById,
  findByPhone,
  createCustomer,
  updateCustomer,
  setCustomerActiveState,
  applyBalanceChange,
  assertCreditAllowed,
  recordPayment,
  adjustBalance,
  getLedger,
  registerPurchase,
  reversePurchase,
  applyPointsChange,
  redeemPoints,
  getLoyaltyHistory,
  getReceivablesSummary,
  tierFor,
};
