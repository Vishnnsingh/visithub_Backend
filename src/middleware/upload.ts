import path from 'path';
import fs from 'fs';
import multer from 'multer';
import env from '../config/env';
import AppError from '../utils/AppError';

const uploadDir = path.join(__dirname, '../../', env.UPLOAD_DIR);
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: env.MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp|pdf/;
    const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
    if (!allowed.test(ext)) {
      return cb(new AppError('Only images and PDF files are allowed', 400));
    }
    return cb(null, true);
  },
});

const LOGO_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const LOGO_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const LOGO_MAX_BYTES = 5 * 1024 * 1024;

export const logoUpload = multer({
  storage,
  limits: { fileSize: LOGO_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!LOGO_TYPES.has(file.mimetype) || !LOGO_EXTS.has(ext)) {
      return cb(new AppError('Logo must be PNG, JPG or WEBP', 400));
    }
    return cb(null, true);
  },
});

export const visitorUpload = multer({
  storage,
  limits: { fileSize: LOGO_MAX_BYTES, files: 16 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!LOGO_TYPES.has(file.mimetype) || !LOGO_EXTS.has(ext)) {
      return cb(new AppError('Upload a PNG, JPG or WEBP image', 400));
    }
    return cb(null, true);
  },
});

export default upload;
