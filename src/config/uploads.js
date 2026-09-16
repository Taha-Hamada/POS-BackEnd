import fs from 'node:fs';
import path from 'node:path';

import env from './env.js';

/**
 * أماكن الملفات المرفوعة على القرص.
 * الصور بتتخدم من /uploads كملفات ثابتة، والداتابيز بتشيل المسار النسبي بس،
 * عشان تغيير عنوان السيرفر ما يبوّظش روابط الصور القديمة.
 */
export const uploadsRoot = path.resolve(env.UPLOADS_DIR);
export const productImagesDir = path.join(uploadsRoot, 'products');

fs.mkdirSync(productImagesDir, { recursive: true });

const PRODUCT_PREFIX = '/uploads/products/';

export const productImagePath = (filename) => `${PRODUCT_PREFIX}${filename}`;

/** بيمسح صورة مرفوعة عندنا. الروابط الخارجية والملف المش موجود بيتسابوا. */
export const removeUploadedFile = async (publicPath) => {
  if (!publicPath?.startsWith(PRODUCT_PREFIX)) return;

  const file = path.join(productImagesDir, path.basename(publicPath));
  await fs.promises.unlink(file).catch(() => {});
};

export default { uploadsRoot, productImagesDir, productImagePath, removeUploadedFile };
