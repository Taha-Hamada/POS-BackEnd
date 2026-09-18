import mongoose from 'mongoose';

import env from '../../config/env.js';

/**
 * إعدادات المتجر — مستند واحد بس في المجموعة.
 * المفتاح ثابت عشان مايبقاش فيه أكتر من نسخة إعدادات يتناقضوا.
 */
export const SETTINGS_ID = 'store';

const settingsSchema = new mongoose.Schema(
  {
    _id: { type: String, default: SETTINGS_ID },

    storeName: { type: String, trim: true, default: 'متجري' },
    storeAddress: { type: String, trim: true, default: '' },
    storePhone: { type: String, trim: true, default: '' },
    taxNumber: { type: String, trim: true, default: '' },
    logoUrl: { type: String, trim: true, default: null },

    currency: { type: String, trim: true, default: env.DEFAULT_CURRENCY },
    /** نسبة من 0 لـ 1 — 0.14 يعني 14%. */
    taxRate: { type: Number, default: env.DEFAULT_TAX_RATE, min: 0, max: 1 },
    /** الأسعار المعروضة شاملة الضريبة ولا لأ — بيأثر على شكل الإيصال بس. */
    pricesIncludeTax: { type: Boolean, default: false },

    receiptFooter: { type: String, trim: true, default: 'شكرًا لزيارتكم' },
    receiptWidthMm: { type: Number, default: 80, min: 48, max: 120 },

    /** تنبيهات الجرس في الشريط العلوي. */
    notifications: {
      lowStock: { type: Boolean, default: true },
      expiry: { type: Boolean, default: true },
    },

    /** لو مقفولة، البيع بيرفض لما الرصيد ميكفيش. */
    allowNegativeStock: { type: Boolean, default: false },
    /** البيع الآجل لازم يكون على عميل مسجّل. */
    requireCustomerForCredit: { type: Boolean, default: true },
    /** الكاشير لازم يفتح وردية قبل ما يبيع. */
    requireOpenShift: { type: Boolean, default: true },

    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, versionKey: false },
);

export const Settings = mongoose.model('Settings', settingsSchema);

export default Settings;
