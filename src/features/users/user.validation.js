import { z } from 'zod';

import {
  booleanQuery,
  idParam,
  objectId,
  paginationQuery,
} from '../../core/base/commonSchemas.js';
import { PERMISSION_VALUES, ROLE_VALUES } from '../../core/constants/index.js';
import { passwordRule, usernameRule } from '../auth/auth.validation.js';

const permission = z.enum(PERMISSION_VALUES);

const userBody = z.object({
  name: z.string().trim().min(2, 'الاسم قصير جدا').max(120),
  username: usernameRule,
  password: passwordRule,
  email: z.string().trim().email('البريد غير صالح').nullish(),
  phone: z.string().trim().max(30).optional(),
  role: z.enum(ROLE_VALUES).optional(),
  branch: objectId.nullish(),
  salary: z.number().min(0).optional(),
  hiredAt: z.coerce.date().optional(),
  grantedPermissions: z.array(permission).optional(),
  revokedPermissions: z.array(permission).optional(),
});

export const listUsersSchema = {
  query: paginationQuery.extend({
    role: z.enum(ROLE_VALUES).optional(),
    branch: objectId.optional(),
    isActive: booleanQuery.optional(),
  }),
};

export const getUserSchema = { params: idParam };

export const createUserSchema = { body: userBody };

export const updateUserSchema = {
  params: idParam,
  // كلمة السر ليها مسار مستقل عشان متتغيرش بالغلط مع تعديل بيانات عادية.
  body: userBody.omit({ password: true }).partial().refine(
    (value) => Object.keys(value).length > 0,
    'لازم تبعت حقل واحد على الأقل للتعديل',
  ),
};

export const resetPasswordSchema = {
  params: idParam,
  body: z.object({ newPassword: passwordRule }),
};

export const updatePermissionsSchema = {
  params: idParam,
  body: z.object({
    granted: z.array(permission).default([]),
    revoked: z.array(permission).default([]),
  }),
};

export const setActiveStateSchema = {
  params: idParam,
  body: z.object({ isActive: z.boolean() }),
};

export default {
  listUsersSchema,
  getUserSchema,
  createUserSchema,
  updateUserSchema,
  resetPasswordSchema,
  updatePermissionsSchema,
  setActiveStateSchema,
};
