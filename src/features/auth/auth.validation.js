import { z } from 'zod';

const password = z
  .string()
  .min(8, 'كلمة السر لازم تكون 8 حروف على الأقل')
  .max(72, 'كلمة السر طويلة جدا');

const username = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'اسم المستخدم قصير جدا')
  .max(40)
  .regex(/^[a-z0-9._-]+$/, 'اسم المستخدم يقبل حروف إنجليزية وأرقام و . _ - بس');

export const loginSchema = {
  body: z.object({ username, password: z.string().min(1, 'كلمة السر مطلوبة') }),
};

export const refreshSchema = {
  body: z.object({ refreshToken: z.string().min(1, 'رمز التجديد مطلوب') }),
};

export const changePasswordSchema = {
  body: z.object({
    currentPassword: z.string().min(1, 'كلمة السر الحالية مطلوبة'),
    newPassword: password,
  }),
};

export const bootstrapSchema = {
  body: z.object({
    name: z.string().trim().min(2).max(120),
    username,
    password,
    email: z.string().trim().email('البريد غير صالح').optional(),
    phone: z.string().trim().max(30).optional(),
  }),
};

export { password as passwordRule, username as usernameRule };

export default { loginSchema, refreshSchema, changePasswordSchema, bootstrapSchema };
