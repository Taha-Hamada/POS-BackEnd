import asyncHandler from '../../core/http/asyncHandler.js';
import { sendCreated, sendSuccess } from '../../core/http/apiResponse.js';

import * as authService from './auth.service.js';

export const login = asyncHandler(async (req, res) => {
  const result = await authService.login(req.body);
  sendSuccess(res, { message: 'تم تسجيل الدخول', data: result });
});

export const refresh = asyncHandler(async (req, res) => {
  const result = await authService.refreshSession(req.body.refreshToken);
  sendSuccess(res, { message: 'تم تجديد الجلسة', data: result });
});

export const me = asyncHandler(async (req, res) => {
  const user = await authService.getProfile(req.user.id);
  sendSuccess(res, { data: user });
});

export const changePassword = asyncHandler(async (req, res) => {
  const result = await authService.changePassword(req.user.id, req.body);
  sendSuccess(res, {
    message: 'اتغيرت كلمة السر، الأجهزة التانية محتاجة دخول من جديد',
    data: result,
  });
});

export const logoutAll = asyncHandler(async (req, res) => {
  const result = await authService.revokeAllSessions(req.user.id);
  sendSuccess(res, { message: 'اتسجل الخروج من كل الأجهزة', data: result });
});

export const bootstrap = asyncHandler(async (req, res) => {
  const result = await authService.bootstrapAdmin(req.body);
  sendCreated(res, { message: 'اتعمل حساب المدير الأول', data: result });
});

export default { login, refresh, me, changePassword, logoutAll, bootstrap };
