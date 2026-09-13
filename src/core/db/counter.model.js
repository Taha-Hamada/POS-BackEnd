import mongoose from 'mongoose';

/**
 * عدّادات الأرقام المتسلسلة (فواتير، مرتجعات، أوامر شراء).
 * الزيادة بتحصل بـ findOneAndUpdate و$inc، فهي عملية ذرية على مستند واحد:
 * أي عدد طلبات متوازية بياخدوا أرقام مختلفة من غير ما نحتاج قفل.
 */
const counterSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    value: { type: Number, default: 0 },
  },
  { versionKey: false },
);

export const Counter = mongoose.model('Counter', counterSchema);

/**
 * بيرجّع الرقم الجديد بصيغة PREFIX-000123.
 * العدّاد بيتفصل لكل مفتاح، فكل فرع ينفع يكون له تسلسله لو حبينا.
 */
export const nextSequence = async (key, { prefix, padding = 6, session } = {}) => {
  const counter = await Counter.findByIdAndUpdate(
    key,
    { $inc: { value: 1 } },
    { new: true, upsert: true, session, setDefaultsOnInsert: true },
  );

  const serial = String(counter.value).padStart(padding, '0');

  return prefix ? `${prefix}-${serial}` : serial;
};

export default nextSequence;
