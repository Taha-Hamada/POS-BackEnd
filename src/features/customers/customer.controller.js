import {
  sendCreated,
  sendPaginated,
  sendSuccess,
} from '../../core/http/apiResponse.js';
import asyncHandler from '../../core/http/asyncHandler.js';

import * as customerService from './customer.service.js';

export const list = asyncHandler(async (req, res) => {
  const { items, pagination } = await customerService.listCustomers(req.query);
  sendPaginated(res, { items, pagination });
});

export const getOne = asyncHandler(async (req, res) => {
  const customer = await customerService.getCustomerById(req.params.id);
  sendSuccess(res, { data: customer });
});

export const byPhone = asyncHandler(async (req, res) => {
  const customer = await customerService.findByPhone(req.params.phone);
  sendSuccess(res, { data: customer });
});

export const create = asyncHandler(async (req, res) => {
  const customer = await customerService.createCustomer(req.body);
  sendCreated(res, { message: 'اتضاف العميل', data: customer });
});

export const update = asyncHandler(async (req, res) => {
  const customer = await customerService.updateCustomer(req.params.id, req.body);
  sendSuccess(res, { message: 'اتحدثت بيانات العميل', data: customer });
});

export const setActiveState = asyncHandler(async (req, res) => {
  const customer = await customerService.setCustomerActiveState(
    req.params.id,
    req.body.isActive,
  );
  sendSuccess(res, {
    message: customer.isActive ? 'العميل اتفعل' : 'العميل اتعطل',
    data: customer,
  });
});

export const pay = asyncHandler(async (req, res) => {
  const result = await customerService.recordPayment({
    customer: req.params.id,
    ...req.body,
    branch: req.body.branch ?? req.user.branch,
    performedBy: req.user.id,
  });

  sendSuccess(res, {
    message: `اتسجل سداد ${req.body.amount}`,
    data: result,
  });
});

export const adjust = asyncHandler(async (req, res) => {
  const result = await customerService.adjustBalance({
    customer: req.params.id,
    ...req.body,
    branch: req.body.branch ?? req.user.branch,
    performedBy: req.user.id,
  });

  sendSuccess(res, { message: 'اتعدل رصيد العميل', data: result });
});

export const ledger = asyncHandler(async (req, res) => {
  const { items, pagination } = await customerService.getLedger({
    customer: req.params.id,
    ...req.query,
  });
  sendPaginated(res, { items, pagination });
});

export const receivables = asyncHandler(async (_req, res) => {
  const summary = await customerService.getReceivablesSummary();
  sendSuccess(res, { data: summary });
});

export default {
  list,
  getOne,
  byPhone,
  create,
  update,
  setActiveState,
  pay,
  adjust,
  ledger,
  receivables,
};
