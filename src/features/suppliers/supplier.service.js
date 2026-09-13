import { toSearchRegex } from '../../core/base/commonSchemas.js';
import ApiError from '../../core/errors/ApiError.js';
import { round2 } from '../../core/utils/money.js';

import supplierRepository from './supplier.repository.js';

const buildFilter = ({ search, isActive, hasDue }) => {
  const filter = {};

  if (search) {
    const regex = toSearchRegex(search);
    filter.$or = [
      { name: regex },
      { phone: regex },
      { contactPerson: regex },
      { email: regex },
    ];
  }
  if (isActive !== undefined) filter.isActive = isActive;
  if (hasDue) filter.balanceDue = { $gt: 0 };

  return filter;
};

export const listSuppliers = ({ page, limit, sort, search, isActive, hasDue }) =>
  supplierRepository.paginate(buildFilter({ search, isActive, hasDue }), {
    page,
    limit,
    sort: sort ?? 'name',
  });

export const getSupplierById = async (id) => {
  const supplier = await supplierRepository.findById(id, { lean: true });
  if (!supplier) throw ApiError.notFound('المورد غير موجود');
  return supplier;
};

export const createSupplier = async (payload) => {
  const existing = await supplierRepository.findByPhone(payload.phone);
  if (existing) throw ApiError.conflict('رقم الموبايل مسجّل لمورد تاني');

  return supplierRepository.create(payload);
};

export const updateSupplier = async (id, payload) => {
  const supplier = await supplierRepository.findById(id);
  if (!supplier) throw ApiError.notFound('المورد غير موجود');

  if (payload.phone && payload.phone !== supplier.phone) {
    const clash = await supplierRepository.findByPhone(payload.phone);
    if (clash) throw ApiError.conflict('رقم الموبايل مسجّل لمورد تاني');
  }

  // المستحق بيتحرّك من أوامر الشراء والسداد بس.
  delete payload.balanceDue;
  delete payload.totalPurchases;
  delete payload.ordersCount;

  Object.assign(supplier, payload);
  await supplier.save();

  return supplier;
};

export const setSupplierActiveState = async (id, isActive) => {
  const supplier = await supplierRepository.findById(id);
  if (!supplier) throw ApiError.notFound('المورد غير موجود');

  if (!isActive && supplier.balanceDue > 0) {
    throw ApiError.badRequest('مينفعش تعطّل مورد له مستحقات');
  }

  supplier.isActive = isActive;
  await supplier.save();

  return supplier;
};

/** بتتنادى من أوامر الشراء عند الاستلام عشان تزوّد المستحق. */
export const addDue = async ({ supplier: supplierId, amount }, { session } = {}) => {
  const supplier = await supplierRepository.applyDueDelta(
    supplierId,
    round2(amount),
    { session },
  );

  if (!supplier) throw ApiError.notFound('المورد غير موجود');
  return supplier;
};

export const payDue = async ({ supplier: supplierId, amount }) => {
  if (amount <= 0) throw ApiError.badRequest('مبلغ السداد لازم يكون موجب');

  const supplier = await supplierRepository.findById(supplierId, { lean: true });
  if (!supplier) throw ApiError.notFound('المورد غير موجود');

  if (supplier.balanceDue <= 0) {
    throw ApiError.badRequest('مفيش مستحقات على المورد ده');
  }

  if (amount > supplier.balanceDue) {
    throw ApiError.badRequest(`المبلغ أكبر من المستحق (${supplier.balanceDue})`, {
      code: 'OVERPAYMENT',
    });
  }

  return supplierRepository.applyDueDelta(supplierId, -round2(amount));
};

export const getPayablesSummary = () => supplierRepository.totalPayables();

export default {
  listSuppliers,
  getSupplierById,
  createSupplier,
  updateSupplier,
  setSupplierActiveState,
  addDue,
  payDue,
  getPayablesSummary,
};
