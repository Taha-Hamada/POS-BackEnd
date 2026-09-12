import ApiError from '../../core/errors/ApiError.js';
import { toSearchRegex } from '../../core/base/commonSchemas.js';

import branchRepository from './branch.repository.js';

const POPULATE_MANAGER = { path: 'manager', select: 'name phone role' };

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

export const createBranch = async (payload) => {
  const existing = await branchRepository.findByCode(payload.code, { lean: true });
  if (existing) throw ApiError.conflict('كود الفرع مستخدم قبل كده');

  const branch = await branchRepository.create(payload);

  if (branch.isMain) await branchRepository.clearMainFlag(branch._id);

  return branch;
};

export const updateBranch = async (id, payload) => {
  const branch = await branchRepository.findById(id);
  if (!branch) throw ApiError.notFound('الفرع غير موجود');

  if (payload.code && payload.code.toUpperCase() !== branch.code) {
    const clash = await branchRepository.findByCode(payload.code, { lean: true });
    if (clash) throw ApiError.conflict('كود الفرع مستخدم قبل كده');
  }

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
  getBranchById,
  createBranch,
  updateBranch,
  deactivateBranch,
  setBranchOpenState,
};
