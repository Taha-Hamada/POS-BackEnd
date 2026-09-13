import {
  INVOICE_STATUSES,
  LOYALTY_ENTRY_TYPES,
  PAYMENT_METHODS,
  STOCK_MOVEMENT_REASONS,
} from '../../core/constants/index.js';
import withTransaction from '../../core/db/transaction.js';
import { nextSequence } from '../../core/db/counter.model.js';
import { toObjectId } from '../../core/base/commonSchemas.js';
import ApiError from '../../core/errors/ApiError.js';
import * as customerService from '../customers/customer.service.js';
import { LEDGER_TYPES } from '../customers/customerLedger.model.js';
import {
  applyStockMovement,
  assertStockAvailable,
} from '../inventory/inventory.service.js';
import stockRepository from '../inventory/stock.repository.js';
import Product from '../products/product.model.js';
import { getSettings } from '../settings/settings.service.js';

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
    };
  });
};

const linesNeedingStock = (lines) => lines.filter((line) => line.trackStock);

/** بيشيل الحقول المساعدة اللي مش بتتخزن في المستند. */
const stripHelpers = (lines) =>
  lines.map(({ trackStock, ...line }) => line);

const assertPaymentsCover = ({ total, payments, settings, customer }) => {
  const settlement = settlePayments({ total, payments });

  if (settlement.shortfall > 0) {
    throw ApiError.badRequest(`المدفوع ناقص ${settlement.shortfall}`, {
      code: 'INSUFFICIENT_PAYMENT',
      details: [{ total, covered: settlement.covered }],
    });
  }

  if (settlement.creditAmount > 0) {
    if (settings.requireCustomerForCredit && !customer) {
      throw ApiError.badRequest('البيع الآجل لازم يكون على عميل مسجّل', {
        code: 'CREDIT_NEEDS_CUSTOMER',
      });
    }

    // الباقي مبيرجعش كاش لو جزء من الفاتورة آجل — ده بيخبّي خطأ في إدخال المبالغ.
    if (settlement.changeDue > 0) {
      throw ApiError.badRequest('مينفعش يكون فيه باقي مع دفع آجل', {
        code: 'CHANGE_WITH_CREDIT',
      });
    }
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
  const settings = await getSettings();
  const resolved = await resolveLines(requestedLines);

  const computed = calculateInvoice({
    lines: resolved,
    discount,
    taxRate: settings.taxRate,
  });

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

  if (settlement.creditAmount > 0 && customer) {
    await customerService.assertCreditAllowed(customer, settlement.creditAmount);
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

      await awardLoyaltyPoints(
        { customer, amount: computed.total, settings, invoice: invoice._id },
        { session },
      );
    }

    return invoice;
  });
};

/** نقط الولاء بتتحسب على الإجمالي بعد الضريبة وبتتقرّب للأسفل. */
const awardLoyaltyPoints = async (
  { customer, amount, settings, invoice },
  { session } = {},
) => {
  const points = Math.floor(amount * settings.pointsPerCurrency);
  if (points <= 0) return null;

  return customerService.applyPointsChange(
    {
      customer,
      points,
      reason: LOYALTY_ENTRY_TYPES.EARN,
      referenceType: 'invoice',
      reference: invoice,
      note: 'نقط فاتورة',
    },
    { session },
  );
};

/**
 * فاتورة معلّقة — الكاشير بيسيبها ويرجع لها.
 * بنحجز الرصيد عشان الفاتورة المعلّقة ماتخليش حاجة تتباع مرتين.
 */
export const holdInvoice = async ({
  branch,
  cashier,
  shift = null,
  customer = null,
  lines: requestedLines,
  discount = null,
  label = '',
  note = '',
}) => {
  const settings = await getSettings();
  const resolved = await resolveLines(requestedLines);

  const computed = calculateInvoice({
    lines: resolved,
    discount,
    taxRate: settings.taxRate,
  });

  const stockLines = linesNeedingStock(resolved);

  return withTransaction(async (session) => {
    const [invoice] = await invoiceRepository.model.create(
      [
        {
          branch,
          cashier,
          shift,
          customer,
          status: INVOICE_STATUSES.HELD,
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
          label: label || 'فاتورة معلّقة',
          note,
        },
      ],
      { session },
    );

    for (const line of stockLines) {
      const reserved = await stockRepository.reserve(
        line.product,
        branch,
        line.quantity,
        { session },
      );

      if (!reserved && !settings.allowNegativeStock) {
        throw ApiError.conflict(`الرصيد مش كافي لـ ${line.name}`, {
          code: 'INSUFFICIENT_STOCK',
        });
      }
    }

    return invoice;
  });
};

const releaseHeldReservations = async (invoice, { session } = {}) => {
  const productIds = invoice.lines.map((line) => line.product);
  const products = await Product.find({ _id: { $in: productIds } })
    .select('trackStock')
    .lean();
  const tracked = new Set(
    products.filter((item) => item.trackStock).map((item) => String(item._id)),
  );

  for (const line of invoice.lines) {
    if (!tracked.has(String(line.product))) continue;

    await stockRepository.release(line.product, invoice.branch, line.quantity, {
      session,
    });
  }
};

/** إلغاء فاتورة معلّقة — بيفكّ الحجز وبيمسحها لأنها لسه مش حركة مالية. */
export const discardHeldInvoice = async (id) => {
  const invoice = await invoiceRepository.findById(id);
  if (!invoice) throw ApiError.notFound('الفاتورة غير موجودة');

  if (invoice.status !== INVOICE_STATUSES.HELD) {
    throw ApiError.badRequest('الفاتورة دي مش معلّقة');
  }

  return withTransaction(async (session) => {
    await releaseHeldReservations(invoice, { session });
    await invoiceRepository.deleteById(id, { session });
    return { id, discarded: true };
  });
};

/**
 * إتمام فاتورة معلّقة.
 * بنفكّ الحجز الأول وبعدين نعيد الاعتماد من أول وجديد، عشان الأسعار والضريبة
 * تتحسب بنفس المسار اللي أي فاتورة عادية بتمشي فيه.
 */
export const checkoutHeldInvoice = async (id, { payments, discount, customer }) => {
  const invoice = await invoiceRepository.findById(id);
  if (!invoice) throw ApiError.notFound('الفاتورة غير موجودة');

  if (invoice.status !== INVOICE_STATUSES.HELD) {
    throw ApiError.badRequest('الفاتورة دي مش معلّقة');
  }

  await withTransaction(async (session) => {
    await releaseHeldReservations(invoice, { session });
    await invoiceRepository.deleteById(id, { session });
  });

  return createInvoice({
    branch: invoice.branch,
    cashier: invoice.cashier,
    shift: invoice.shift,
    customer: customer ?? invoice.customer,
    lines: invoice.lines.map((line) => ({
      product: line.product,
      quantity: line.quantity,
      discountType: line.discountType,
      discountValue: line.discountValue,
    })),
    discount:
      discount ??
      (invoice.discountType
        ? { type: invoice.discountType, value: invoice.discountValue }
        : null),
    payments,
    label: invoice.label,
    note: invoice.note,
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
  else filter.status = { $ne: INVOICE_STATUSES.HELD };

  if (paymentMethod) filter['payments.method'] = paymentMethod;
  if (search) filter.number = new RegExp(`${search}`, 'i');

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

export const listHeldInvoices = ({ branch, cashier }) =>
  invoiceRepository.find(
    {
      status: INVOICE_STATUSES.HELD,
      ...(branch ? { branch } : {}),
      ...(cashier ? { cashier } : {}),
    },
    { sort: '-createdAt', populate: { path: 'customer', select: 'name phone' } },
  );

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

  if (invoice.status === INVOICE_STATUSES.HELD) {
    throw ApiError.badRequest('الفاتورة المعلّقة تتلغى من مسار المعلّقات');
  }

  if (invoice.returnedTotal > 0) {
    throw ApiError.badRequest('الفاتورة عليها مرتجعات، مينفعش تتلغى', {
      code: 'HAS_RETURNS',
    });
  }

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
  const match = { status: { $nin: [INVOICE_STATUSES.HELD, INVOICE_STATUSES.VOIDED] } };

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
  holdInvoice,
  discardHeldInvoice,
  checkoutHeldInvoice,
  listInvoices,
  listHeldInvoices,
  getInvoiceById,
  getInvoiceByNumber,
  voidInvoice,
  getBranchSummary,
  getPaymentBreakdown,
};
