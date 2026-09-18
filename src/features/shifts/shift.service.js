import BaseRepository from '../../core/base/BaseRepository.js';
import { toObjectId } from '../../core/base/commonSchemas.js';
import {
  PAYMENT_METHODS,
  SHIFT_STATUSES,
} from '../../core/constants/index.js';
import { nextSequence } from '../../core/db/counter.model.js';
import ApiError from '../../core/errors/ApiError.js';
import { round2 } from '../../core/utils/money.js';
import * as expenseService from '../expenses/expense.service.js';
import * as invoiceService from '../invoices/invoice.service.js';
import * as returnService from '../returns/return.service.js';

import Shift from './shift.model.js';

const shiftRepository = new BaseRepository(Shift);

const POPULATE = [
  { path: 'branch', select: 'name code' },
  { path: 'cashier', select: 'name username' },
];

export const getOpenShift = (cashierId) =>
  shiftRepository.findOne(
    { cashier: cashierId, status: SHIFT_STATUSES.OPEN },
    { populate: POPULATE },
  );

export const openShift = async ({ cashier, branch, openingBalance }) => {
  const existing = await getOpenShift(cashier);

  if (existing) {
    throw ApiError.conflict('عندك وردية مفتوحة بالفعل، اقفلها الأول', {
      code: 'SHIFT_ALREADY_OPEN',
      details: [{ shift: existing.id, openedAt: existing.openedAt }],
    });
  }

  const number = await nextSequence('shift', { prefix: 'SH', padding: 5 });

  const shift = await shiftRepository.create({
    number,
    branch,
    cashier,
    openingBalance,
  });

  return shift.populate(POPULATE);
};

/**
 * بيحسب أرقام الوردية من الفواتير والمرتجعات المسجّلة عليها.
 * بيتنادى في العرض المباشر وفي لحظة التقفيل، فالرقمين متطابقين دايمًا.
 */
export const calculateShiftTotals = async (shift) => {
  const filters = { shift: shift._id ?? shift.id };

  const [summary, byMethod, returns, cashExpenses] = await Promise.all([
    invoiceService.getBranchSummary(filters),
    invoiceService.getPaymentBreakdown(filters),
    returnService.summarizeByShift(filters.shift),
    expenseService.cashExpensesForShift(filters.shift),
  ]);

  const cashSales = byMethod[PAYMENT_METHODS.CASH]?.amount ?? 0;
  const cashIn = sumMovements(shift.cashMovements, 'in');
  const cashOut = sumMovements(shift.cashMovements, 'out');

  // الكاش المتوقع في الدرج:
  // الافتتاحي + مبيعات الكاش + الإيداعات − السحوبات − المرتجعات الكاش − المصروفات الكاش.
  const expectedCash = round2(
    shift.openingBalance +
      cashSales +
      cashIn -
      cashOut -
      returns.cashRefunds -
      cashExpenses,
  );

  return {
    salesTotal: summary.total,
    invoicesCount: summary.invoicesCount,
    taxTotal: summary.taxAmount,
    profit: summary.profit,
    discountTotal: summary.discountTotal,
    returnsTotal: returns.total,
    cashRefunds: returns.cashRefunds,
    cashExpenses,
    byMethod,
    cashSales,
    cashIn,
    cashOut,
    expectedCash,
  };
};

const sumMovements = (movements, direction) =>
  round2(
    (movements ?? [])
      .filter((movement) => movement.direction === direction)
      .reduce((sum, movement) => sum + movement.amount, 0),
  );

export const getShiftById = async (id) => {
  const shift = await shiftRepository.findById(id, { populate: POPULATE });
  if (!shift) throw ApiError.notFound('الوردية غير موجودة');
  return shift;
};

/** الوردية ومعاها أرقامها اللحظية — شاشة الكاشير بتعرض منها. */
export const getShiftWithTotals = async (id) => {
  const shift = await getShiftById(id);

  if (shift.status !== SHIFT_STATUSES.CLOSED) {
    return { shift, totals: await calculateShiftTotals(shift) };
  }

  const stored = shift.closing?.toObject?.() ?? shift.closing ?? {};

  // الورديات اللي اتقفلت قبل ما نخزّن كل الأرقام بنكمّل ناقصها بالحساب من
  // فواتيرها — أحسن من إننا نعرضها أصفار.
  if (stored.cashSales !== null && stored.cashSales !== undefined) {
    return { shift, totals: stored };
  }

  const recomputed = await calculateShiftTotals(shift);
  const filled = { ...recomputed };

  for (const [key, value] of Object.entries(stored)) {
    if (value !== null && value !== undefined) filled[key] = value;
  }

  return { shift, totals: filled };
};

export const addCashMovement = async (
  id,
  { direction, amount, reason, userId },
) => {
  const shift = await shiftRepository.findById(id);
  if (!shift) throw ApiError.notFound('الوردية غير موجودة');

  if (shift.status !== SHIFT_STATUSES.OPEN) {
    throw ApiError.badRequest('الوردية مقفولة');
  }

  if (direction === 'out') {
    const totals = await calculateShiftTotals(shift);

    // مبنسمحش بسحب أكتر من اللي في الدرج فعلًا.
    if (amount > totals.expectedCash) {
      throw ApiError.badRequest(
        `المتاح في الدرج ${totals.expectedCash} بس`,
        { code: 'INSUFFICIENT_DRAWER_CASH' },
      );
    }
  }

  shift.cashMovements.push({ direction, amount, reason, by: userId });
  await shift.save();

  return shift;
};

export const closeShift = async (id, { countedCash, note, userId }) => {
  const shift = await shiftRepository.findById(id);
  if (!shift) throw ApiError.notFound('الوردية غير موجودة');

  if (shift.status === SHIFT_STATUSES.CLOSED) {
    throw ApiError.badRequest('الوردية مقفولة بالفعل');
  }

  const totals = await calculateShiftTotals(shift);

  shift.status = SHIFT_STATUSES.CLOSED;
  shift.closedAt = new Date();
  // بنجمّد كل الأرقام مش بعضها: تقرير الوردية بيتقري من هنا بعد التقفيل،
  // وأي حقل ناقص كان بيتعرض صفر في الشاشة وفي الـPDF.
  shift.closing = {
    ...totals,
    countedCash,
    difference: round2(countedCash - totals.expectedCash),
    note: note ?? '',
    closedBy: userId,
  };

  await shift.save();

  return shift.populate(POPULATE);
};

export const listShifts = ({ page, limit, branch, cashier, status, from, to }) => {
  const filter = {};

  if (branch) filter.branch = branch;
  if (cashier) filter.cashier = cashier;
  if (status) filter.status = status;
  if (from || to) {
    filter.openedAt = {};
    if (from) filter.openedAt.$gte = from;
    if (to) filter.openedAt.$lte = to;
  }

  return shiftRepository.paginate(filter, {
    page,
    limit,
    sort: '-openedAt',
    populate: POPULATE,
  });
};

/**
 * بيتأكد إن الكاشير عنده وردية مفتوحة قبل ما يبيع، وبيرجّع معرّفها.
 * البيع من غير وردية معناه فلوس في الدرج مالهاش تقفيل.
 */
export const requireOpenShift = async (cashierId) => {
  const shift = await shiftRepository.findOne(
    { cashier: cashierId, status: SHIFT_STATUSES.OPEN },
    { lean: true },
  );

  if (!shift) {
    throw ApiError.badRequest('لازم تفتح وردية قبل ما تبيع', {
      code: 'NO_OPEN_SHIFT',
    });
  }

  return shift;
};

/** حالة وردية بعينها — الفواتير بتسأل عنها قبل الإلغاء. */
export const getShiftForInvoice = (shiftId) =>
  shiftRepository.findById(shiftId, { lean: true });

export const getShiftIdFor = async (cashierId) => {
  const shift = await shiftRepository.findOne(
    { cashier: cashierId, status: SHIFT_STATUSES.OPEN },
    { lean: true },
  );

  return shift?._id ?? null;
};

export const SHIFT_STATE = SHIFT_STATUSES;
export const toId = toObjectId;

export default {
  openShift,
  closeShift,
  getOpenShift,
  getShiftById,
  getShiftWithTotals,
  addCashMovement,
  listShifts,
  requireOpenShift,
  getShiftIdFor,
  getShiftForInvoice,
  calculateShiftTotals,
};
