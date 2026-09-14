import {
  sendCreated,
  sendPaginated,
  sendSuccess,
} from '../../core/http/apiResponse.js';
import asyncHandler from '../../core/http/asyncHandler.js';

import * as supplierService from './supplier.service.js';

export const list = asyncHandler(async (req, res) => {
  const { items, pagination } = await supplierService.listSuppliers(req.query);
  sendPaginated(res, { items, pagination });
});

export const getOne = asyncHandler(async (req, res) => {
  const supplier = await supplierService.getSupplierById(req.params.id);
  sendSuccess(res, { data: supplier });
});

export const create = asyncHandler(async (req, res) => {
  const supplier = await supplierService.createSupplier(req.body);
  sendCreated(res, { message: 'اتضاف المورد', data: supplier });
});

export const update = asyncHandler(async (req, res) => {
  const supplier = await supplierService.updateSupplier(req.params.id, req.body);
  sendSuccess(res, { message: 'اتحدثت بيانات المورد', data: supplier });
});

export const setActiveState = asyncHandler(async (req, res) => {
  const supplier = await supplierService.setSupplierActiveState(
    req.params.id,
    req.body.isActive,
  );
  sendSuccess(res, {
    message: supplier.isActive ? 'المورد اتفعل' : 'المورد اتعطل',
    data: supplier,
  });
});

export const pay = asyncHandler(async (req, res) => {
  const supplier = await supplierService.payDue({
    supplier: req.params.id,
    amount: req.body.amount,
  });
  sendSuccess(res, {
    message: `اتسجل سداد ${req.body.amount} للمورد`,
    data: supplier,
  });
});

export const suppliedProducts = asyncHandler(async (req, res) => {
  const items = await supplierService.getSuppliedProducts(req.params.id);
  sendSuccess(res, { data: items });
});

export const payables = asyncHandler(async (_req, res) => {
  const summary = await supplierService.getPayablesSummary();
  sendSuccess(res, { data: summary });
});

export default {
  list,
  getOne,
  create,
  update,
  setActiveState,
  pay,
  payables,
  suppliedProducts,
};
