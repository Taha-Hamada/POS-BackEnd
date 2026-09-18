import {
  sendCreated,
  sendPaginated,
  sendSuccess,
} from '../../core/http/apiResponse.js';
import asyncHandler from '../../core/http/asyncHandler.js';

import * as productService from './product.service.js';

/** الفرع الافتراضي هو فرع المستخدم، وممكن يتجاوزه بكويري لو دوره بيسمح. */
const branchOf = (req) => req.query.branch ?? req.user.branch ?? null;

export const list = asyncHandler(async (req, res) => {
  const { items, pagination } = await productService.listProducts({
    ...req.query,
    branch: branchOf(req),
  });
  sendPaginated(res, { items, pagination });
});

export const getOne = asyncHandler(async (req, res) => {
  const product = await productService.getProductById(req.params.id, branchOf(req));
  sendSuccess(res, { data: product });
});

export const search = asyncHandler(async (req, res) => {
  const items = await productService.searchProducts({
    ...req.query,
    branch: branchOf(req),
  });
  sendSuccess(res, { data: items });
});

export const byBarcode = asyncHandler(async (req, res) => {
  const product = await productService.findByBarcode(
    req.params.barcode,
    branchOf(req),
  );
  sendSuccess(res, { data: product });
});

export const create = asyncHandler(async (req, res) => {
  const { openingStock, ...payload } = req.body;
  const product = await productService.createProduct(payload, {
    userId: req.user.id,
    openingStock,
  });
  sendCreated(res, { message: 'اتضاف المنتج', data: product });
});

export const update = asyncHandler(async (req, res) => {
  const product = await productService.updateProduct(req.params.id, req.body);
  sendSuccess(res, { message: 'اتحدث المنتج', data: product });
});

export const setActiveState = asyncHandler(async (req, res) => {
  const product = await productService.setProductActiveState(
    req.params.id,
    req.body.isActive,
  );
  sendSuccess(res, {
    message: product.isActive ? 'المنتج اتفعل' : 'المنتج اتعطل',
    data: product,
  });
});

export const uploadImage = asyncHandler(async (req, res) => {
  const product = await productService.setProductImage(req.params.id, req.file);
  sendSuccess(res, { message: 'اترفعت صورة المنتج', data: product });
});

export const removeImage = asyncHandler(async (req, res) => {
  const product = await productService.removeProductImage(req.params.id);
  sendSuccess(res, { message: 'اتشالت صورة المنتج', data: product });
});

export const expiring = asyncHandler(async (req, res) => {
  const items = await productService.getExpiringProducts(req.query);
  sendSuccess(res, { data: items });
});

export default {
  list,
  getOne,
  search,
  byBarcode,
  create,
  update,
  setActiveState,
  uploadImage,
  removeImage,
  expiring,
};
