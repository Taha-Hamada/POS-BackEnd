import mongoose from 'mongoose';

import { productImagePath, removeUploadedFile } from '../../config/uploads.js';
import { toSearchRegex } from '../../core/base/commonSchemas.js';
import { STOCK_MOVEMENT_REASONS } from '../../core/constants/index.js';
import ApiError from '../../core/errors/ApiError.js';
import categoryRepository from '../categories/category.repository.js';
import { applyStockMovement } from '../inventory/inventory.service.js';
import stockRepository from '../inventory/stock.repository.js';

import productRepository from './product.repository.js';

const POPULATE_CATEGORY = { path: 'category', select: 'name icon color' };

const buildFilter = ({ search, category, brand, isActive, isTaxable }) => {
  const filter = {};

  if (search) {
    const regex = toSearchRegex(search);
    filter.$or = [
      { name: regex },
      { sku: regex },
      { barcode: regex },
      { brand: regex },
    ];
  }
  if (category) filter.category = category;
  if (brand) filter.brand = brand;
  if (isActive !== undefined) filter.isActive = isActive;
  if (isTaxable !== undefined) filter.isTaxable = isTaxable;

  return filter;
};

/** بيلزق رصيد كل منتج جنبه — إجمالي على الفروع، أو رصيد فرع واحد لو اتحدد. */
const attachStock = async (items, branchId) => {
  if (items.length === 0) return items;

  const ids = items.map((item) => new mongoose.Types.ObjectId(String(item._id)));

  if (branchId) {
    const stocks = await stockRepository.findManyForBranch(ids, branchId);
    const byProduct = new Map(stocks.map((row) => [String(row.product), row]));

    return items.map((item) => {
      const record = byProduct.get(String(item._id));
      return {
        ...item,
        stock: record?.quantity ?? 0,
        reserved: record?.reserved ?? 0,
        // حد الطلب الظاهر هو تجاوز الفرع لو موجود، وإلا حد المنتج.
        effectiveMinStock: record?.minStock ?? item.minStock ?? 0,
      };
    });
  }

  const totals = await stockRepository.totalsByProduct(ids);

  return items.map((item) => ({
    ...item,
    stock: totals.get(String(item._id))?.quantity ?? 0,
    reserved: totals.get(String(item._id))?.reserved ?? 0,
  }));
};

export const listProducts = async ({
  page,
  limit,
  sort,
  search,
  category,
  brand,
  isActive,
  isTaxable,
  branch,
}) => {
  const result = await productRepository.paginate(
    buildFilter({ search, category, brand, isActive, isTaxable }),
    { page, limit, sort: sort ?? 'name', populate: POPULATE_CATEGORY },
  );

  result.items = await attachStock(result.items, branch);

  return result;
};

export const getProductById = async (id, branchId) => {
  const product = await productRepository.findById(id, {
    populate: POPULATE_CATEGORY,
    lean: true,
  });

  if (!product) throw ApiError.notFound('المنتج غير موجود');

  const [withStock] = await attachStock([product], branchId);
  return withStock;
};

/** مسح باركود من شاشة البيع — بيرجع المنتج ورصيده في فرع الكاشير. */
export const findByBarcode = async (barcode, branchId) => {
  const product = await productRepository.findByBarcode(barcode);
  if (!product) throw ApiError.notFound('مفيش منتج بالباركود ده');

  const [withStock] = await attachStock([product.toObject()], branchId);
  return withStock;
};

export const searchProducts = async ({ search, category, limit, branch }) => {
  const items = await productRepository.searchForSale(toSearchRegex(search), {
    limit,
    category,
  });

  return attachStock(items, branch);
};

const assertCategoryExists = async (categoryId) => {
  const exists = await categoryRepository.exists({ _id: categoryId });
  if (!exists) throw ApiError.badRequest('القسم المختار غير موجود');
};

const assertPricingSane = ({ price, cost }) => {
  if (price === undefined || cost === undefined) return;
  if (cost > price) {
    throw ApiError.badRequest('التكلفة أعلى من سعر البيع', {
      code: 'NEGATIVE_MARGIN',
    });
  }
};

export const createProduct = async (payload, { userId, openingStock } = {}) => {
  const clash = await productRepository.findBySku(payload.sku);
  if (clash) throw ApiError.conflict('كود المنتج مستخدم قبل كده');

  if (payload.barcode) {
    const barcodeClash = await productRepository.findByBarcode(payload.barcode);
    if (barcodeClash) throw ApiError.conflict('الباركود مستخدم لمنتج تاني');
  }

  await assertCategoryExists(payload.category);
  assertPricingSane(payload);

  const product = await productRepository.create({
    ...payload,
    createdBy: userId ?? null,
  });

  // رصيد افتتاحي اختياري — بيتسجل كحركة عشان يبان في تقرير المخزون.
  if (openingStock?.branch && openingStock.quantity > 0) {
    await applyStockMovement({
      product: product._id,
      branch: openingStock.branch,
      quantity: openingStock.quantity,
      reason: STOCK_MOVEMENT_REASONS.OPENING,
      unitCost: product.cost,
      note: 'رصيد افتتاحي',
      performedBy: userId ?? null,
    });
  }

  return product.populate(POPULATE_CATEGORY);
};

export const updateProduct = async (id, payload) => {
  const product = await productRepository.findById(id);
  if (!product) throw ApiError.notFound('المنتج غير موجود');

  if (payload.sku && payload.sku.toUpperCase() !== product.sku) {
    const clash = await productRepository.findBySku(payload.sku);
    if (clash) throw ApiError.conflict('كود المنتج مستخدم قبل كده');
  }

  if (payload.barcode && payload.barcode !== product.barcode) {
    const clash = await productRepository.findByBarcode(payload.barcode);
    if (clash) throw ApiError.conflict('الباركود مستخدم لمنتج تاني');
  }

  if (payload.category) await assertCategoryExists(payload.category);

  assertPricingSane({
    price: payload.price ?? product.price,
    cost: payload.cost ?? product.cost,
  });

  Object.assign(product, payload);
  await product.save();

  return product.populate(POPULATE_CATEGORY);
};

/**
 * بيربط الصورة المرفوعة بالمنتج وبيمسح القديمة من القرص.
 * لو المنتج مش موجود الملف المرفوع بيتمسح عشان مايفضلش يتيم.
 */
export const setProductImage = async (id, file) => {
  const product = await productRepository.findById(id);
  if (!product) {
    await removeUploadedFile(productImagePath(file.filename));
    throw ApiError.notFound('المنتج غير موجود');
  }

  const previous = product.imageUrl;
  product.imageUrl = productImagePath(file.filename);
  await product.save();
  await removeUploadedFile(previous);

  return product.populate(POPULATE_CATEGORY);
};

export const removeProductImage = async (id) => {
  const product = await productRepository.findById(id);
  if (!product) throw ApiError.notFound('المنتج غير موجود');

  const previous = product.imageUrl;
  product.imageUrl = null;
  await product.save();
  await removeUploadedFile(previous);

  return product.populate(POPULATE_CATEGORY);
};

/** تعديل سعر جماعي بنسبة أو بمبلغ — بيستخدم في مواسم الغلاء والعروض. */
export const bulkUpdatePrices = async ({ productIds, category, mode, value }) => {
  const filter = productIds?.length
    ? { _id: { $in: productIds } }
    : { category, isActive: true };

  if (!productIds?.length && !category) {
    throw ApiError.badRequest('حدد منتجات أو قسم للتعديل');
  }

  const update =
    mode === 'percentage'
      ? [{ $set: { price: { $round: [{ $multiply: ['$price', 1 + value / 100] }, 2] } } }]
      : [{ $set: { price: { $round: [{ $max: [0, { $add: ['$price', value] }] }, 2] } } }];

  const result = await productRepository.model.updateMany(filter, update);

  return { matched: result.matchedCount, modified: result.modifiedCount };
};

/** المنتج مش بيتمسح لأن الفواتير القديمة بتشاور عليه، بيتعطّل بس. */
export const setProductActiveState = async (id, isActive) => {
  const product = await productRepository.findById(id);
  if (!product) throw ApiError.notFound('المنتج غير موجود');

  product.isActive = isActive;
  await product.save();

  return product;
};

export const getExpiringProducts = ({ days = 30 }) => {
  const limitDate = new Date();
  limitDate.setDate(limitDate.getDate() + days);

  return productRepository.findExpiringBefore(limitDate);
};

export default {
  listProducts,
  getProductById,
  findByBarcode,
  searchProducts,
  createProduct,
  updateProduct,
  setProductImage,
  removeProductImage,
  bulkUpdatePrices,
  setProductActiveState,
  getExpiringProducts,
};
