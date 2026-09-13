import {
  sendCreated,
  sendPaginated,
  sendSuccess,
} from '../../core/http/apiResponse.js';
import asyncHandler from '../../core/http/asyncHandler.js';
import * as shiftService from '../shifts/shift.service.js';

import * as returnService from './return.service.js';

export const create = asyncHandler(async (req, res) => {
  // المرتجع بيترط بوردية اللي بينفذه، زي الفاتورة بالظبط:
  // من غير كده رد الكاش مبينزلش من الدرج ووقت التقفيل الأرقام بتبان زيادة.
  const shift = req.body.shift ?? (await shiftService.getShiftIdFor(req.user.id));

  const saleReturn = await returnService.createReturn({
    ...req.body,
    shift,
    cashier: req.user.id,
  });

  sendCreated(res, {
    message: `اتعمل المرتجع ${saleReturn.number}`,
    data: saleReturn,
  });
});

export const list = asyncHandler(async (req, res) => {
  const { items, pagination } = await returnService.listReturns({
    ...req.query,
    branch: req.query.branch ?? req.user.branch ?? undefined,
  });
  sendPaginated(res, { items, pagination });
});

export const getOne = asyncHandler(async (req, res) => {
  const saleReturn = await returnService.getReturnById(req.params.id);
  sendSuccess(res, { data: saleReturn });
});

export const returnable = asyncHandler(async (req, res) => {
  const data = await returnService.getReturnableLines(req.params.invoiceId);
  sendSuccess(res, { data });
});

export const summary = asyncHandler(async (req, res) => {
  const data = await returnService.getReturnsSummary({
    ...req.query,
    branch: req.query.branch ?? req.user.branch ?? undefined,
  });
  sendSuccess(res, { data });
});

export default { create, list, getOne, returnable, summary };
