import {
  INVOICE_STATUSES,
  PAYMENT_METHODS,
  SHIFT_STATUSES,
  STOCK_MOVEMENT_REASONS,
} from '../../core/constants/index.js';
import withTransaction from '../../core/db/transaction.js';
import { nextSequence } from '../../core/db/counter.model.js';
import { toObjectId, toSearchRegex } from '../../core/base/commonSchemas.js';
import ApiError from '../../core/errors/ApiError.js';
import * as customerService from '../customers/customer.service.js';
import { LEDGER_TYPES } from '../customers/customerLedger.model.js';
import {
  applyStockMovement,
  assertStockAvailable,
} from '../inventory/inventory.service.js';
import Product from '../products/product.model.js';
import {
  applyPromotions,
  appliedPromotionIds,
} from '../promotions/promotion.pricing.js';
import promotionRepository from '../promotions/promotion.repository.js';
import { getSettings } from '../settings/settings.service.js';
import * as shiftService from '../shifts/shift.service.js';

import invoiceRepository from './invoice.repository.js';
import { calculateInvoice, settlePayments } from './invoice.pricing.js';

/**
 * بيحوّل سطور الطلب لسطور فاتورة كاملة.
 * السعر والتكلفة والاسم بييجوا من المنتج مش من العميل، عشان محدش يبعت سعره بنفسه.
 */
const resolveLines = async (requestedLines) => {
  const ids = requestedLines.map((line) => line.product);
  const products = await Product.find({ _id: { $in: ids } }).lean();
  const byId = new Map(products.map((product) => [String(product._id), product]));

  return requestedLines.map((line) => {
    const product = byId.get(String(line.product));

    if (!product) throw ApiError.badRequest('في منتج مش موجود في الطلب');
    if (!product.isActive) {
      throw ApiError.badRequest(`المنتج ${product.name} متوقف عن البيع`);
    }

    // السعر بيتأخذ من متغير المنتج لو اتحدد، وإلا من المنتج نفسه.
    const variant = line.variantId
      ? product.variants?.find((item) => String(item._id) === String(line.variantId))
      : null;

    if (line.variantId && !variant) {
      throw ApiError.badRequest(`المتغير المطلوب من ${product.name} مش موجود`);
    }

    return {
      product: product._id,
      name: product.name,
      sku: variant?.sku || product.sku,
      unit: product.unit,
      quantity: line.quantity,
      unitPrice: variant?.priceOverride ?? product.price,
      unitCost: product.cost,
      discountType: line.discountType ?? null,
      discountValue: line.discountValue ?? 0,
      isTaxable: product.isTaxable,
      trackStock: product.trackStock,
      category: product.category,
    };
  });
};

const linesNeedingStock = (lines) => lines.filter((line) => line.trackStock);

/** بيشيل الحقول المساعدة اللي مش بتتخزن في المستند. */
const stripHelpers = (lines) =>
  lines.map(({ trackStock, category, ...line }) => line);

/**
 * كل اللي بيحدد سعر الفاتورة غير الأصناف: الإعدادات والعروض الشغالة.
 * البيع والتعليق بيحسبوا بنفس الدالة عشان مايختلفوش.
 */
const priceSale = async ({ requestedLines, discount }) => {
  const [settings, promotions, resolved] = await Promise.all([
    getSettings(),
    promotionRepository.findLive(),
    resolveLines(requestedLines),
  ]);

  const priced = applyPromotions(resolved, promotions);

  const computed = calculateInvoice({
    lines: priced,
    discount,
    taxRate: settings.taxRate,
  });

  return { settings, resolved: priced, computed };
};

/** حقول الخصم اللي بتتخزن مع الفاتورة معتمدة كانت أو معلّقة. */
const pricingFields = ({ computed, discount }) => ({
  lines: stripHelpers(computed.lines),
  discountType: discount?.type ?? null,
  discountValue: discount?.value ?? 0,
  subtotal: computed.subtotal,
  lineDiscountTotal: computed.lineDiscountTotal,
  invoiceDiscount: computed.invoiceDiscount,
  taxRate: computed.taxRate,
  taxAmount: computed.taxAmount,
  total: computed.total,
  costTotal: computed.costTotal,
});

const assertPaymentsCover = ({ total, payments, settings, customer }) => {
  const settlement = settlePayments({ total, payments });

  if (settlement.shortfall > 0) {
    throw ApiError.badRequest(`المدفوع ناقص ${settlement.shortfall}`, {
      code: 'INSUFFICIENT_PAYMENT',
      details: [{ total, covered: settlement.covered }],
    });
  }

  // الفيزا والمحفظة والآجل بتتسجّل بالمبلغ بالظبط، فالزيادة فيهم غلط إدخال
  // مش باقي — من غير الفحص ده الكاشير كان يقدر يطلّع فكّة من فاتورة فيزا.
  if (settlement.overpaidNonCash > 0) {
    throw ApiError.badRequest(
      `المدفوع بغير الكاش أكبر من المطلوب بـ ${settlement.overpaidNonCash}`,
      { code: 'NON_CASH_OVERPAY', details: [{ total, covered: settlement.covered }] },
    );
  }

  if (settlement.creditAmount > 0 && settings.requireCustomerForCredit && !customer) {
    throw ApiError.badRequest('البيع الآجل لازم يكون على عميل مسجّل', {
      code: 'CREDIT_NEEDS_CUSTOMER',
    });
  }

  return settlement;
};

/**
 * اعتماد فاتورة بيع.
 * الترتيب مقصود: نحسب، نتأكد من الرصيد والآجل، بعدين نخصم ونسجّل.
 * كل اللي بيلمس الداتابيز بيتلف في transaction لو الداتابيز بتدعمها.
 */
export const createInvoice = async ({
  branch,
  cashier,
  shift = null,
  customer = null,
  lines: requestedLines,
  discount = null,
  payments = [],
  label = '',
  note = '',
}) => {
  const pricing = await priceSale({ requestedLines, discount, customer });
  const { settings, resolved, computed } = pricing;

  const settlement = assertPaymentsCover({
    total: computed.total,
    payments,
    settings,
    customer,
  });

  const stockLines = linesNeedingStock(resolved);

  if (!settings.allowNegativeStock && stockLines.length > 0) {
    await assertStockAvailable(stockLines, branch);
  }

  return withTransaction(async (session) => {
    const number = await nextSequence('invoice', { prefix: 'INV', session });

    const [invoice] = await invoiceRepository.model.create(
      [
        {
          number,
          branch,
          cashier,
          shift,
          customer,
          status: INVOICE_STATUSES.COMPLETED,
          ...pricingFields({ ...pricing, discount }),
          payments,
          paidAmount: settlement.paidAmount,
          creditAmount: settlement.creditAmount,
          changeDue: settlement.changeDue,
          label,
          note,
        },
      ],
      { session },
    );

    // عدّاد الاستخدام بيزيد مرة لكل فاتورة، مهما العرض اتطبق على كام سطر.
    const promotionIds = appliedPromotionIds(computed.lines);
    if (promotionIds.length > 0) {
      await promotionRepository.incrementUsage(promotionIds, { session });
    }

    for (const line of stockLines) {
      await applyStockMovement(
        {
          product: line.product,
          branch,
          quantity: -line.quantity,
          reason: STOCK_MOVEMENT_REASONS.SALE,
          referenceType: 'invoice',
          reference: invoice._id,
          unitCost: line.unitCost,
          performedBy: cashier,
          allowNegative: settings.allowNegativeStock,
        },
        { session },
      );
    }

    if (customer) {
      await customerService.registerPurchase(
        { customer, amount: computed.total },
        { session },
      );

      if (settlement.creditAmount > 0) {
        await customerService.applyBalanceChange(
          {
            customer,
            amount: -settlement.creditAmount,
            type: LEDGER_TYPES.SALE,
            referenceType: 'invoice',
            reference: invoice._id,
            branch,
            note: `فاتورة ${number}`,
            performedBy: cashier,
          },
          { session },
        );
      }
    }

    return invoice;
  });
};

const buildFilter = ({
  branch,
  cashier,
  customer,
  shift,
  status,
  paymentMethod,
  from,
  to,
  minTotal,
  maxTotal,
  search,
}) => {
  const filter = {};

  if (branch) filter.branch = branch;
  if (cashier) filter.cashier = cashier;
  if (customer) filter.customer = customer;
  if (shift) filter.shift = shift;
  if (status) filter.status = status;

  if (paymentMethod) filter['payments.method'] = paymentMethod;
  if (search) filter.number = toSearchRegex(search);

  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = from;
    if (to) filter.createdAt.$lte = to;
  }

  if (minTotal !== undefined || maxTotal !== undefined) {
    filter.total = {};
    if (minTotal !== undefined) filter.total.$gte = minTotal;
    if (maxTotal !== undefined) filter.total.$lte = maxTotal;
  }

  return filter;
};

export const listInvoices = ({ page, limit, sort, ...filters }) =>
  invoiceRepository.paginate(buildFilter(filters), {
    page,
    limit,
    sort: sort ?? '-createdAt',
    populate: invoiceRepository.listPopulate(),
    select: '-lines',
  });

export const getInvoiceById = async (id) => {
  const invoice = await invoiceRepository.findById(id, {
    populate: invoiceRepository.detailPopulate(),
    lean: true,
  });

  if (!invoice) throw ApiError.notFound('الفاتورة غير موجودة');
  return invoice;
};

export const getInvoiceByNumber = async (number) => {
  const invoice = await invoiceRepository.findByNumber(number);
  if (!invoice) throw ApiError.notFound('مفيش فاتورة بالرقم ده');
  return invoice;
};

/** بيرفض إلغاء فاتورة وردیتها اتقفلت — التقفيل جمّد أرقامها. */
const assertShiftStillOpen = async (shiftId) => {
  if (!shiftId) return;

  const shift = await shiftService.getShiftForInvoice(shiftId);
  if (!shift || shift.status === SHIFT_STATUSES.OPEN) return;

  throw ApiError.badRequest(
    'الفاتورة من وردية مقفولة — سجّل مرتجع بدل الإلغاء',
    { code: 'SHIFT_CLOSED' },
  );
};

/**
 * إلغاء فاتورة معتمدة.
 * بنرجّع المخزون ونعكس الآجل والنقط، وبنسيب الفاتورة نفسها بحالة ملغاة
 * عشان الرقم المتسلسل مايختفيش من السجل.
 */
export const voidInvoice = async (id, { reason, userId }) => {
  const invoice = await invoiceRepository.findById(id);
  if (!invoice) throw ApiError.notFound('الفاتورة غير موجودة');

  if (invoice.status === INVOICE_STATUSES.VOIDED) {
    throw ApiError.badRequest('الفاتورة ملغاة بالفعل');
  }

  if (invoice.returnedTotal > 0) {
    throw ApiError.badRequest('الفاتورة عليها مرتجعات، مينفعش تتلغى', {
      code: 'HAS_RETURNS',
    });
  }

  // الإلغاء بيشيل الفاتورة من أرقام ورديتها، فلو الوردية اتقفلت الكاش
  // بيخرج من الدرج الحالي ومحدش بيحسبه. المرتجع هو الأداة الصح بعد
  // التقفيل: بيتسجّل على الوردية المفتوحة وبينزل من درجها.
  await assertShiftStillOpen(invoice.shift);

  const productIds = invoice.lines.map((line) => line.product);
  const products = await Product.find({ _id: { $in: productIds } })
    .select('trackStock')
    .lean();
  const tracked = new Set(
    products.filter((item) => item.trackStock).map((item) => String(item._id)),
  );

  return withTransaction(async (session) => {
    for (const line of invoice.lines) {
      if (!tracked.has(String(line.product))) continue;

      await applyStockMovement(
        {
          product: line.product,
          branch: invoice.branch,
          quantity: line.quantity,
          reason: STOCK_MOVEMENT_REASONS.RETURN,
          referenceType: 'invoice_void',
          reference: invoice._id,
          unitCost: line.unitCost,
          note: `إلغاء فاتورة ${invoice.number}`,
          performedBy: userId,
        },
        { session },
      );
    }

    if (invoice.customer) {
      if (invoice.creditAmount > 0) {
        await customerService.applyBalanceChange(
          {
            customer: invoice.customer,
            amount: invoice.creditAmount,
            type: LEDGER_TYPES.REFUND,
            referenceType: 'invoice_void',
            reference: invoice._id,
            branch: invoice.branch,
            note: `إلغاء فاتورة ${invoice.number}`,
            performedBy: userId,
          },
          { session },
        );
      }

      await customerService.reversePurchase(
        { customer: invoice.customer, amount: invoice.total, invoice: invoice._id },
        { session },
      );
    }

    invoice.status = INVOICE_STATUSES.VOIDED;
    invoice.voidedAt = new Date();
    invoice.voidedBy = userId;
    invoice.voidReason = reason;
    await invoice.save({ session });

    return invoice;
  });
};

export const buildSummaryMatch = ({ branch, cashier, shift, from, to }) => {
  const match = { status: { $ne: INVOICE_STATUSES.VOIDED } };

  if (branch) match.branch = toObjectId(branch);
  if (cashier) match.cashier = toObjectId(cashier);
  if (shift) match.shift = toObjectId(shift);
  if (from || to) {
    match.createdAt = {};
    if (from) match.createdAt.$gte = from;
    if (to) match.createdAt.$lte = to;
  }

  return match;
};

export const getBranchSummary = (filters) =>
  invoiceRepository.summarize(buildSummaryMatch(filters));

/** تفصيل المبيعات بطريقة الدفع — بتستخدمه الوردية وتقفيل الدرج. */
export const getPaymentBreakdown = (filters) =>
  invoiceRepository.totalsByPaymentMethod(buildSummaryMatch(filters));

export const PAYMENT = PAYMENT_METHODS;

export default {
  createInvoice,
  listInvoices,
  getInvoiceById,
  getInvoiceByNumber,
  voidInvoice,
  getBranchSummary,
  getPaymentBreakdown,
};
