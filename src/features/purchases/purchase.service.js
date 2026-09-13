import BaseRepository from '../../core/base/BaseRepository.js';
import { toSearchRegex } from '../../core/base/commonSchemas.js';
import {
  PURCHASE_ORDER_STATUSES,
  STOCK_MOVEMENT_REASONS,
} from '../../core/constants/index.js';
import { nextSequence } from '../../core/db/counter.model.js';
import withTransaction from '../../core/db/transaction.js';
import ApiError from '../../core/errors/ApiError.js';
import { round2 } from '../../core/utils/money.js';
import { applyStockMovement } from '../inventory/inventory.service.js';
import stockRepository from '../inventory/stock.repository.js';
import Product from '../products/product.model.js';
import * as supplierService from '../suppliers/supplier.service.js';
import supplierRepository from '../suppliers/supplier.repository.js';

import PurchaseOrder from './purchaseOrder.model.js';

const orderRepository = new BaseRepository(PurchaseOrder);

const POPULATE = [
  { path: 'supplier', select: 'name phone contactPerson balanceDue' },
  { path: 'branch', select: 'name code' },
  { path: 'createdBy', select: 'name username' },
];

const STATUS = PURCHASE_ORDER_STATUSES;

/** بيجهّز سطور الأمر: الاسم والكود من المنتج، والتكلفة من الطلب لأنها بتتفاوض عليها. */
const resolveLines = async (requestedLines) => {
  const ids = requestedLines.map((line) => line.product);
  const products = await Product.find({ _id: { $in: ids } })
    .select('name sku cost')
    .lean();
  const byId = new Map(products.map((product) => [String(product._id), product]));

  return requestedLines.map((line) => {
    const product = byId.get(String(line.product));
    if (!product) throw ApiError.badRequest('في منتج مش موجود في الأمر');

    const unitCost = line.unitCost ?? product.cost;

    return {
      product: product._id,
      name: product.name,
      sku: product.sku,
      quantity: line.quantity,
      receivedQuantity: 0,
      unitCost,
      lineTotal: round2(unitCost * line.quantity),
    };
  });
};

const totalsFor = (lines, shippingCost = 0) => {
  const subtotal = round2(lines.reduce((sum, line) => sum + line.lineTotal, 0));
  return { subtotal, total: round2(subtotal + shippingCost) };
};

export const createOrder = async ({
  supplier,
  branch,
  lines: requestedLines,
  expectedDate,
  shippingCost = 0,
  note = '',
  createdBy,
}) => {
  const exists = await supplierRepository.exists({ _id: supplier, isActive: true });
  if (!exists) throw ApiError.badRequest('المورد غير موجود أو معطل');

  const lines = await resolveLines(requestedLines);
  const { subtotal, total } = totalsFor(lines, shippingCost);
  const number = await nextSequence('purchase', { prefix: 'PO', padding: 5 });

  const order = await orderRepository.create({
    number,
    supplier,
    branch,
    lines,
    subtotal,
    shippingCost,
    total,
    expectedDate,
    note,
    createdBy,
  });

  return order.populate(POPULATE);
};

const assertDraft = (order) => {
  if (order.status !== STATUS.DRAFT) {
    throw ApiError.badRequest('الأمر اتأكد بالفعل، التعديل مش متاح', {
      code: 'ORDER_NOT_DRAFT',
    });
  }
};

export const updateOrder = async (id, payload) => {
  const order = await orderRepository.findById(id);
  if (!order) throw ApiError.notFound('أمر الشراء غير موجود');

  assertDraft(order);

  if (payload.lines) {
    order.lines = await resolveLines(payload.lines);
  }

  if (payload.shippingCost !== undefined) order.shippingCost = payload.shippingCost;
  if (payload.expectedDate !== undefined) order.expectedDate = payload.expectedDate;
  if (payload.note !== undefined) order.note = payload.note;

  const { subtotal, total } = totalsFor(order.lines, order.shippingCost);
  order.subtotal = subtotal;
  order.total = total;

  await order.save();

  return order.populate(POPULATE);
};

/** التأكيد بيقفل باب التعديل ويخلي الأمر جاهز للاستلام. */
export const confirmOrder = async (id) => {
  const order = await orderRepository.findById(id);
  if (!order) throw ApiError.notFound('أمر الشراء غير موجود');

  assertDraft(order);

  order.status = STATUS.CONFIRMED;
  order.confirmedAt = new Date();
  await order.save();

  return order.populate(POPULATE);
};

export const cancelOrder = async (id, { reason }) => {
  const order = await orderRepository.findById(id);
  if (!order) throw ApiError.notFound('أمر الشراء غير موجود');

  if (order.status === STATUS.COMPLETED) {
    throw ApiError.badRequest('الأمر مكتمل، مينفعش يتلغى');
  }

  if (order.status === STATUS.CANCELLED) {
    throw ApiError.badRequest('الأمر ملغي بالفعل');
  }

  // الاستلام الجزئي بيبقى دخل المخزن فعلًا، فإلغاؤه محتاج مرتجع مشتريات مش إلغاء.
  if (order.receivedQuantity > 0) {
    throw ApiError.badRequest('الأمر اتستلم جزئيًا، مينفعش يتلغى', {
      code: 'PARTIALLY_RECEIVED',
    });
  }

  order.status = STATUS.CANCELLED;
  order.cancelledAt = new Date();
  order.cancelReason = reason;
  await order.save();

  return order.populate(POPULATE);
};

/**
 * استلام بضاعة.
 * بيزوّد المخزون، بيحمّل القيمة المستلمة على حساب المورد،
 * وبيحدّث تكلفة المنتج بالمتوسط المرجح عشان تقرير الأرباح يفضل واقعي.
 */
export const receiveOrder = async (
  id,
  { lines: requestedLines, updateCost = true, userId },
) => {
  const order = await orderRepository.findById(id);
  if (!order) throw ApiError.notFound('أمر الشراء غير موجود');

  if (![STATUS.CONFIRMED, STATUS.PARTIALLY_RECEIVED].includes(order.status)) {
    throw ApiError.badRequest('الأمر مش في حالة تسمح بالاستلام', {
      code: 'ORDER_NOT_RECEIVABLE',
    });
  }

  const receipts = requestedLines.map((requested) => {
    const line = order.lines.id(requested.orderLine);
    if (!line) throw ApiError.badRequest('في سطر مش موجود في الأمر');

    const remaining = round2(line.quantity - line.receivedQuantity);

    if (requested.quantity > remaining) {
      throw ApiError.badRequest(
        `المتبقي من ${line.name} هو ${remaining} بس`,
        { code: 'RECEIPT_EXCEEDS_ORDERED' },
      );
    }

    return { line, quantity: requested.quantity, unitCost: requested.unitCost ?? line.unitCost };
  });

  const receivedValue = round2(
    receipts.reduce((sum, receipt) => sum + receipt.quantity * receipt.unitCost, 0),
  );

  return withTransaction(async (session) => {
    for (const receipt of receipts) {
      await applyStockMovement(
        {
          product: receipt.line.product,
          branch: order.branch,
          quantity: receipt.quantity,
          reason: STOCK_MOVEMENT_REASONS.PURCHASE,
          referenceType: 'purchase_order',
          reference: order._id,
          unitCost: receipt.unitCost,
          note: `استلام أمر ${order.number}`,
          performedBy: userId,
        },
        { session },
      );

      if (updateCost) {
        await updateWeightedCost(receipt, order.branch, { session });
      }

      receipt.line.receivedQuantity = round2(
        receipt.line.receivedQuantity + receipt.quantity,
      );
    }

    order.receivedValue = round2(order.receivedValue + receivedValue);

    const fullyReceived = order.lines.every(
      (line) => line.receivedQuantity >= line.quantity,
    );

    order.status = fullyReceived ? STATUS.COMPLETED : STATUS.PARTIALLY_RECEIVED;
    if (fullyReceived) order.completedAt = new Date();

    await order.save({ session });

    await supplierService.addDue(
      { supplier: order.supplier, amount: receivedValue },
      { session },
    );

    if (fullyReceived) {
      await supplierRepository.recordPurchase(order.supplier, order.receivedValue, {
        session,
      });
    }

    return order.populate(POPULATE);
  });
};

/**
 * متوسط مرجح للتكلفة: (الرصيد القديم × التكلفة القديمة + الكمية الجديدة × سعرها) ÷ الإجمالي.
 * من غير كده أول استلام بسعر مختلف بيقلب هامش الربح على كل الرصيد القديم.
 */
const updateWeightedCost = async (receipt, branchId, { session } = {}) => {
  const product = await Product.findById(receipt.line.product).session(session ?? null);
  if (!product) return;

  const stock = await stockRepository.findForProduct(product._id, branchId, {
    session,
  });

  // الرصيد بعد الاستلام ناقص الكمية الجديدة = الرصيد اللي كان موجود قبلها.
  const previousQuantity = Math.max(0, (stock?.quantity ?? 0) - receipt.quantity);
  const totalQuantity = previousQuantity + receipt.quantity;

  if (totalQuantity <= 0) return;

  const weighted = round2(
    (previousQuantity * product.cost + receipt.quantity * receipt.unitCost) /
      totalQuantity,
  );

  if (weighted === product.cost) return;

  product.cost = weighted;
  await product.save({ session });
};

const buildFilter = ({ supplier, branch, status, from, to, search }) => {
  const filter = {};

  if (supplier) filter.supplier = supplier;
  if (branch) filter.branch = branch;
  if (status) filter.status = status;
  if (search) filter.number = toSearchRegex(search);

  if (from || to) {
    filter.orderDate = {};
    if (from) filter.orderDate.$gte = from;
    if (to) filter.orderDate.$lte = to;
  }

  return filter;
};

export const listOrders = ({ page, limit, sort, ...filters }) =>
  orderRepository.paginate(buildFilter(filters), {
    page,
    limit,
    sort: sort ?? '-orderDate',
    populate: POPULATE,
    select: '-lines',
  });

export const getOrderById = async (id) => {
  const order = await orderRepository.findById(id, { populate: POPULATE });
  if (!order) throw ApiError.notFound('أمر الشراء غير موجود');
  return order;
};

export default {
  createOrder,
  updateOrder,
  confirmOrder,
  cancelOrder,
  receiveOrder,
  listOrders,
  getOrderById,
};
