import {
  sendCreated,
  sendPaginated,
  sendSuccess,
} from '../../core/http/apiResponse.js';
import asyncHandler from '../../core/http/asyncHandler.js';

import * as rolePolicyService from './rolePolicy.service.js';
import * as userService from './user.service.js';

export const list = asyncHandler(async (req, res) => {
  const { items, pagination } = await userService.listUsers(req.query);
  sendPaginated(res, { items, pagination });
});

export const getOne = asyncHandler(async (req, res) => {
  const user = await userService.getUserById(req.params.id);
  sendSuccess(res, { data: user });
});

export const create = asyncHandler(async (req, res) => {
  const user = await userService.createUser(req.body);
  sendCreated(res, { message: 'اتضاف المستخدم', data: user });
});

export const update = asyncHandler(async (req, res) => {
  const user = await userService.updateUser(req.params.id, req.body);
  sendSuccess(res, { message: 'اتحدثت بيانات المستخدم', data: user });
});

export const resetPassword = asyncHandler(async (req, res) => {
  const result = await userService.resetUserPassword(
    req.params.id,
    req.body.newPassword,
  );
  sendSuccess(res, {
    message: 'اتغيرت كلمة السر وكل جلسات المستخدم اتقفلت',
    data: result,
  });
});

export const updatePermissions = asyncHandler(async (req, res) => {
  const user = await userService.updateUserPermissions(req.params.id, req.body);
  sendSuccess(res, { message: 'اتحدثت الصلاحيات', data: user });
});

export const setActiveState = asyncHandler(async (req, res) => {
  const user = await userService.setUserActiveState(
    req.params.id,
    req.body.isActive,
    req.user.id,
  );
  sendSuccess(res, {
    message: user.isActive ? 'الحساب اتفعل' : 'الحساب اتعطل',
    data: user,
  });
});

/** كتالوج الأدوار والصلاحيات — الفرونت بيبني منه شاشة الصلاحيات. */
export const catalog = asyncHandler(async (_req, res) => {
  const data = await rolePolicyService.getCatalog();
  sendSuccess(res, { data });
});

export const updateRolePermissions = asyncHandler(async (req, res) => {
  const data = await rolePolicyService.updateRolePermissions(
    req.params.role,
    req.body.permissions,
    { userId: req.user.id },
  );
  sendSuccess(res, { message: 'اتحفظت صلاحيات الدور', data });
});

export const resetRolePermissions = asyncHandler(async (req, res) => {
  const data = await rolePolicyService.resetRolePermissions(req.params.role);
  sendSuccess(res, { message: 'الدور رجع لصلاحياته الافتراضية', data });
});

export default {
  list,
  getOne,
  create,
  update,
  resetPassword,
  updatePermissions,
  setActiveState,
  catalog,
  updateRolePermissions,
  resetRolePermissions,
};
