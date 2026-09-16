import { Router } from 'express';
import { z } from 'zod';

import { PERMISSIONS } from '../../core/constants/index.js';
import { EDITABLE_TIER_KEYS } from '../../core/constants/loyalty.js';
import { sendSuccess } from '../../core/http/apiResponse.js';
import asyncHandler from '../../core/http/asyncHandler.js';
import {
  authenticate,
  requirePermissions,
} from '../../middlewares/auth.middleware.js';
import validate from '../../middlewares/validate.middleware.js';

import * as settingsService from './settings.service.js';

const loyaltyTier = z.object({
  key: z.enum(EDITABLE_TIER_KEYS),
  name: z.string().trim().min(1, 'اسم المستوى مطلوب').max(40),
  minPurchases: z.number().min(1, 'الحد الأدنى للمستوى لازم يكون أكبر من صفر'),
  discountPercent: z.number().min(0).max(100, 'نسبة الخصم لازم تكون بين 0 و 100'),
  benefits: z.array(z.string().trim().min(1).max(120)).max(10).default([]),
});

const loyaltyTiers = z
  .array(loyaltyTier)
  .length(EDITABLE_TIER_KEYS.length, 'لازم تبعت المستويات التلاتة مع بعض')
  .refine(
    (tiers) => new Set(tiers.map((tier) => tier.key)).size === tiers.length,
    'كل مستوى لازم يتبعت مرة واحدة',
  )
  .refine((tiers) => {
    const byKey = Object.fromEntries(tiers.map((tier) => [tier.key, tier]));
    const ordered = EDITABLE_TIER_KEYS.map((key) => byKey[key]);
    if (ordered.some((tier) => !tier)) return true;

    return ordered.every(
      (tier, i) => i === 0 || tier.minPurchases > ordered[i - 1].minPurchases,
    );
  }, 'حدود المستويات لازم تكون تصاعدية: فضي ثم ذهبي ثم بلاتيني');

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
      loyaltyTiers,
      notifications: z
        .object({ lowStock: z.boolean(), expiry: z.boolean() })
        .partial(),
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
