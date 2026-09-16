import mongoose from 'mongoose';

import { toObjectId, toSearchRegex } from '../../core/base/commonSchemas.js';
import { STOCK_MOVEMENT_REASONS } from '../../core/constants/index.js';
import {
  buildPagination,
  buildPaginationMeta,
} from '../../core/utils/pagination.js';
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

/**
 * قائمة المخزون لفرع، مفلترة ومرتّبة ومقسّمة لصفحات.
 *
 * الفلترة بتتعمل في التجميع مش بعد الترقيم. قبل كده كنا بنجيب صفحة الأول
 * وبعدين نفلترها، فطلب «الأصناف الناقصة» كان بيرجّع الناقص اللي في الصفحة
 * الأولى بس، والعدّاد كان بيعد كل الأصناف مش المفلترة.
 */
export const getStockForBranch = async ({
  branch,
  page,
  limit,
  sort,
  status,
  category,
  search,
}) => {
  const { page: safePage, limit: safeLimit, skip } = buildPagination({ page, limit });

  const pipeline = [
    { $match: { branch: toObjectId(branch) } },
    {
      $lookup: {
        from: 'products',
        localField: 'product',
        foreignField: '_id',
        as: 'product',
      },
    },
    { $unwind: '$product' },
    // نفس فلتر بطاقات الملخص وتنبيهات النواقص: المنتج المعطّل أو اللي
    // مخزونه مش متتبّع مبيبانش في الجدول، وإلا الأرقام فوق تناقض الصفوف.
    { $match: { 'product.isActive': true, 'product.trackStock': true } },
    {
      $lookup: {
        from: 'categories',
        localField: 'product.category',
        foreignField: '_id',
        as: 'product.category',
      },
    },
    { $unwind: { path: '$product.category', preserveNullAndEmptyArrays: true } },
    {
      // حد الطلب الفعلي = تجاوز الفرع لو موجود، وإلا حد المنتج.
      $addFields: {
        effectiveMinStock: {
          $ifNull: ['$minStock', { $ifNull: ['$product.minStock', 0] }],
        },
        available: { $subtract: ['$quantity', '$reserved'] },
      },
    },
  ];

  if (category) {
    pipeline.push({ $match: { 'product.category._id': toObjectId(category) } });
  }

  if (search) {
    const regex = toSearchRegex(search);
    pipeline.push({
      $match: { $or: [{ 'product.name': regex }, { 'product.sku': regex }] },
    });
  }

  if (status === 'out') pipeline.push({ $match: { quantity: { $lte: 0 } } });

  if (status === 'low') {
    pipeline.push({
      $match: {
        $expr: {
          $and: [
            { $gt: ['$quantity', 0] },
            { $lte: ['$quantity', '$effectiveMinStock'] },
          ],
        },
      },
    });
  }

  if (status === 'ok') {
    pipeline.push({
      $match: { $expr: { $gt: ['$quantity', '$effectiveMinStock'] } },
    });
  }

  // العدّ والصفحة بيتحسبوا من نفس الأنبوب، فالعدّاد بيطابق المعروض دايمًا.
  const [result] = await stockRepository.aggregate([
    ...pipeline,
    {
      $facet: {
        items: [
          { $sort: SORTS[sort] ?? SORTS.default },
          { $skip: skip },
          { $limit: safeLimit },
        ],
        total: [{ $count: 'value' }],
      },
    },
  ]);

  const total = result?.total?.[0]?.value ?? 0;

  return {
    items: result?.items ?? [],
    pagination: buildPaginationMeta({ page: safePage, limit: safeLimit, total }),
  };
};

/**
 * إجماليات مخزون الفرع في طلب واحد.
 *
 * البطاقات محتاجة أرقام على كل أصناف الفرع مش على الصفحة المعروضة،
 * فبتتحسب في الداتابيز بدل ما نجيب كل السجلات عشان نعدّها.
 */
export const getBranchSummary = async ({ branch }) => {
  const soon = new Date();
  soon.setDate(soon.getDate() + 30);

  const [row] = await stockRepository.aggregate([
    { $match: { branch: toObjectId(branch) } },
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
    {
      $group: {
        _id: null,
        items: { $sum: 1 },
        units: { $sum: '$quantity' },
        value: { $sum: { $multiply: ['$quantity', '$product.cost'] } },
        retailValue: { $sum: { $multiply: ['$quantity', '$product.price'] } },
        outOfStock: { $sum: { $cond: [{ $lte: ['$quantity', 0] }, 1, 0] } },
        lowStock: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $gt: ['$quantity', 0] },
                  { $lte: ['$quantity', '$effectiveMinStock'] },
                ],
              },
              1,
              0,
            ],
          },
        },
        nearExpiry: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $gt: ['$quantity', 0] },
                  { $ne: ['$product.expiryDate', null] },
                  { $lte: ['$product.expiryDate', soon] },
                ],
              },
              1,
              0,
            ],
          },
        },
      },
    },
  ]);

  return {
    items: row?.items ?? 0,
    units: row?.units ?? 0,
    value: Math.round((row?.value ?? 0) * 100) / 100,
    retailValue: Math.round((row?.retailValue ?? 0) * 100) / 100,
    outOfStock: row?.outOfStock ?? 0,
    lowStock: row?.lowStock ?? 0,
    nearExpiry: row?.nearExpiry ?? 0,
  };
};

/** الفرز المسموح بيه — بنقيّده عشان الطلب مايبعتش أي حقل. */
const SORTS = {
  default: { updatedAt: -1 },
  quantity: { quantity: 1 },
  '-quantity': { quantity: -1 },
  available: { available: 1 },
  '-available': { available: -1 },
  name: { 'product.name': 1 },
  '-name': { 'product.name': -1 },
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
  getBranchSummary,
  listMovements,
  adjustStock,
  stocktake,
  transferStock,
  setMinStock,
  getLowStockAlerts,
};
