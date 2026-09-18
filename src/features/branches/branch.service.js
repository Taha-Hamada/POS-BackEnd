import ApiError from '../../core/errors/ApiError.js';
import { toSearchRegex } from '../../core/base/commonSchemas.js';
import { INVOICE_STATUSES } from '../../core/constants/index.js';
import { round2 } from '../../core/utils/money.js';
import Invoice from '../invoices/invoice.model.js';
import User from '../users/user.model.js';

import branchRepository from './branch.repository.js';

const POPULATE_MANAGER = { path: 'manager', select: 'name phone role' };

/** نفس فواتير التقارير: كل حاجة ما عدا الملغاة. */
const COUNTED_STATUSES = { $ne: INVOICE_STATUSES.VOIDED };

/** المسؤول لازم يكون حساب شغال، وإلا الفرع يبان ليه مدير مش موجود. */
const assertManagerExists = async (managerId) => {
  if (!managerId) return;

  const exists = await User.exists({ _id: managerId, isActive: true });
  if (!exists) throw ApiError.badRequest('المسؤول المختار غير موجود أو معطل');
};

/** مبيعات كل فرع في فترة، كخريطة بمعرّف الفرع. */
const salesByBranch = async (from, to) => {
  const createdAt = { $gte: from };
  if (to) createdAt.$lt = to;

  const rows = await Invoice.aggregate([
    { $match: { status: COUNTED_STATUSES, createdAt } },
    {
      $group: {
        _id: '$branch',
        sales: { $sum: '$total' },
        invoices: { $sum: 1 },
      },
    },
  ]);

  return new Map(rows.map((row) => [String(row._id), row]));
};

const sumSales = (rows) =>
  round2([...rows.values()].reduce((sum, row) => sum + row.sales, 0));

const buildFilter = ({ search, isActive, isOpen }) => {
  const filter = {};

  if (search) {
    const regex = toSearchRegex(search);
    filter.$or = [{ name: regex }, { code: regex }, { address: regex }];
  }
  if (isActive !== undefined) filter.isActive = isActive;
  if (isOpen !== undefined) filter.isOpen = isOpen;

  return filter;
};

export const listBranches = ({ page, limit, sort, search, isActive, isOpen }) =>
  branchRepository.paginate(buildFilter({ search, isActive, isOpen }), {
    page,
    limit,
    sort: sort ?? '-isMain name',
    populate: POPULATE_MANAGER,
  });

export const getBranchById = async (id) => {
  const branch = await branchRepository.findById(id, {
    populate: POPULATE_MANAGER,
    lean: true,
  });

  if (!branch) throw ApiError.notFound('الفرع غير موجود');
  return branch;
};

/**
 * شاشة الفروع بتعرض كل فرع بأرقامه: عدد الموظفين ومبيعات النهاردة والشهر.
 *
 * بنحسبها هنا في طلب واحد بدل ما الشاشة تنادي تقرير لكل فرع،
 * ومعاها أرقام الفترة اللي فاتت عشان نسبة التغيير تبقى حقيقية.
 * الشهر بيتقارن بنفس عدد الأيام من الشهر اللي فات مش بالشهر كله.
 */
export const getBranchesOverview = async () => {
  const now = new Date();

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);

  // 31 مارس ناقص شهر بتقع في مارس نفسه، فبنقفلها على بداية الشهر الحالي.
  const sameDayLastMonth = new Date(now);
  sameDayLastMonth.setMonth(sameDayLastMonth.getMonth() - 1);
  const lastMonthToDate =
    sameDayLastMonth > monthStart ? monthStart : sameDayLastMonth;

  const [branches, todayRows, yesterdayRows, monthRows, lastMonthRows, staff, employees] =
    await Promise.all([
      branchRepository.find(
        { isActive: true },
        { sort: '-isMain name', populate: POPULATE_MANAGER },
      ),
      salesByBranch(today),
      salesByBranch(yesterday, today),
      salesByBranch(monthStart),
      salesByBranch(lastMonthStart, lastMonthToDate),
      User.aggregate([
        { $match: { isActive: true, branch: { $ne: null } } },
        { $group: { _id: '$branch', count: { $sum: 1 } } },
      ]),
      User.countDocuments({ isActive: true }),
    ]);

  const staffByBranch = new Map(staff.map((row) => [String(row._id), row.count]));

  return {
    totals: {
      branches: branches.length,
      open: branches.filter((branch) => branch.isOpen).length,
      employees,
      todaySales: sumSales(todayRows),
      yesterdaySales: sumSales(yesterdayRows),
      monthSales: sumSales(monthRows),
      lastMonthSales: sumSales(lastMonthRows),
    },
    branches: branches.map((branch) => {
      const id = String(branch._id);

      return {
        ...branch,
        employeesCount: staffByBranch.get(id) ?? 0,
        todaySales: round2(todayRows.get(id)?.sales ?? 0),
        todayInvoices: todayRows.get(id)?.invoices ?? 0,
        monthSales: round2(monthRows.get(id)?.sales ?? 0),
      };
    }),
  };
};

export const createBranch = async (payload) => {
  const existing = await branchRepository.findByCode(payload.code, { lean: true });
  if (existing) throw ApiError.conflict('كود الفرع مستخدم قبل كده');

  await assertManagerExists(payload.manager);

  const branch = await branchRepository.create(payload);

  if (branch.isMain) await branchRepository.clearMainFlag(branch._id);

  return branch.populate(POPULATE_MANAGER);
};

export const updateBranch = async (id, payload) => {
  const branch = await branchRepository.findById(id);
  if (!branch) throw ApiError.notFound('الفرع غير موجود');

  if (payload.code && payload.code.toUpperCase() !== branch.code) {
    const clash = await branchRepository.findByCode(payload.code, { lean: true });
    if (clash) throw ApiError.conflict('كود الفرع مستخدم قبل كده');
  }

  if (payload.manager) await assertManagerExists(payload.manager);

  Object.assign(branch, payload);
  await branch.save();

  if (branch.isMain) await branchRepository.clearMainFlag(branch._id);

  return branch.populate(POPULATE_MANAGER);
};

/**
 * مبنمسحش الفرع نهائيًا لأن الفواتير والمخزون مربوطين بيه،
 * بنعطّله بس عشان يختفي من الاختيارات من غير ما التاريخ يبوظ.
 */
export const deactivateBranch = async (id) => {
  const branch = await branchRepository.findById(id);
  if (!branch) throw ApiError.notFound('الفرع غير موجود');

  if (branch.isMain) {
    throw ApiError.badRequest('مينفعش تعطّل الفرع الرئيسي');
  }

  branch.isActive = false;
  branch.isOpen = false;
  await branch.save();

  return branch;
};

export const setBranchOpenState = async (id, isOpen) => {
  const branch = await branchRepository.findById(id);
  if (!branch) throw ApiError.notFound('الفرع غير موجود');

  if (!branch.isActive && isOpen) {
    throw ApiError.badRequest('مينفعش تفتح فرع معطّل');
  }

  branch.isOpen = isOpen;
  await branch.save();

  return branch;
};

export default {
  listBranches,
  getBranchesOverview,
  getBranchById,
  createBranch,
  updateBranch,
  deactivateBranch,
  setBranchOpenState,
};
