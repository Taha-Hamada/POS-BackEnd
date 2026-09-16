import ApiError from '../../core/errors/ApiError.js';
import {
  sendCreated,
  sendPaginated,
  sendSuccess,
} from '../../core/http/apiResponse.js';
import asyncHandler from '../../core/http/asyncHandler.js';
import { getSettings } from '../settings/settings.service.js';
import * as shiftService from '../shifts/shift.service.js';

import * as invoiceService from './invoice.service.js';

/**
 * الفاتورة لازم يبقى لها فرع: من الطلب، أو فرع الكاشير، أو فرع ورديته المفتوحة.
 * الأخيرة عشان الحساب اللي مش مربوط بفرع (زي مدير النظام) يبيع في الفرع
 * اللي فتح فيه الوردية من غير ما الفرونت يبعته مع كل فاتورة.
 */
const requireBranch = async (req) => {
  let branch = req.body.branch ?? req.user.branch;

  if (!branch) {
    const openShift = await shiftService.getOpenShift(req.user.id);
    branch = openShift?.branch?._id ?? openShift?.branch;
  }

  if (!branch) {
    throw ApiError.badRequest('لازم تحدد الفرع — افتح وردية في فرع الأول');
  }
  return branch;
};

/**
 * الوردية بتتاخد من الوردية المفتوحة للكاشير، مش من الطلب.
 * لو الإعدادات بتفرض وردية، البيع بيتوقف لحد ما يفتحها.
 */
const resolveShift = async (req) => {
  const settings = await getSettings();

  if (settings.requireOpenShift) {
    const shift = await shiftService.requireOpenShift(req.user.id);
    return shift._id;
  }

  return shiftService.getShiftIdFor(req.user.id);
};

export const create = asyncHandler(async (req, res) => {
  const invoice = await invoiceService.createInvoice({
    ...req.body,
    branch: await requireBranch(req),
    cashier: req.user.id,
    shift: await resolveShift(req),
  });

  sendCreated(res, { message: `اتعملت الفاتورة ${invoice.number}`, data: invoice });
});

export const hold = asyncHandler(async (req, res) => {
  const invoice = await invoiceService.holdInvoice({
    ...req.body,
    branch: await requireBranch(req),
    cashier: req.user.id,
    shift: await resolveShift(req),
  });

  sendCreated(res, { message: 'اتعلقت الفاتورة', data: invoice });
});

export const checkoutHeld = asyncHandler(async (req, res) => {
  const invoice = await invoiceService.checkoutHeldInvoice(req.params.id, req.body);
  sendSuccess(res, {
    message: `اتمّت الفاتورة ${invoice.number}`,
    data: invoice,
  });
});

export const discardHeld = asyncHandler(async (req, res) => {
  const result = await invoiceService.discardHeldInvoice(req.params.id);
  sendSuccess(res, { message: 'اتلغت الفاتورة المعلّقة', data: result });
});

export const list = asyncHandler(async (req, res) => {
  const { items, pagination } = await invoiceService.listInvoices({
    ...req.query,
    branch: req.query.branch ?? req.user.branch ?? undefined,
  });
  sendPaginated(res, { items, pagination });
});

export const listHeld = asyncHandler(async (req, res) => {
  const items = await invoiceService.listHeldInvoices({
    branch: req.query.branch ?? req.user.branch ?? undefined,
    cashier: req.query.cashier,
  });
  sendSuccess(res, { data: items });
});

export const getOne = asyncHandler(async (req, res) => {
  const invoice = await invoiceService.getInvoiceById(req.params.id);
  sendSuccess(res, { data: invoice });
});

export const byNumber = asyncHandler(async (req, res) => {
  const invoice = await invoiceService.getInvoiceByNumber(req.params.number);
  sendSuccess(res, { data: invoice });
});

export const voidOne = asyncHandler(async (req, res) => {
  const invoice = await invoiceService.voidInvoice(req.params.id, {
    reason: req.body.reason,
    userId: req.user.id,
  });
  sendSuccess(res, { message: 'اتلغت الفاتورة', data: invoice });
});

export const summary = asyncHandler(async (req, res) => {
  const data = await invoiceService.getBranchSummary({
    ...req.query,
    branch: req.query.branch ?? req.user.branch ?? undefined,
  });
  sendSuccess(res, { data });
});

export default {
  create,
  hold,
  checkoutHeld,
  discardHeld,
  list,
  listHeld,
  getOne,
  byNumber,
  voidOne,
  summary,
};
