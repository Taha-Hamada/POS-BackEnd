import BaseRepository from '../../core/base/BaseRepository.js';
import { toObjectId, toSearchRegex } from '../../core/base/commonSchemas.js';
import { EXPENSE_STATUSES } from '../../core/constants/index.js';
import { nextSequence } from '../../core/db/counter.model.js';
import ApiError from '../../core/errors/ApiError.js';
import { round2 } from '../../core/utils/money.js';

import Expense from './expense.model.js';

const expenseRepository = new BaseRepository(Expense);

const POPULATE = [
  { path: 'branch', select: 'name code' },
  { path: 'createdBy', select: 'name username' },
  { path: 'reviewedBy', select: 'name username' },
];

const buildFilter = ({ branch, category, status, from, to, search, createdBy }) => {
  const filter = {};

  if (branch) filter.branch = branch;
  if (category) filter.category = category;
  if (status) filter.status = status;
  if (createdBy) filter.createdBy = createdBy;
  if (search) {
    const regex = toSearchRegex(search);
    filter.$or = [{ number: regex }, { note: regex }, { category: regex }];
  }

  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = from;
    if (to) filter.date.$lte = to;
  }

  return filter;
};

export const listExpenses = ({ page, limit, sort, ...filters }) =>
  expenseRepository.paginate(buildFilter(filters), {
    page,
    limit,
    sort: sort ?? '-date',
    populate: POPULATE,
  });

export const getExpenseById = async (id) => {
  const expense = await expenseRepository.findById(id, {
    populate: POPULATE,
    lean: true,
  });

  if (!expense) throw ApiError.notFound('المصروف غير موجود');
  return expense;
};

export const createExpense = async (payload) => {
  const number = await nextSequence('expense', { prefix: 'EXP', padding: 5 });

  const expense = await expenseRepository.create({ ...payload, number });
  return expense.populate(POPULATE);
};

/** المصروف المعتمد اتقفل عليه الحساب، فمبيتعدلش ولا يتمسح. */
const assertEditable = (expense) => {
  if (expense.status === EXPENSE_STATUSES.APPROVED) {
    throw ApiError.badRequest('المصروف معتمد، مينفعش يتعدل', {
      code: 'EXPENSE_APPROVED',
    });
  }
};

export const updateExpense = async (id, payload) => {
  const expense = await expenseRepository.findById(id);
  if (!expense) throw ApiError.notFound('المصروف غير موجود');

  assertEditable(expense);

  // الاعتماد والرفض ليهم مسارات مستقلة عشان يتسجّل مين وامتى.
  delete payload.status;
  delete payload.reviewedBy;
  delete payload.reviewedAt;

  Object.assign(expense, payload);
  await expense.save();

  return expense.populate(POPULATE);
};

export const deleteExpense = async (id) => {
  const expense = await expenseRepository.findById(id);
  if (!expense) throw ApiError.notFound('المصروف غير موجود');

  assertEditable(expense);
  await expenseRepository.deleteById(id);

  return { id, deleted: true };
};

export const reviewExpense = async (id, { approve, reason, userId }) => {
  const expense = await expenseRepository.findById(id);
  if (!expense) throw ApiError.notFound('المصروف غير موجود');

  if (expense.status !== EXPENSE_STATUSES.PENDING) {
    throw ApiError.badRequest('المصروف اتراجع قبل كده');
  }

  // اللي سجّل المصروف مايعتمدوش بنفسه.
  if (String(expense.createdBy) === String(userId)) {
    throw ApiError.forbidden('مينفعش تعتمد مصروف سجّلته بنفسك', {
      code: 'SELF_APPROVAL',
    });
  }

  expense.status = approve ? EXPENSE_STATUSES.APPROVED : EXPENSE_STATUSES.REJECTED;
  expense.reviewedBy = userId;
  expense.reviewedAt = new Date();
  expense.rejectionReason = approve ? '' : (reason ?? '');

  await expense.save();

  return expense.populate(POPULATE);
};

/** تفصيل المصروفات ببنودها — بيغذي تقرير المصروفات والداشبورد. */
export const summarizeByCategory = async ({ branch, from, to, status }) => {
  const match = {};

  if (branch) match.branch = toObjectId(branch);
  if (status) match.status = status;
  if (from || to) {
    match.date = {};
    if (from) match.date.$gte = from;
    if (to) match.date.$lte = to;
  }

  const rows = await expenseRepository.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$category',
        total: { $sum: '$amount' },
        count: { $sum: 1 },
      },
    },
    { $sort: { total: -1 } },
  ]);

  const total = round2(rows.reduce((sum, row) => sum + row.total, 0));

  return {
    total,
    categories: rows.map((row) => ({
      category: row._id,
      total: round2(row.total),
      count: row.count,
      share: total > 0 ? Math.round((row.total / total) * 1000) / 10 : 0,
    })),
  };
};

/** إجمالي المصروفات الكاش المعتمدة في وردية — بيخصم من الدرج. */
export const cashExpensesForShift = async (shiftId) => {
  if (!shiftId) return 0;

  const [row] = await expenseRepository.aggregate([
    {
      $match: {
        shift: toObjectId(shiftId),
        paymentMethod: 'cash',
        status: { $ne: EXPENSE_STATUSES.REJECTED },
      },
    },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);

  return round2(row?.total ?? 0);
};

export default {
  listExpenses,
  getExpenseById,
  createExpense,
  updateExpense,
  deleteExpense,
  reviewExpense,
  summarizeByCategory,
  cashExpensesForShift,
};
