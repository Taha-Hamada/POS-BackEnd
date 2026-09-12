import mongoose from 'mongoose';

import { toSearchRegex } from '../../core/base/commonSchemas.js';
import ApiError from '../../core/errors/ApiError.js';

import categoryRepository from './category.repository.js';

const POPULATE_PARENT = { path: 'parent', select: 'name icon color' };

const buildFilter = ({ search, parent, isActive }) => {
  const filter = {};

  if (search) filter.name = toSearchRegex(search);
  if (parent === 'root') filter.parent = null;
  else if (parent) filter.parent = parent;
  if (isActive !== undefined) filter.isActive = isActive;

  return filter;
};

export const listCategories = async ({
  page,
  limit,
  sort,
  search,
  parent,
  isActive,
  withProductCount,
}) => {
  const result = await categoryRepository.paginate(
    buildFilter({ search, parent, isActive }),
    { page, limit, sort: sort ?? 'sortOrder name', populate: POPULATE_PARENT },
  );

  if (!withProductCount) return result;

  const counts = await categoryRepository.countProductsByCategory(
    result.items.map((item) => new mongoose.Types.ObjectId(String(item._id))),
  );

  result.items = result.items.map((item) => ({
    ...item,
    productsCount: counts.get(String(item._id)) ?? 0,
  }));

  return result;
};

export const getCategoryById = async (id) => {
  const category = await categoryRepository.findById(id, {
    populate: POPULATE_PARENT,
    lean: true,
  });

  if (!category) throw ApiError.notFound('القسم غير موجود');
  return category;
};

const assertParentValid = async (parentId, selfId) => {
  if (!parentId) return;

  if (selfId && String(parentId) === String(selfId)) {
    throw ApiError.badRequest('القسم مينفعش يكون أب لنفسه');
  }

  const parent = await categoryRepository.findById(parentId, { lean: true });
  if (!parent) throw ApiError.badRequest('القسم الأب غير موجود');

  // بنسمح بمستوى واحد بس عشان شجرة الأقسام تفضل بسيطة في شاشة البيع.
  if (parent.parent) throw ApiError.badRequest('مسموح بمستوى تفريع واحد بس');
};

export const createCategory = async (payload) => {
  const existing = await categoryRepository.findByName(payload.name);
  if (existing) throw ApiError.conflict('اسم القسم مستخدم قبل كده');

  await assertParentValid(payload.parent);

  return categoryRepository.create(payload);
};

export const updateCategory = async (id, payload) => {
  const category = await categoryRepository.findById(id);
  if (!category) throw ApiError.notFound('القسم غير موجود');

  if (payload.name && payload.name !== category.name) {
    const clash = await categoryRepository.findByName(payload.name);
    if (clash) throw ApiError.conflict('اسم القسم مستخدم قبل كده');
  }

  if (payload.parent) await assertParentValid(payload.parent, id);

  Object.assign(category, payload);
  await category.save();

  return category.populate(POPULATE_PARENT);
};

/** بنمسح فعليًا بس لو القسم فاضي، وغير كده بنعطّله عشان المنتجات القديمة تفضل مربوطة. */
export const removeCategory = async (id) => {
  const category = await categoryRepository.findById(id);
  if (!category) throw ApiError.notFound('القسم غير موجود');

  const children = await categoryRepository.countChildren(id);
  if (children > 0) throw ApiError.badRequest('امسح الأقسام الفرعية الأول');

  const counts = await categoryRepository.countProductsByCategory([
    new mongoose.Types.ObjectId(String(id)),
  ]);
  const productsCount = counts.get(String(id)) ?? 0;

  if (productsCount > 0) {
    category.isActive = false;
    await category.save();
    return { deleted: false, deactivated: true, productsCount };
  }

  await categoryRepository.deleteById(id);
  return { deleted: true, deactivated: false, productsCount: 0 };
};

export default {
  listCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  removeCategory,
};
