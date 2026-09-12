import asyncHandler from '../../core/http/asyncHandler.js';
import {
  sendCreated,
  sendPaginated,
  sendSuccess,
} from '../../core/http/apiResponse.js';

import * as branchService from './branch.service.js';

export const list = asyncHandler(async (req, res) => {
  const { items, pagination } = await branchService.listBranches(req.query);
  sendPaginated(res, { items, pagination });
});

export const getOne = asyncHandler(async (req, res) => {
  const branch = await branchService.getBranchById(req.params.id);
  sendSuccess(res, { data: branch });
});

export const create = asyncHandler(async (req, res) => {
  const branch = await branchService.createBranch(req.body);
  sendCreated(res, { message: 'اتضاف الفرع', data: branch });
});

export const update = asyncHandler(async (req, res) => {
  const branch = await branchService.updateBranch(req.params.id, req.body);
  sendSuccess(res, { message: 'اتحدّث الفرع', data: branch });
});

export const deactivate = asyncHandler(async (req, res) => {
  const branch = await branchService.deactivateBranch(req.params.id);
  sendSuccess(res, { message: 'اتعطّل الفرع', data: branch });
});

export const setOpenState = asyncHandler(async (req, res) => {
  const branch = await branchService.setBranchOpenState(
    req.params.id,
    req.body.isOpen,
  );
  sendSuccess(res, {
    message: branch.isOpen ? 'الفرع اتفتح' : 'الفرع اتقفل',
    data: branch,
  });
});

export default { list, getOne, create, update, deactivate, setOpenState };
