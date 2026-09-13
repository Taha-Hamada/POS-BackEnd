import ApiError from '../../core/errors/ApiError.js';
import {
  sendCreated,
  sendPaginated,
  sendSuccess,
} from '../../core/http/apiResponse.js';
import asyncHandler from '../../core/http/asyncHandler.js';

import * as shiftService from './shift.service.js';

export const open = asyncHandler(async (req, res) => {
  const branch = req.body.branch ?? req.user.branch;
  if (!branch) throw ApiError.badRequest('لازم تحدد الفرع');

  const shift = await shiftService.openShift({
    cashier: req.user.id,
    branch,
    openingBalance: req.body.openingBalance,
  });

  sendCreated(res, { message: 'اتفتحت الوردية', data: shift });
});

/** ورديتي المفتوحة دلوقتي — أول حاجة شاشة الكاشير بتسألها. */
export const current = asyncHandler(async (req, res) => {
  const shift = await shiftService.getOpenShift(req.user.id);

  if (!shift) {
    sendSuccess(res, { message: 'مفيش وردية مفتوحة', data: null });
    return;
  }

  const totals = await shiftService.calculateShiftTotals(shift);
  sendSuccess(res, { data: { shift, totals } });
});

export const getOne = asyncHandler(async (req, res) => {
  const data = await shiftService.getShiftWithTotals(req.params.id);
  sendSuccess(res, { data });
});

export const addCash = asyncHandler(async (req, res) => {
  const shift = await shiftService.addCashMovement(req.params.id, {
    ...req.body,
    userId: req.user.id,
  });

  sendSuccess(res, {
    message: req.body.direction === 'in' ? 'اتسجل إيداع' : 'اتسجل سحب',
    data: shift,
  });
});

export const close = asyncHandler(async (req, res) => {
  const shift = await shiftService.closeShift(req.params.id, {
    ...req.body,
    userId: req.user.id,
  });

  const { difference } = shift.closing;
  const verdict =
    difference === 0
      ? 'الدرج مظبوط'
      : difference > 0
        ? `زيادة ${difference}`
        : `عجز ${Math.abs(difference)}`;

  sendSuccess(res, { message: `اتقفلت الوردية — ${verdict}`, data: shift });
});

export const list = asyncHandler(async (req, res) => {
  const { items, pagination } = await shiftService.listShifts({
    ...req.query,
    branch: req.query.branch ?? req.user.branch ?? undefined,
  });
  sendPaginated(res, { items, pagination });
});

export default { open, current, getOne, addCash, close, list };
