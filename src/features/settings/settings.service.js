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

export const updateSettings = async (payload, { userId } = {}) => {
  const settings = await Settings.findByIdAndUpdate(
    SETTINGS_ID,
    { $set: { ...payload, updatedBy: userId ?? null } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
  ).lean();

  return settings;
};

export default { getSettings, updateSettings };
