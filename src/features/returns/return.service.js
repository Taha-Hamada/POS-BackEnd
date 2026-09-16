import BaseRepository from '../../core/base/BaseRepository.js';
import { toObjectId } from '../../core/base/commonSchemas.js';
import {
  INVOICE_STATUSES,
  LOYALTY_ENTRY_TYPES,
  PAYMENT_METHODS,
  STOCK_MOVEMENT_REASONS,
} from '../../core/constants/index.js';
import { nextSequence } from '../../core/db/counter.model.js';
import withTransaction from '../../core/db/transaction.js';
import ApiError from '../../core/errors/ApiError.js';
import { round2 } from '../../core/utils/money.js';
import * as customerService from '../customers/customer.service.js';
import { LEDGER_TYPES } from '../customers/customerLedger.model.js';
import { applyStockMovement } from '../inventory/inventory.service.js';
import invoiceRepository from '../invoices/invoice.repository.js';
import Product from '../products/product.model.js';
import { getSettings } from '../settings/settings.service.js';

import SaleReturn from './return.model.js';

const returnRepository = new BaseRepository(SaleReturn);

const PAYMENTS = PAYMENT_METHODS;

/** المدة اللي بعدها المرتجع محتاج موافقة — الافتراضي شهر. */
const RETURN_WINDOW_DAYS = 30;

/**
 * بيبني سطور المرتجع من سطور الفاتورة الأصلية.
 * القيمة بتتأخذ من الفاتورة مش من سعر النهاردة، وبتتقسّم بالتناسب لو الإرجاع جزئي،
 * فالعميل بياخد اللي دفعه فعلًا مش أكتر ولا أقل.
 */
const buildReturnLines = (invoice, requestedLines) => {
  const byId = new Map(invoice.lines.map((line) => [String(line._id), line]));

  return requestedLines.map((requested) => {
    const original = byId.get(String(requested.invoiceLine));

    if (!original) {
      throw ApiError.badRequest('في سطر مش موجود في الفاتورة الأصلية');
    }

    const remaining = round2(original.quantity - original.returnedQuantity);

    if (requested.quantity > remaining) {
      throw ApiError.badRequest(
        `المتاح إرجاعه من ${original.name} هو ${remaining} بس`,
        { code: 'RETURN_EXCEEDS_SOLD' },
      );
    }

    const ratio = requested.quantity / original.quantity;

    return {
      invoiceLine: original._id,
      product: original.product,
      name: original.name,
      quantity: requested.quantity,
      unitPrice: original.unitPrice,
      unitCost: original.unitCost,
      lineTotal: round2(original.lineTotal * ratio),
      taxAmount: round2(original.taxAmount * ratio),
      restock: requested.restock !== false,
      reason: requested.reason ?? '',
    };
  });
};

/** نصيب المرتجع من خصم الفاتورة، عشان ما نردّش أكتر من المحصّل. */
const invoiceDiscountShare = (invoice, linesTotal) => {
  if (!invoice.invoiceDiscount) return 0;

  const base = round2(invoice.subtotal - invoice.lineDiscountTotal);
  if (base <= 0) return 0;

  return round2(invoice.invoiceDiscount * (linesTotal / base));
};

export const createReturn = async ({
  invoice: invoiceId,
  lines: requestedLines,
  refundMethod,
  reason = '',
  note = '',
  cashier,
  shift = null,
}) => {
  const invoice = await invoiceRepository.findById(invoiceId);
  if (!invoice) throw ApiError.notFound('الفاتورة غير موجودة');

  if (invoice.status === INVOICE_STATUSES.VOIDED) {
    throw ApiError.badRequest('الفاتورة ملغاة، مفيش مرتجع عليها');
  }

  if (invoice.status === INVOICE_STATUSES.HELD) {
    throw ApiError.badRequest('الفاتورة لسه معلّقة');
  }

  if (invoice.status === INVOICE_STATUSES.RETURNED) {
    throw ApiError.badRequest('الفاتورة اترجّعت بالكامل قبل كده');
  }

  const lines = buildReturnLines(invoice, requestedLines);

  const linesTotal = round2(
    lines.reduce((sum, line) => sum + line.lineTotal, 0),
  );
  const taxAmount = round2(lines.reduce((sum, line) => sum + line.taxAmount, 0));
  const discountShare = invoiceDiscountShare(invoice, linesTotal);
  const total = round2(linesTotal - discountShare + taxAmount);
  const costTotal = round2(
    lines.reduce((sum, line) => sum + line.unitCost * line.quantity, 0),
  );

  // الرد الآجل بيقلل مديونية العميل، فلازم يكون فيه عميل أصلًا.
  if (refundMethod === PAYMENTS.CREDIT && !invoice.customer) {
    throw ApiError.badRequest('الرد على الحساب محتاج عميل مسجّل على الفاتورة');
  }

  const settings = await getSettings();
  const trackedIds = lines.map((line) => line.product);
  const products = await Product.find({ _id: { $in: trackedIds } })
    .select('trackStock')
    .lean();
  const tracked = new Set(
    products.filter((item) => item.trackStock).map((item) => String(item._id)),
  );

  return withTransaction(async (session) => {
    const number = await nextSequence('return', { prefix: 'RET', session });

    const [saleReturn] = await SaleReturn.create(
      [
        {
          number,
          invoice: invoice._id,
          branch: invoice.branch,
          cashier,
          shift,
          customer: invoice.customer,
          lines,
          subtotal: linesTotal,
          taxAmount,
          total,
          costTotal,
          refundMethod,
          reason,
          note,
        },
      ],
      { session },
    );

    for (const line of lines) {
      if (!line.restock || !tracked.has(String(line.product))) continue;

      await applyStockMovement(
        {
          product: line.product,
          branch: invoice.branch,
          quantity: line.quantity,
          reason: STOCK_MOVEMENT_REASONS.RETURN,
          referenceType: 'return',
          reference: saleReturn._id,
          unitCost: line.unitCost,
          note: `مرتجع ${number}`,
          performedBy: cashier,
        },
        { session },
      );
    }

    // تحديث الكميات المرتجعة على الفاتورة الأصلية وحالتها.
    for (const line of lines) {
      const original = invoice.lines.id(line.invoiceLine);
      original.returnedQuantity = round2(
        original.returnedQuantity + line.quantity,
      );
    }

    invoice.returnedTotal = round2(invoice.returnedTotal + total);

    const fullyReturned = invoice.lines.every(
      (line) => line.returnedQuantity >= line.quantity,
    );

    invoice.status = fullyReturned
      ? INVOICE_STATUSES.RETURNED
      : INVOICE_STATUSES.PARTIALLY_RETURNED;

    await invoice.save({ session });

    if (invoice.customer) {
      // صنف سعره صفر بيطلع مرتجع بقيمة صفر، ومفيش فلوس ترجع للحساب،
      // فبنسجّل المرتجع من غير حركة بدل ما الحركة الصفرية ترفض العملية كلها.
      if (refundMethod === PAYMENTS.CREDIT && total > 0) {
        await customerService.applyBalanceChange(
          {
            customer: invoice.customer,
            amount: total,
            type: LEDGER_TYPES.REFUND,
            referenceType: 'return',
            reference: saleReturn._id,
            branch: invoice.branch,
            note: `مرتجع ${number}`,
            performedBy: cashier,
          },
          { session },
        );
      }

      await customerService.reversePurchase(
        { customer: invoice.customer, amount: total, invoice: invoice._id },
        { session },
      );

      // النقط اللي اتكسبت على القيمة المرتجعة بترجع.
      const points = Math.floor(total * settings.pointsPerCurrency);
      if (points > 0) {
        await customerService.applyPointsChange(
          {
            customer: invoice.customer,
            points: -points,
            reason: LOYALTY_ENTRY_TYPES.ADJUST,
            referenceType: 'return',
            reference: saleReturn._id,
            note: `سحب نقط مرتجع ${number}`,
            allowNegative: true,
          },
          { session },
        );
      }
    }

    return saleReturn;
  });
};

const buildFilter = ({ branch, invoice, customer, shift, from, to, search }) => {
  const filter = {};

  if (branch) filter.branch = branch;
  if (invoice) filter.invoice = invoice;
  if (customer) filter.customer = customer;
  if (shift) filter.shift = shift;
  if (search) filter.number = new RegExp(search, 'i');

  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = from;
    if (to) filter.createdAt.$lte = to;
  }

  return filter;
};

export const listReturns = ({ page, limit, sort, ...filters }) =>
  returnRepository.paginate(buildFilter(filters), {
    page,
    limit,
    sort: sort ?? '-createdAt',
    populate: [
      { path: 'branch', select: 'name code' },
      { path: 'cashier', select: 'name username' },
      { path: 'customer', select: 'name phone' },
      { path: 'invoice', select: 'number total createdAt' },
    ],
  });

export const getReturnById = async (id) => {
  const saleReturn = await returnRepository.findById(id, {
    populate: [
      { path: 'branch', select: 'name code' },
      { path: 'cashier', select: 'name username' },
      { path: 'customer', select: 'name phone' },
      { path: 'invoice', select: 'number total createdAt' },
      { path: 'lines.product', select: 'name sku unit' },
    ],
    lean: true,
  });

  if (!saleReturn) throw ApiError.notFound('المرتجع غير موجود');
  return saleReturn;
};

/** الأصناف المتاح إرجاعها من فاتورة — بتغذي شاشة المرتجعات. */
export const getReturnableLines = async (invoiceId) => {
  const invoice = await invoiceRepository.findById(invoiceId, {
    populate: { path: 'customer', select: 'name phone' },
  });

  if (!invoice) throw ApiError.notFound('الفاتورة غير موجودة');

  const ageDays = Math.floor(
    (Date.now() - invoice.createdAt.getTime()) / 86_400_000,
  );

  return {
    invoice: {
      id: invoice.id,
      number: invoice.number,
      total: invoice.total,
      status: invoice.status,
      createdAt: invoice.createdAt,
      customer: invoice.customer,
    },
    ageDays,
    isWithinWindow: ageDays <= RETURN_WINDOW_DAYS,
    windowDays: RETURN_WINDOW_DAYS,
    lines: invoice.lines
      .map((line) => ({
        invoiceLine: line._id,
        product: line.product,
        name: line.name,
        sku: line.sku,
        unit: line.unit,
        soldQuantity: line.quantity,
        returnedQuantity: line.returnedQuantity,
        remainingQuantity: round2(line.quantity - line.returnedQuantity),
        unitPrice: line.unitPrice,
        lineTotal: line.lineTotal,
      }))
      .filter((line) => line.remainingQuantity > 0),
  };
};

export const getReturnsSummary = ({ branch, from, to }) => {
  const match = {};

  if (branch) match.branch = toObjectId(branch);
  if (from || to) {
    match.createdAt = {};
    if (from) match.createdAt.$gte = from;
    if (to) match.createdAt.$lte = to;
  }

  return returnRepository
    .aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          returnsCount: { $sum: 1 },
          total: { $sum: '$total' },
          costTotal: { $sum: '$costTotal' },
        },
      },
    ])
    .then(([row]) => ({
      returnsCount: row?.returnsCount ?? 0,
      total: round2(row?.total ?? 0),
      costTotal: round2(row?.costTotal ?? 0),
    }));
};

/**
 * ملخص مرتجعات وردية واحدة.
 * بنفصل المرتجعات الكاش عن غيرها لأنها هي اللي بتخرج من الدرج فعلًا،
 * وبالتالي هي اللي بتأثر على الكاش المتوقع وقت التقفيل.
 */
export const summarizeByShift = async (shiftId) => {
  if (!shiftId) return { returnsCount: 0, total: 0, cashRefunds: 0 };

  const [row] = await returnRepository.aggregate([
    { $match: { shift: toObjectId(shiftId) } },
    {
      $group: {
        _id: null,
        returnsCount: { $sum: 1 },
        total: { $sum: '$total' },
        cashRefunds: {
          $sum: {
            $cond: [{ $eq: ['$refundMethod', PAYMENTS.CASH] }, '$total', 0],
          },
        },
      },
    },
  ]);

  return {
    returnsCount: row?.returnsCount ?? 0,
    total: round2(row?.total ?? 0),
    cashRefunds: round2(row?.cashRefunds ?? 0),
  };
};

export default {
  createReturn,
  listReturns,
  getReturnById,
  getReturnableLines,
  getReturnsSummary,
  summarizeByShift,
};
