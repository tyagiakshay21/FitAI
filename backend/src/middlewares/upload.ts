import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import multer from 'multer';
import { env } from '../config/env';
import { AppError } from '../utils/AppError';

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);
const fileFilter: multer.Options['fileFilter'] = (_req, file, cb) =>
  ALLOWED.has(file.mimetype) ? cb(null, true) : cb(AppError.badRequest('Only JPEG, PNG or WebP images are allowed'));

/** Progress photos are stored on disk (swap for S3/GCS in production). */
export const photoUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      const dir = path.resolve(env.UPLOAD_DIR, 'progress');
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) =>
      cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase() || '.jpg'}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter,
});

/** Food photos are only analysed in memory and never stored. */
export const memoryImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter,
});
