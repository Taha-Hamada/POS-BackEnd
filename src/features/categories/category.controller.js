import {
  sendCreated,
  sendPaginated,
  sendSuccess,
} from '../../core/http/apiResponse.js';
import asyncHandler from '../../core/http/asyncHandler.js';

import * as categoryService from './category.service.js';

export const list = asyncHandler(async (req, res) => {
  const { items, pagination } = await categoryService.listCategories(req.query);
  sendPaginated(res, { items, pagination });
});

export const getOne = asyncHandler(async (req, res) => {
  const category = await categoryService.getCategoryById(req.params.id);
  sendSuccess(res, { data: category });
});

export const create = asyncHandler(async (req, res) => {
  const category = await categoryService.createCategory(req.body);
  sendCreated(res, { message: 'اتضاف القسم', data: category });
});

export const update = asyncHandler(async (req, res) => {
  const category = await categoryService.updateCategory(req.params.id, req.body);
  sendSuccess(res, { message: 'اتحدث القسم', data: category });
});

export const remove = asyncHandler(async (req, res) => {
  const result = await categoryService.removeCategory(req.params.id);
  sendSuccess(res, {
    message: result.deleted
      ? 'اتمسح القسم'
      : `القسم فيه ${result.productsCount} منتج، فاتعطل بدل ما يتمسح`,
    data: result,
  });
});

export default { list, getOne, create, update, remove };
