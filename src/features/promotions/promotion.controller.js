import {
  sendCreated,
  sendPaginated,
  sendSuccess,
} from '../../core/http/apiResponse.js';
import asyncHandler from '../../core/http/asyncHandler.js';

import * as promotionService from './promotion.service.js';

export const list = asyncHandler(async (req, res) => {
  const { items, pagination } = await promotionService.listPromotions(req.query);
  sendPaginated(res, { items, pagination });
});

export const summary = asyncHandler(async (_req, res) => {
  const data = await promotionService.getPromotionsSummary();
  sendSuccess(res, { data });
});

export const live = asyncHandler(async (_req, res) => {
  const data = await promotionService.listLivePromotions();
  sendSuccess(res, { data });
});

export const getOne = asyncHandler(async (req, res) => {
  const data = await promotionService.getPromotionById(req.params.id);
  sendSuccess(res, { data });
});

export const create = asyncHandler(async (req, res) => {
  const data = await promotionService.createPromotion(req.body, {
    userId: req.user.id,
  });
  sendCreated(res, { message: 'اتضاف العرض', data });
});

export const update = asyncHandler(async (req, res) => {
  const data = await promotionService.updatePromotion(req.params.id, req.body);
  sendSuccess(res, { message: 'اتحدّث العرض', data });
});

export const setActive = asyncHandler(async (req, res) => {
  const data = await promotionService.setPromotionActive(
    req.params.id,
    req.body.isActive,
  );
  sendSuccess(res, {
    message: data.isActive ? 'العرض اتفعّل' : 'العرض اتوقف',
    data,
  });
});

export default { list, summary, live, getOne, create, update, setActive };
