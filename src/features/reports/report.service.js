import { toObjectId } from '../../core/base/commonSchemas.js';
import { INVOICE_STATUSES } from '../../core/constants/index.js';
import { round2 } from '../../core/utils/money.js';
import customerRepository from '../customers/customer.repository.js';
import * as expenseService from '../expenses/expense.service.js';
import { getLowStockAlerts } from '../inventory/inventory.service.js';
import stockRepository from '../inventory/stock.repository.js';
import Invoice from '../invoices/invoice.model.js';
import * as invoiceService from '../invoices/invoice.service.js';
import productRepository from '../products/product.repository.js';
import PurchaseOrder from '../purchases/purchaseOrder.model.js';
import * as returnService from '../returns/return.service.js';
import { getSettings } from '../settings/settings.service.js';
import supplierRepository from '../suppliers/supplier.repository.js';

/** الفواتير اللي بتتحسب في التقارير: كل حاجة ما عدا الملغاة. */
const COUNTED_STATUSES = { $ne: INVOICE_STATUSES.VOIDED };

/** ربح المرتجعات — الإيراد ناقص الضريبة المردودة والتكلفة الراجعة للمخزن. */
const returnsProfit = (returns) =>
  round2(
    (returns?.total ?? 0) -
      (returns?.taxAmount ?? 0) -
      (returns?.costTotal ?? 0),
  );

const periodMatch = ({ branch, from, to }) => {
  const match = { status: COUNTED_STATUSES };

  if (branch) match.branch = toObjectId(branch);
  if (from || to) {
    match.createdAt = {};
    if (from) match.createdAt.$gte = from;
    if (to) match.createdAt.$lte = to;
  }

  return match;
};

/** بداية اليوم الحالي بتوقيت السيرفر — نقطة البداية لأرقام "النهاردة". */
const startOfToday = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
};

/**
 * التجميع في مونجو بيقسّم الأيام بتوقيت UTC افتراضيًا، واليوم المحلي بيبدأ قبله أو بعده.
 * من غير توحيد التوقيت، مبيعات آخر ساعات اليوم بتقع في يوم تاني وتختفي من الرسم.
 */
const serverTimezone = () => {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (zone) return zone;

  const offsetMinutes = -new Date().getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMinutes);

  return `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(
    abs % 60,
  ).padStart(2, '0')}`;
};

/** مفتاح اليوم بالتوقيت المحلي — لازم يطابق اللي التجميع بيطلعه. */
const localDateKey = (date) =>
  [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');

const daysAgo = (days) => {
  const date = startOfToday();
  date.setDate(date.getDate() - days);
  return date;
};

/**
 * سلسلة المبيعات اليومية.
 * بنجمّع في الداتابيز بالتاريخ، وبعدين بنملأ الأيام الفاضية بأصفار
 * عشان الرسم البياني في الفرونت مايبقاش فيه فجوات.
 */
export const getSalesSeries = async ({ branch, days = 30 }) => {
  const from = daysAgo(days - 1);

  const rows = await Invoice.aggregate([
    { $match: periodMatch({ branch, from }) },
    {
      $group: {
        _id: {
          $dateToString: {
            format: '%Y-%m-%d',
            date: '$createdAt',
            timezone: serverTimezone(),
          },
        },
        sales: { $sum: '$total' },
        tax: { $sum: '$taxAmount' },
        cost: { $sum: '$costTotal' },
        invoices: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const byDate = new Map(rows.map((row) => [row._id, row]));
  const series = [];

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const key = localDateKey(daysAgo(offset));
    const row = byDate.get(key);

    series.push({
      date: key,
      sales: round2(row?.sales ?? 0),
      // الضريبة محسوبة أصلًا في التجميع، والجداول محتاجاها عمود مستقل.
      tax: round2(row?.tax ?? 0),
      profit: round2((row?.sales ?? 0) - (row?.tax ?? 0) - (row?.cost ?? 0)),
      invoices: row?.invoices ?? 0,
    });
  }

  return series;
};

/**
 * الكمية والقيمة الصافية لسطر فاتورة بعد المرتجعات.
 *
 * صنف اتباع 100 ورجع 100 مكانش ينفع يفضل «الأكثر مبيعًا» بكامل قيمته،
 * فبنشيل نصيب الكمية المرتجعة من السطر بنفس نسبة السيرفر في المرتجع.
 */
const NET_LINE = {
  netQuantity: {
    $subtract: ['$lines.quantity', { $ifNull: ['$lines.returnedQuantity', 0] }],
  },
  soldQuantity: '$lines.quantity',
};

const NET_RATIO = {
  $cond: [
    { $gt: ['$soldQuantity', 0] },
    { $divide: ['$netQuantity', '$soldQuantity'] },
    0,
  ],
};

/** أفضل المنتجات مبيعًا — بيتحسب من سطور الفواتير بعد خصم المرتجعات. */
export const getTopProducts = async ({ branch, from, to, limit = 10 }) => {
  const rows = await Invoice.aggregate([
    { $match: periodMatch({ branch, from, to }) },
    { $unwind: '$lines' },
    { $addFields: NET_LINE },
    { $addFields: { netRatio: NET_RATIO } },
    { $match: { netQuantity: { $gt: 0 } } },
    {
      $group: {
        _id: '$lines.product',
        name: { $first: '$lines.name' },
        sku: { $first: '$lines.sku' },
        units: { $sum: '$netQuantity' },
        revenue: { $sum: { $multiply: ['$lines.lineTotal', '$netRatio'] } },
        cost: { $sum: { $multiply: ['$lines.unitCost', '$netQuantity'] } },
      },
    },
    { $sort: { revenue: -1 } },
    { $limit: limit },
  ]);

  return rows.map((row) => ({
    product: row._id,
    name: row.name,
    sku: row.sku,
    units: round2(row.units),
    revenue: round2(row.revenue),
    profit: round2(row.revenue - row.cost),
  }));
};

/** المبيعات بالأقسام — بيربط سطر الفاتورة بالمنتج عشان يوصل لقسمه. */
export const getSalesByCategory = async ({ branch, from, to }) => {
  const rows = await Invoice.aggregate([
    { $match: periodMatch({ branch, from, to }) },
    { $unwind: '$lines' },
    { $addFields: NET_LINE },
    { $addFields: { netRatio: NET_RATIO } },
    { $match: { netQuantity: { $gt: 0 } } },
    {
      $lookup: {
        from: 'products',
        localField: 'lines.product',
        foreignField: '_id',
        as: 'product',
      },
    },
    { $unwind: '$product' },
    {
      $lookup: {
        from: 'categories',
        localField: 'product.category',
        foreignField: '_id',
        as: 'category',
      },
    },
    { $unwind: '$category' },
    {
      $group: {
        _id: '$category._id',
        name: { $first: '$category.name' },
        icon: { $first: '$category.icon' },
        color: { $first: '$category.color' },
        units: { $sum: '$netQuantity' },
        revenue: { $sum: { $multiply: ['$lines.lineTotal', '$netRatio'] } },
        cost: { $sum: { $multiply: ['$lines.unitCost', '$netQuantity'] } },
      },
    },
    { $sort: { revenue: -1 } },
  ]);

  const total = round2(rows.reduce((sum, row) => sum + row.revenue, 0));

  return {
    total,
    categories: rows.map((row) => ({
      category: row._id,
      name: row.name,
      icon: row.icon,
      color: row.color,
      units: round2(row.units),
      revenue: round2(row.revenue),
      profit: round2(row.revenue - row.cost),
      share: total > 0 ? Math.round((row.revenue / total) * 1000) / 10 : 0,
    })),
  };
};

/** أداء الكاشيرين — عدد الفواتير ومتوسط الفاتورة لكل واحد. */
export const getCashierPerformance = async ({ branch, from, to }) => {
  const rows = await Invoice.aggregate([
    { $match: periodMatch({ branch, from, to }) },
    {
      $group: {
        _id: '$cashier',
        invoices: { $sum: 1 },
        sales: { $sum: '$total' },
        discounts: {
          $sum: { $add: ['$lineDiscountTotal', '$invoiceDiscount'] },
        },
      },
    },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'user',
      },
    },
    { $unwind: '$user' },
    { $sort: { sales: -1 } },
  ]);

  return rows.map((row) => ({
    cashier: row._id,
    name: row.user.name,
    username: row.user.username,
    invoices: row.invoices,
    sales: round2(row.sales),
    discounts: round2(row.discounts),
    averageTicket: round2(row.sales / row.invoices),
  }));
};

/** مقارنة الفروع — بتتجاهل فلتر الفرع لأن الغرض هو المقارنة بينهم. */
export const getBranchComparison = async ({ from, to }) => {
  const rows = await Invoice.aggregate([
    { $match: periodMatch({ from, to }) },
    {
      $group: {
        _id: '$branch',
        invoices: { $sum: 1 },
        sales: { $sum: '$total' },
        tax: { $sum: '$taxAmount' },
        cost: { $sum: '$costTotal' },
      },
    },
    {
      $lookup: {
        from: 'branches',
        localField: '_id',
        foreignField: '_id',
        as: 'branch',
      },
    },
    { $unwind: '$branch' },
    { $sort: { sales: -1 } },
  ]);

  const total = round2(rows.reduce((sum, row) => sum + row.sales, 0));

  return {
    total,
    branches: rows.map((row) => ({
      branch: row._id,
      name: row.branch.name,
      code: row.branch.code,
      invoices: row.invoices,
      sales: round2(row.sales),
      profit: round2(row.sales - row.tax - row.cost),
      share: total > 0 ? Math.round((row.sales / total) * 1000) / 10 : 0,
    })),
  };
};

/**
 * الإقرار الضريبي: المحصّل من المبيعات، والمدفوع في المشتريات، والفرق بينهم.
 *
 * المصلحة بتاخد الفرق مش المحصّل كله، فالشاشة لازم تعرض التلاتة.
 */
export const getTaxReport = async ({ branch, months = 12 }) => {
  const from = new Date();
  from.setMonth(from.getMonth() - (months - 1), 1);
  from.setHours(0, 0, 0, 0);

  const settings = await getSettings();

  const rows = await Invoice.aggregate([
    { $match: periodMatch({ branch, from }) },
    {
      $group: {
        _id: {
          $dateToString: {
            format: '%Y-%m',
            date: '$createdAt',
            timezone: serverTimezone(),
          },
        },
        taxableBase: { $sum: { $subtract: ['$total', '$taxAmount'] } },
        tax: { $sum: '$taxAmount' },
        invoices: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const [purchases, returns] = await Promise.all([
    getPurchaseTax({ branch, from, taxRate: settings.taxRate }),
    returnService.getReturnsSummary({ branch, from }),
  ]);

  // الضريبة اللي اترجعت للعميل مع المرتجع مش محصّلة، فمينفعش تتحسب علينا.
  const charged = round2(rows.reduce((sum, row) => sum + row.tax, 0));
  const collected = round2(charged - returns.taxAmount);

  return {
    taxRate: settings.taxRate,
    charged,
    refunded: returns.taxAmount,
    collected,
    paid: purchases.tax,
    net: round2(collected - purchases.tax),
    purchasesReceived: purchases.received,
    months: rows.map((row) => ({
      month: row._id,
      taxableBase: round2(row.taxableBase),
      tax: round2(row.tax),
      invoices: row.invoices,
    })),
  };
};

/** تقرير المخزون بقيمته — التكلفة وسعر البيع المتوقع. */
export const getInventoryValuation = async ({ branch }) => {
  const match = branch ? { branch: toObjectId(branch) } : {};

  const rows = await stockRepository.aggregate([
    { $match: match },
    {
      $lookup: {
        from: 'products',
        localField: 'product',
        foreignField: '_id',
        as: 'product',
      },
    },
    { $unwind: '$product' },
    { $match: { 'product.isActive': true, 'product.trackStock': true } },
    {
      $group: {
        _id: null,
        items: { $sum: 1 },
        units: { $sum: '$quantity' },
        costValue: { $sum: { $multiply: ['$quantity', '$product.cost'] } },
        retailValue: { $sum: { $multiply: ['$quantity', '$product.price'] } },
        outOfStock: { $sum: { $cond: [{ $lte: ['$quantity', 0] }, 1, 0] } },
      },
    },
  ]);

  const row = rows[0];

  return {
    items: row?.items ?? 0,
    units: round2(row?.units ?? 0),
    costValue: round2(row?.costValue ?? 0),
    retailValue: round2(row?.retailValue ?? 0),
    expectedProfit: round2((row?.retailValue ?? 0) - (row?.costValue ?? 0)),
    outOfStock: row?.outOfStock ?? 0,
  };
};

/** تقرير المخزون مفصّل بالأقسام — كل قسم بقيمته بالتكلفة وبسعر البيع. */
export const getInventoryByCategory = async ({ branch }) => {
  const match = branch ? { branch: toObjectId(branch) } : {};

  const rows = await stockRepository.aggregate([
    { $match: match },
    {
      $lookup: {
        from: 'products',
        localField: 'product',
        foreignField: '_id',
        as: 'product',
      },
    },
    { $unwind: '$product' },
    { $match: { 'product.isActive': true, 'product.trackStock': true } },
    {
      $lookup: {
        from: 'categories',
        localField: 'product.category',
        foreignField: '_id',
        as: 'category',
      },
    },
    { $unwind: '$category' },
    {
      $group: {
        _id: '$category._id',
        name: { $first: '$category.name' },
        icon: { $first: '$category.icon' },
        color: { $first: '$category.color' },
        items: { $sum: 1 },
        units: { $sum: '$quantity' },
        cost: { $sum: { $multiply: ['$quantity', '$product.cost'] } },
        retail: { $sum: { $multiply: ['$quantity', '$product.price'] } },
      },
    },
    { $sort: { cost: -1 } },
  ]);

  return rows.map((row) => ({
    category: row._id,
    name: row.name,
    icon: row.icon,
    color: row.color,
    items: row.items,
    units: round2(row.units),
    cost: round2(row.cost),
    retail: round2(row.retail),
    expectedProfit: round2(row.retail - row.cost),
  }));
};

/**
 * ضريبة المشتريات — تُخصم من ضريبة المبيعات في الإقرار.
 *
 * بتتحسب من القيمة المستلمة فعلًا في أوامر الشراء، مش من قيمة الأوامر كلها،
 * لأن اللي مااستلمش لسه مادخلش المخزن ومااستحقّتش عليه ضريبة.
 */
export const getPurchaseTax = async ({ branch, from, to, taxRate }) => {
  const match = {};

  if (branch) match.branch = toObjectId(branch);
  if (from || to) {
    match.orderDate = {};
    if (from) match.orderDate.$gte = from;
    if (to) match.orderDate.$lte = to;
  }

  const [row] = await PurchaseOrder.aggregate([
    { $match: match },
    { $group: { _id: null, received: { $sum: '$receivedValue' } } },
  ]);

  const received = round2(row?.received ?? 0);

  return { received, tax: round2(received * taxRate) };
};

/**
 * الداشبورد: كل أرقام الشاشة الرئيسية في طلب واحد.
 * بنشغّل الاستعلامات على التوازي لأنها مستقلة عن بعض.
 */
export const getDashboard = async ({ branch, days = 7 }) => {
  const today = startOfToday();
  const periodFrom = daysAgo(days - 1);

  // الفترة اللي قبلها بنفس الطول، عشان الشاشة تعرض نسبة التغيّر.
  const previousFrom = daysAgo(days * 2 - 1);
  const previousTo = new Date(periodFrom.getTime() - 1);

  const [
    todayStats,
    periodStats,
    previousStats,
    paymentMethods,
    returns,
    expenses,
    series,
    topProducts,
    lowStock,
    valuation,
    receivables,
    payables,
    expiring,
  ] = await Promise.all([
    invoiceService.getBranchSummary({ branch, from: today }),
    invoiceService.getBranchSummary({ branch, from: periodFrom }),
    invoiceService.getBranchSummary({ branch, from: previousFrom, to: previousTo }),
    invoiceService.getPaymentBreakdown({ branch, from: periodFrom }),
    returnService.getReturnsSummary({ branch, from: periodFrom }),
    expenseService.summarizeByCategory({ branch, from: periodFrom, status: 'approved' }),
    getSalesSeries({ branch, days }),
    getTopProducts({ branch, from: periodFrom, limit: 5 }),
    getLowStockAlerts({ branch, limit: 10 }),
    getInventoryValuation({ branch }),
    customerRepository.totalReceivables(),
    supplierRepository.totalPayables(),
    productRepository.findExpiringBefore(daysAgo(-30), { limit: 10 }),
  ]);

  return {
    today: {
      sales: todayStats.total,
      invoices: todayStats.invoicesCount,
      profit: todayStats.profit,
      tax: todayStats.taxAmount,
    },
    period: {
      days,
      sales: periodStats.total,
      invoices: periodStats.invoicesCount,
      profit: periodStats.profit,
      discounts: periodStats.discountTotal,
      returns: returns.total,
      // اللي المرتجعات شالته من الربح فعلًا — أقل من إجماليها لأن الضريبة
      // رجعت والبضاعة رجعت للمخزن.
      returnsProfit: returnsProfit(returns),
      expenses: expenses.total,
      /**
       * صافي الربح بعد المرتجعات والمصروفات المعتمدة.
       *
       * المرتجع بيلغي ربحه هو بس: إيراده اترد للعميل، بس ضريبته اترجعت
       * كمان والبضاعة رجعت للمخزن بتكلفتها. طرح إجمالي المرتجع كان بيحمّل
       * الربح التكلفة والضريبة مرتين — فاتورة بـ114 (ضريبة 14، تكلفة 60)
       * اترجّعت بالكامل كانت بتطلّع صافي −60 بدل صفر.
       */
      netProfit: round2(
        periodStats.profit - returnsProfit(returns) - expenses.total,
      ),
      averageTicket:
        periodStats.invoicesCount > 0
          ? round2(periodStats.total / periodStats.invoicesCount)
          : 0,
    },
    /// نفس أرقام الفترة السابقة، والشاشة بتحسب منها نسبة التغيّر.
    previous: {
      sales: previousStats.total,
      invoices: previousStats.invoicesCount,
      profit: previousStats.profit,
      averageTicket:
        previousStats.invoicesCount > 0
          ? round2(previousStats.total / previousStats.invoicesCount)
          : 0,
    },
    /// المحصّل بكل طريقة دفع خلال الفترة.
    paymentMethods,
    series,
    topProducts,
    lowStock,
    inventory: valuation,
    receivables,
    payables,
    expiringSoon: expiring,
  };
};

export default {
  getDashboard,
  getSalesSeries,
  getTopProducts,
  getSalesByCategory,
  getCashierPerformance,
  getBranchComparison,
  getTaxReport,
  getInventoryValuation,
  getInventoryByCategory,
  getPurchaseTax,
};
