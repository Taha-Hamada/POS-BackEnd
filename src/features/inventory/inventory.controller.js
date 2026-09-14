import { sendPaginated, sendSuccess } from '../../core/http/apiResponse.js';
import asyncHandler from '../../core/http/asyncHandler.js';
import ApiError from '../../core/errors/ApiError.js';

import * as inventoryService from './inventory.service.js';

/** كل حركة مخزون لازم يبقى ليها فرع — من الطلب أو من فرع المستخدم. */
const requireBranch = (req, explicit) => {
  const branch = explicit ?? req.user.branch;
  if (!branch) throw ApiError.badRequest('لازم تحدد الفرع');
  return branch;
};

export const listStock = asyncHandler(async (req, res) => {
  const { items, pagination } = await inventoryService.getStockForBranch({
    ...req.query,
    branch: requireBranch(req, req.query.branch),
  });
  sendPaginated(res, { items, pagination });
});

export const summary = asyncHandler(async (req, res) => {
  const data = await inventoryService.getBranchSummary({
    branch: requireBranch(req, req.query.branch),
  });

  sendSuccess(res, { data });
});

export const listMovements = asyncHandler(async (req, res) => {
  const { items, pagination } = await inventoryService.listMovements({
    ...req.query,
    branch: req.query.branch ?? req.user.branch ?? undefined,
  });
  sendPaginated(res, { items, pagination });
});

export const adjust = asyncHandler(async (req, res) => {
  const result = await inventoryService.adjustStock({
    ...req.body,
    branch: requireBranch(req, req.body.branch),
    performedBy: req.user.id,
  });

  sendSuccess(res, {
    message: `اتعدل الرصيد لـ ${result.stock.quantity}`,
    data: result,
  });
});

export const stocktake = asyncHandler(async (req, res) => {
  const result = await inventoryService.stocktake({
    ...req.body,
    branch: requireBranch(req, req.body.branch),
    performedBy: req.user.id,
  });

  sendSuccess(res, {
    message:
      result.delta === 0
        ? 'الجرد مطابق، مفيش فرق'
        : `الجرد سجل فرق ${result.delta}`,
    data: result,
  });
});

export const transfer = asyncHandler(async (req, res) => {
  const result = await inventoryService.transferStock({
    ...req.body,
    performedBy: req.user.id,
  });

  sendSuccess(res, { message: 'اتنفذ التحويل', data: result });
});

export const setMinStock = asyncHandler(async (req, res) => {
  const record = await inventoryService.setMinStock({
    ...req.body,
    branch: requireBranch(req, req.body.branch),
  });

  sendSuccess(res, { message: 'اتحدد حد الطلب', data: record });
});

export const lowStock = asyncHandler(async (req, res) => {
  const items = await inventoryService.getLowStockAlerts({
    ...req.query,
    branch: req.query.branch ?? req.user.branch ?? undefined,
  });

  sendSuccess(res, { data: items });
});

export default {
  listStock,
  summary,
  listMovements,
  adjust,
  stocktake,
  transfer,
  setMinStock,
  lowStock,
};
