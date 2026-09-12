import {
  sendCreated,
  sendPaginated,
  sendSuccess,
} from '../../core/http/apiResponse.js';
import asyncHandler from '../../core/http/asyncHandler.js';
import {
  PERMISSIONS,
  ROLE_LABELS,
  ROLE_PERMISSIONS,
} from '../../core/constants/index.js';

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
  sendSuccess(res, {
    data: {
      roles: Object.entries(ROLE_LABELS).map(([value, label]) => ({
        value,
        label,
        permissions: ROLE_PERMISSIONS[value] ?? [],
      })),
      permissions: Object.entries(PERMISSIONS).map(([key, value]) => ({
        key,
        value,
        group: value.split(':')[0],
      })),
    },
  });
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
};
