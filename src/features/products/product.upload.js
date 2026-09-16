import fs from 'node:fs';
import path from 'node:path';

import multer from 'multer';

import { productImagesDir } from '../../config/uploads.js';
import ApiError from '../../core/errors/ApiError.js';

const MAX_BYTES = 2 * 1024 * 1024;
const EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

const storage = multer.diskStorage({
  destination: productImagesDir,
  // اسم عشوائي بمعرّف المنتج والوقت: مبنثقش في اسم الملف الجاي من العميل.
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${req.params.id}-${Date.now()}${ext === '.jpeg' ? '.jpg' : ext}`);
  },
});

const single = multer({
  storage,
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!EXTENSIONS.has(ext)) {
      cb(ApiError.badRequest('الصورة لازم تكون PNG أو JPG أو WEBP', { code: 'INVALID_IMAGE' }));
      return;
    }
    cb(null, true);
  },
}).single('image');

/** بيتأكد إن محتوى الملف صورة فعلًا، مش أي ملف متسمّي .png. */
const looksLikeImage = async (file) => {
  const handle = await fs.promises.open(file, 'r');
  try {
    const { buffer } = await handle.read(Buffer.alloc(12), 0, 12, 0);
    const isPng = buffer.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    const isWebp =
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP';
    return isPng || isJpeg || isWebp;
  } finally {
    await handle.close();
  }
};

/** رفع صورة منتج واحدة في الحقل `image` — حد أقصى 2 ميجا. */
export const productImageUpload = (req, res, next) => {
  single(req, res, async (error) => {
    if (error instanceof ApiError) return next(error);

    if (error instanceof multer.MulterError) {
      return next(
        ApiError.badRequest(
          error.code === 'LIMIT_FILE_SIZE' ? 'الصورة أكبر من 2 ميجابايت' : 'رفع الصورة فشل',
          { code: error.code },
        ),
      );
    }

    if (error) return next(error);
    if (!req.file) {
      return next(ApiError.badRequest('اختار صورة للمنتج', { code: 'IMAGE_REQUIRED' }));
    }

    try {
      if (!(await looksLikeImage(req.file.path))) {
        await fs.promises.unlink(req.file.path).catch(() => {});
        return next(ApiError.badRequest('الملف مش صورة صالحة', { code: 'INVALID_IMAGE' }));
      }
      return next();
    } catch (readError) {
      return next(readError);
    }
  });
};

export default productImageUpload;
