import { toObjectId, toSearchRegex } from '../../core/base/commonSchemas.js';
import { PURCHASE_ORDER_STATUSES } from '../../core/constants/index.js';
import ApiError from '../../core/errors/ApiError.js';
import { round2 } from '../../core/utils/money.js';
// الموديل مباشرة مش الخدمة: خدمة المشتريات بتستورد الملف ده، فاستيرادها هنا
// كان هيعمل حلقة استيراد.
import PurchaseOrder from '../purchases/purchaseOrder.model.js';

import { getSettings } from '../settings/settings.service.js';
import * as shiftService from '../shifts/shift.service.js';

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

/**
 * سداد للمورد.
 *
 * الفلوس بتطلع من درج الوردية، فبنسجّلها كحركة سحب عليها. من غير كده كان
 * المستحق بينقص والدرج مش عارف، والكاشير بيلاقي عجز وقت التقفيل.
 */
export const payDue = async ({ supplier: supplierId, amount, userId, note }) => {
  if (amount <= 0) throw ApiError.badRequest('مبلغ السداد لازم يكون موجب');

  const supplier = await supplierRepository.findById(supplierId, { lean: true });
  if (!supplier) throw ApiError.notFound('المورد غير موجود');

  if (supplier.balanceDue <= 0) {
    throw ApiError.badRequest('مفيش مستحقات على المورد ده');
  }

  const due = round2(supplier.balanceDue);
  const paid = round2(amount);

  if (paid > due) {
    throw ApiError.badRequest(`المبلغ أكبر من المستحق (${due})`, {
      code: 'OVERPAYMENT',
    });
  }

  // بنسجّل خروج الكاش الأول: لو الدرج مش كفاية العملية بتقف من غير ما
  // المستحق يتغيّر. والوردية مفروضة زي البيع والمرتجع بالظبط، وإلا الفلوس
  // بتخرج ومحدش حاسبها.
  const settings = await getSettings();
  const shift = settings.requireOpenShift
    ? (await shiftService.requireOpenShift(userId))._id
    : await shiftService.getShiftIdFor(userId);

  if (shift) {
    await shiftService.addCashMovement(shift, {
      direction: 'out',
      amount: paid,
      reason: note?.trim() || `سداد للمورد ${supplier.name}`,
      userId,
    });
  }

  return supplierRepository.applyDueDelta(supplierId, -paid);
};

export const getPayablesSummary = () => supplierRepository.totalPayables();

/**
 * الأصناف اللي المورد وردها فعلًا.
 *
 * المنتج مش مربوط بمورد في الموديل، وربطه بواحد بيكدب على الواقع: نفس الصنف
 * بيتجاب من أكتر من مورد. فبنقراها من أوامر الشراء نفسها — اللي اتطلب منه
 * فعلًا، بآخر سعر شراء اتدفع فيه.
 */
export const getSuppliedProducts = async (supplierId) => {
  const supplier = await supplierRepository.findById(supplierId, { lean: true });
  if (!supplier) throw ApiError.notFound('المورد غير موجود');

  return PurchaseOrder.aggregate([
    {
      $match: {
        supplier: toObjectId(supplierId),
        status: { $ne: PURCHASE_ORDER_STATUSES.CANCELLED },
      },
    },
    { $sort: { orderDate: -1 } },
    { $unwind: '$lines' },
    {
      $group: {
        _id: '$lines.product',
        // أول قيمة بعد الترتيب تنازليًا = آخر أمر فيه الصنف ده.
        lastUnitCost: { $first: '$lines.unitCost' },
        lastOrderDate: { $first: '$orderDate' },
        orderedQuantity: { $sum: '$lines.quantity' },
        receivedQuantity: { $sum: '$lines.receivedQuantity' },
        ordersCount: { $sum: 1 },
      },
    },
    {
      $lookup: {
        from: 'products',
        localField: '_id',
        foreignField: '_id',
        as: 'product',
      },
    },
    { $unwind: '$product' },
    {
      $lookup: {
        from: 'categories',
        localField: 'product.category',
        foreignField: '_id',
        as: 'category',
      },
    },
    {
      $lookup: {
        from: 'stocks',
        localField: '_id',
        foreignField: 'product',
        as: 'stocks',
      },
    },
    {
      $project: {
        _id: 0,
        id: { $toString: '$_id' },
        name: '$product.name',
        sku: '$product.sku',
        unit: '$product.unit',
        price: '$product.price',
        cost: '$product.cost',
        cartonPrice: '$product.cartonPrice',
        piecesPerCarton: '$product.piecesPerCarton',
        colorIndex: '$product.colorIndex',
        minStock: '$product.minStock',
        trackStock: '$product.trackStock',
        category: {
          $let: {
            vars: { first: { $arrayElemAt: ['$category', 0] } },
            in: {
              $cond: [
                { $ifNull: ['$$first', false] },
                {
                  id: { $toString: '$$first._id' },
                  name: '$$first.name',
                  icon: '$$first.icon',
                  color: '$$first.color',
                },
                null,
              ],
            },
          },
        },
        // الرصيد على كل الفروع — التبويب مش مربوط بفرع.
        stock: { $sum: '$stocks.quantity' },
        lastUnitCost: { $round: ['$lastUnitCost', 2] },
        lastOrderDate: 1,
        orderedQuantity: 1,
        receivedQuantity: 1,
        ordersCount: 1,
      },
    },
    { $sort: { name: 1 } },
  ]);
};

export default {
  listSuppliers,
  getSupplierById,
  createSupplier,
  updateSupplier,
  setSupplierActiveState,
  addDue,
  payDue,
  getPayablesSummary,
  getSuppliedProducts,
};
