import { Router } from 'express';
import { z } from 'zod';

import { PERMISSIONS } from '../../core/constants/index.js';
import { sendSuccess } from '../../core/http/apiResponse.js';
import asyncHandler from '../../core/http/asyncHandler.js';
import {
  authenticate,
  requirePermissions,
} from '../../middlewares/auth.middleware.js';
import validate from '../../middlewares/validate.middleware.js';

import * as settingsService from './settings.service.js';

const updateSchema = {
  body: z
    .object({
      storeName: z.string().trim().min(1).max(150),
      storeAddress: z.string().trim().max(300),
      storePhone: z.string().trim().max(30),
      taxNumber: z.string().trim().max(40),
      logoUrl: z.string().trim().url('رابط الشعار غير صالح').nullable(),
      currency: z.string().trim().min(1).max(10),
      taxRate: z.number().min(0).max(1, 'النسبة لازم تكون بين 0 و 1'),
      pricesIncludeTax: z.boolean(),
      receiptFooter: z.string().trim().max(300),
      receiptWidthMm: z.number().int().min(48).max(120),
      pointsPerCurrency: z.number().min(0),
      currencyPerPoint: z.number().min(0),
      minPointsToRedeem: z.number().int().min(0),
      allowNegativeStock: z.boolean(),
      requireCustomerForCredit: z.boolean(),
      requireOpenShift: z.boolean(),
    })
    .partial()
    .refine(
      (value) => Object.keys(value).length > 0,
      'لازم تبعت حقل واحد على الأقل للتعديل',
    ),
};

const router = Router();

router.use(authenticate);

// كل المستخدمين محتاجين يقرأوا الإعدادات عشان الضريبة والعملة في شاشة البيع.
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const settings = await settingsService.getSettings();
    sendSuccess(res, { data: settings });
  }),
);

router.patch(
  '/',
  requirePermissions(PERMISSIONS.SETTINGS_MANAGE),
  validate(updateSchema),
  asyncHandler(async (req, res) => {
    const settings = await settingsService.updateSettings(req.body, {
      userId: req.user.id,
    });
    sendSuccess(res, { message: 'اتحدثت الإعدادات', data: settings });
  }),
);

export default router;
