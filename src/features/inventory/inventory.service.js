import mongoose from 'mongoose';

import { STOCK_MOVEMENT_REASONS } from '../../core/constants/index.js';
import ApiError from '../../core/errors/ApiError.js';
import withTransaction from '../../core/db/transaction.js';
import Product from '../products/product.model.js';

import stockRepository from './stock.repository.js';

/**
 * العملية الوحيدة اللي بتغيّر الرصيد في النظام كله.
 * أي فيتشر تاني (بيع، مرتجع، شراء، جرد) بينادي عليها بدل ما يلمس الرصيد بنفسه،
 * فبنضمن إن كل تغيير له سطر في سجل الحركات.
 */
export const applyStockMovement = async (
  {
    product: productId,
    branch: branchId,
    quantity,
    reason,
    referenceType = null,
    reference = null,
    unitCost = null,
    note = '',
    performedBy = null,
    allowNegative = false,
  },
  { session } = {},
) => {
  if (!quantity) throw ApiError.badRequest('كمية الحركة مينفعش تكون صفر');

  await stockRepository.ensureRecord(productId, branchId, { session });

  const updated = await stockRepository.applyDelta(productId, branchId, quantity, {
    session,
    allowNegative,
  });

  // الفلتر الذري هو اللي رفض، يعني الرصيد مكفاش وقت التنفيذ بالظبط.
  if (!updated) {
    const current = await stockRepository.findForProduct(productId, branchId, {
      session,
    });
    throw ApiError.conflict('الرصيد مش كافي للحركة دي', {
      code: 'INSUFFICIENT_STOCK',
      details: [
        {
          product: String(productId),
          available: current?.quantity ?? 0,
          requested: Math.abs(quantity),
        },
      ],
    });
  }

  const movement = await stockRepository.recordMovement(
    {
      product: productId,
      branch: branchId,
      quantity,
      balanceAfter: updated.quantity,
      reason,
      referenceType,
      reference,
      unitCost,
      note,
      performedBy,
    },
    { session },
  );

  return { stock: updated, movement };
};

/** بينفّذ مجموعة حركات مع بعض — بتستخدمها الفاتورة عشان سطورها كلها تعدي أو تفشل سوا. */
export const applyManyMovements = async (movements, { session } = {}) => {
  const results = [];

  for (const movement of movements) {
    results.push(await applyStockMovement(movement, { session }));
  }

  return results;
};

/** بيتأكد إن كل سطور الطلب متوفرة قبل ما نبدأ نخصم أي حاجة. */
export const assertStockAvailable = async (lines, branchId, { session } = {}) => {
  const trackedIds = lines.map((line) => line.product);

  const products = await Product.find({ _id: { $in: trackedIds } })
    .select('name trackStock')
    .lean();

  const productById = new Map(products.map((item) => [String(item._id), item]));
  const stocks = await stockRepository.findManyForBranch(trackedIds, branchId, {
    session,
  });
  const stockByProduct = new Map(stocks.map((item) => [String(item.product), item]));

  const shortages = [];

  for (const line of lines) {
    const product = productById.get(String(line.product));
    if (!product) throw ApiError.badRequest('منتج في الطلب مش موجود');
    if (!product.trackStock) continue;

    const available = stockByProduct.get(String(line.product))?.quantity ?? 0;

    if (available < line.quantity) {
      shortages.push({
        product: String(line.product),
        name: product.name,
        available,
        requested: line.quantity,
      });
    }
  }

  if (shortages.length > 0) {
    throw ApiError.conflict('في أصناف رصيدها مش كافي', {
      code: 'INSUFFICIENT_STOCK',
      details: shortages,
    });
  }
};

export const getStockForBranch = async ({
  branch,
  page,
  limit,
  sort,
  status,
  category,
  search,
}) => {
  const match = { branch };

  const result = await stockRepository.paginate(match, {
    page,
    limit,
    sort: sort ?? '-updatedAt',
    populate: {
      path: 'product',
      select: 'name sku barcode category price cost unit minStock isActive',
      populate: { path: 'category', select: 'name icon color' },
    },
  });

  // الفلترة على المنتج بتتم بعد الـ populate لأن بياناته في مجموعة تانية.
  // وحد الطلب الفعلي = تجاوز الفرع لو موجود، وإلا حد المنتج.
  let items = result.items
    .filter((item) => item.product)
    .map((item) => ({
      ...item,
      effectiveMinStock: item.minStock ?? item.product.minStock ?? 0,
    }));

  if (category) {
    items = items.filter(
      (item) => String(item.product.category?._id ?? item.product.category) === String(category),
    );
  }

  if (search) {
    const needle = String(search).toLowerCase();
    items = items.filter(
      (item) =>
        item.product.name.toLowerCase().includes(needle) ||
        item.product.sku.toLowerCase().includes(needle),
    );
  }

  if (status === 'out') items = items.filter((item) => item.quantity <= 0);
  if (status === 'low') {
    items = items.filter(
      (item) => item.quantity > 0 && item.quantity <= item.effectiveMinStock,
    );
  }
  if (status === 'ok') {
    items = items.filter((item) => item.quantity > item.effectiveMinStock);
  }

  return { items, pagination: result.pagination };
};

export const listMovements = ({
  branch,
  product,
  reason,
  from,
  to,
  page,
  limit,
}) => {
  const filter = {};

  if (branch) filter.branch = branch;
  if (product) filter.product = product;
  if (reason) filter.reason = reason;
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = from;
    if (to) filter.createdAt.$lte = to;
  }

  return stockRepository.listMovements(filter, {
    page,
    limit,
    sort: '-createdAt',
    populate: [
      { path: 'product', select: 'name sku unit' },
      { path: 'branch', select: 'name code' },
      { path: 'performedBy', select: 'name username' },
    ],
  });
};

/** تسوية يدوية — الكمية اللي بتتبعت هي الفرق مش الرصيد النهائي. */
export const adjustStock = async ({
  product,
  branch,
  quantity,
  note,
  performedBy,
}) =>
  applyStockMovement({
    product,
    branch,
    quantity,
    reason: STOCK_MOVEMENT_REASONS.ADJUSTMENT,
    note,
    performedBy,
    // التسوية بالسالب مسموح لها توصل تحت الصفر لأنها بتصحح رصيد غلط أصلا.
    allowNegative: quantity < 0,
  });

/** جرد — بنستقبل الرصيد الفعلي المعدود وبنسجل الفرق كحركة. */
export const stocktake = async ({
  product,
  branch,
  countedQuantity,
  note,
  performedBy,
}) => {
  const record = await stockRepository.ensureRecord(product, branch);
  const delta = countedQuantity - record.quantity;

  if (delta === 0) {
    return { stock: record, movement: null, delta: 0 };
  }

  const result = await applyStockMovement({
    product,
    branch,
    quantity: delta,
    reason: STOCK_MOVEMENT_REASONS.STOCKTAKE,
    note: note || `جرد: المعدود ${countedQuantity} مقابل ${record.quantity} بالنظام`,
    performedBy,
    allowNegative: true,
  });

  await stockRepository.updateById(result.stock._id, {
    lastCountedAt: new Date(),
  });

  return { ...result, delta };
};

/**
 * تحويل بين فرعين — خصم من المصدر وإضافة للوجهة.
 * بيتلف في transaction لو الداتابيز بتدعمها عشان مايحصلش خصم من غير إضافة.
 */
export const transferStock = async ({
  product,
  fromBranch,
  toBranch,
  quantity,
  note,
  performedBy,
}) => {
  if (String(fromBranch) === String(toBranch)) {
    throw ApiError.badRequest('فرع المصدر والوجهة لازم يكونوا مختلفين');
  }

  return withTransaction(async (session) => {
    const out = await applyStockMovement(
      {
        product,
        branch: fromBranch,
        quantity: -quantity,
        reason: STOCK_MOVEMENT_REASONS.TRANSFER_OUT,
        note,
        performedBy,
      },
      { session },
    );

    const incoming = await applyStockMovement(
      {
        product,
        branch: toBranch,
        quantity,
        reason: STOCK_MOVEMENT_REASONS.TRANSFER_IN,
        note,
        performedBy,
      },
      { session },
    );

    return { from: out.stock, to: incoming.stock };
  });
};

export const setMinStock = async ({ product, branch, minStock }) => {
  const record = await stockRepository.ensureRecord(product, branch, { minStock });

  record.minStock = minStock;
  await record.save();

  return record;
};

/** أصناف تحت حد الطلب — بتغذي تنبيهات الداشبورد. */
export const getLowStockAlerts = async ({ branch, limit = 50 }) => {
  // التجميع مبيحوّلش النصوص لـ ObjectId زي الاستعلام العادي، فبنحوّل بنفسنا.
  const match = branch
    ? { branch: new mongoose.Types.ObjectId(String(branch)) }
    : {};

  // المقارنة محتاجة حد المنتج، فالربط بييجي قبل الفلترة مش بعدها.
  return stockRepository.aggregate([
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
      $addFields: {
        effectiveMinStock: {
          $ifNull: ['$minStock', { $ifNull: ['$product.minStock', 0] }],
        },
      },
    },
    { $match: { $expr: { $lte: ['$quantity', '$effectiveMinStock'] } } },
    { $sort: { quantity: 1 } },
    { $limit: limit },
    {
      $lookup: {
        from: 'branches',
        localField: 'branch',
        foreignField: '_id',
        as: 'branch',
      },
    },
    { $unwind: '$branch' },
    {
      $project: {
        quantity: 1,
        minStock: 1,
        effectiveMinStock: 1,
        'product._id': 1,
        'product.name': 1,
        'product.sku': 1,
        'product.unit': 1,
        'branch._id': 1,
        'branch.name': 1,
      },
    },
  ]);
};

export default {
  applyStockMovement,
  applyManyMovements,
  assertStockAvailable,
  getStockForBranch,
  listMovements,
  adjustStock,
  stocktake,
  transferStock,
  setMinStock,
  getLowStockAlerts,
};
