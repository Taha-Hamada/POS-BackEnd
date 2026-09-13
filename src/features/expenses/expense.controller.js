import ApiError from '../../core/errors/ApiError.js';
import {
  sendCreated,
  sendPaginated,
  sendSuccess,
} from '../../core/http/apiResponse.js';
import asyncHandler from '../../core/http/asyncHandler.js';
import * as shiftService from '../shifts/shift.service.js';

import * as expenseService from './expense.service.js';

export const list = asyncHandler(async (req, res) => {
  const { items, pagination } = await expenseService.listExpenses({
    ...req.query,
    branch: req.query.branch ?? req.user.branch ?? undefined,
  });
  sendPaginated(res, { items, pagination });
});

export const getOne = asyncHandler(async (req, res) => {
  const expense = await expenseService.getExpenseById(req.params.id);
  sendSuccess(res, { data: expense });
});

export const create = asyncHandler(async (req, res) => {
  const branch = req.body.branch ?? req.user.branch;
  if (!branch) throw ApiError.badRequest('لازم تحدد الفرع');

  // المصروف الكاش بيخرج من الدرج، فبنربطه بوردية اللي سجّله.
  const shift =
    (req.body.paymentMethod ?? 'cash') === 'cash'
      ? await shiftService.getShiftIdFor(req.user.id)
      : null;

  const expense = await expenseService.createExpense({
    ...req.body,
    branch,
    shift,
    createdBy: req.user.id,
  });

  sendCreated(res, { message: `اتسجل المصروف ${expense.number}`, data: expense });
});

export const update = asyncHandler(async (req, res) => {
  const expense = await expenseService.updateExpense(req.params.id, req.body);
  sendSuccess(res, { message: 'اتحدث المصروف', data: expense });
});

export const remove = asyncHandler(async (req, res) => {
  const result = await expenseService.deleteExpense(req.params.id);
  sendSuccess(res, { message: 'اتمسح المصروف', data: result });
});

export const review = asyncHandler(async (req, res) => {
  const expense = await expenseService.reviewExpense(req.params.id, {
    ...req.body,
    userId: req.user.id,
  });

  sendSuccess(res, {
    message: req.body.approve ? 'اتعتمد المصروف' : 'اترفض المصروف',
    data: expense,
  });
});

export const summary = asyncHandler(async (req, res) => {
  const data = await expenseService.summarizeByCategory({
    ...req.query,
    branch: req.query.branch ?? req.user.branch ?? undefined,
  });
  sendSuccess(res, { data });
});

export default { list, getOne, create, update, remove, review, summary };
