import ApiError from '../../core/errors/ApiError.js';
import {
  sendCreated,
  sendPaginated,
  sendSuccess,
} from '../../core/http/apiResponse.js';
import asyncHandler from '../../core/http/asyncHandler.js';

import * as invoiceService from './invoice.service.js';

/** الفاتورة لازم يبقى لها فرع — من الطلب أو من فرع الكاشير. */
const requireBranch = (req) => {
  const branch = req.body.branch ?? req.user.branch;
  if (!branch) throw ApiError.badRequest('لازم تحدد الفرع');
  return branch;
};

export const create = asyncHandler(async (req, res) => {
  const invoice = await invoiceService.createInvoice({
    ...req.body,
    branch: requireBranch(req),
    cashier: req.user.id,
  });

  sendCreated(res, { message: `اتعملت الفاتورة ${invoice.number}`, data: invoice });
});

export const hold = asyncHandler(async (req, res) => {
  const invoice = await invoiceService.holdInvoice({
    ...req.body,
    branch: requireBranch(req),
    cashier: req.user.id,
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
