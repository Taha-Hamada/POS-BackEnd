import Settings, { SETTINGS_ID } from './settings.model.js';

/**
 * بيرجّع الإعدادات وبينشئها بقيمها الافتراضية لو أول مرة.
 * الـ upsert بيخلي القراءة الأولى مأمونة من غير خطوة تجهيز منفصلة.
 */
export const getSettings = () =>
  Settings.findByIdAndUpdate(
    SETTINGS_ID,
    { $setOnInsert: { _id: SETTINGS_ID } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).lean();

export const updateSettings = (payload, { userId } = {}) =>
  Settings.findByIdAndUpdate(
    SETTINGS_ID,
    { $set: { ...payload, updatedBy: userId ?? null } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
  ).lean();

export default { getSettings, updateSettings };
