import ApiError from '../../core/errors/ApiError.js';
import {
  sendCreated,
  sendPaginated,
  sendSuccess,
} from '../../core/http/apiResponse.js';
import asyncHandler from '../../core/http/asyncHandler.js';

import * as purchaseService from './purchase.service.js';

export const create = asyncHandler(async (req, res) => {
  const branch = req.body.branch ?? req.user.branch;
  if (!branch) throw ApiError.badRequest('لازم تحدد الفرع');

  const order = await purchaseService.createOrder({
    ...req.body,
    branch,
    createdBy: req.user.id,
  });

  sendCreated(res, { message: `اتعمل أمر الشراء ${order.number}`, data: order });
});

export const update = asyncHandler(async (req, res) => {
  const order = await purchaseService.updateOrder(req.params.id, req.body);
  sendSuccess(res, { message: 'اتحدث أمر الشراء', data: order });
});

export const confirm = asyncHandler(async (req, res) => {
  const order = await purchaseService.confirmOrder(req.params.id);
  sendSuccess(res, { message: 'اتأكد أمر الشراء', data: order });
});

export const cancel = asyncHandler(async (req, res) => {
  const order = await purchaseService.cancelOrder(req.params.id, req.body);
  sendSuccess(res, { message: 'اتلغى أمر الشراء', data: order });
});

export const receive = asyncHandler(async (req, res) => {
  const order = await purchaseService.receiveOrder(req.params.id, {
    ...req.body,
    userId: req.user.id,
  });

  sendSuccess(res, {
    message:
      order.status === 'completed'
        ? 'اتستلم الأمر بالكامل'
        : 'اتسجل استلام جزئي',
    data: order,
  });
});

export const list = asyncHandler(async (req, res) => {
  const { items, pagination } = await purchaseService.listOrders({
    ...req.query,
    branch: req.query.branch ?? req.user.branch ?? undefined,
  });
  sendPaginated(res, { items, pagination });
});

export const summary = asyncHandler(async (req, res) => {
  const data = await purchaseService.summarizeOrders({
    ...req.query,
    branch: req.query.branch ?? req.user.branch ?? undefined,
  });
  sendSuccess(res, { data });
});

export const getOne = asyncHandler(async (req, res) => {
  const order = await purchaseService.getOrderById(req.params.id);
  sendSuccess(res, { data: order });
});

export default { create, update, confirm, cancel, receive, list, summary, getOne };
