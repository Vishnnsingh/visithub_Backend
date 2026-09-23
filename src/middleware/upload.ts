import path from 'path';
import fs from 'fs';
import multer from 'multer';
import type { NextFunction, Request, Response } from 'express';
import env from '../config/env';
import AppError from '../utils/AppError';
import { mirrorFileToSupabase } from '../data/uploadPersist';

const uploadDir = path.join(__dirname, '../../', env.UPLOAD_DIR);
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});

function mirrorReqFiles(req: Request) {
  if (req.file?.filename) void mirrorFileToSupabase(req.file.filename);
  if (Array.isArray(req.files)) {
    for (const f of req.files) {
      if (f.filename) void mirrorFileToSupabase(f.filename);
    }
  } else if (req.files && typeof req.files === 'object') {
    for (const list of Object.values(req.files)) {
      for (const f of list) {
        if (f.filename) void mirrorFileToSupabase(f.filename);
      }
    }
  }
}

function afterMirror(mw: (req: Request, res: Response, next: NextFunction) => void) {
  return (req: Request, res: Response, next: NextFunction) => {
    mw(req, res, (err?: unknown) => {
      if (!err) mirrorReqFiles(req);
      next(err as Error | undefined);
    });
  };
}

const baseUpload = multer({
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

const logoMulter = multer({
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

const visitorMulter = multer({
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

/** Drop-in multer-like helpers that also mirror files to Supabase Storage. */
const upload = {
  single: (field: string) => afterMirror(baseUpload.single(field)),
  array: (field: string, max?: number) => afterMirror(baseUpload.array(field, max)),
  fields: (fields: multer.Field[]) => afterMirror(baseUpload.fields(fields)),
  none: () => afterMirror(baseUpload.none()),
  any: () => afterMirror(baseUpload.any()),
};

export const logoUpload = {
  single: (field: string) => afterMirror(logoMulter.single(field)),
  array: (field: string, max?: number) => afterMirror(logoMulter.array(field, max)),
  fields: (fields: multer.Field[]) => afterMirror(logoMulter.fields(fields)),
};

export const visitorUpload = {
  single: (field: string) => afterMirror(visitorMulter.single(field)),
  array: (field: string, max?: number) => afterMirror(visitorMulter.array(field, max)),
  fields: (fields: multer.Field[]) => afterMirror(visitorMulter.fields(fields)),
  any: () => afterMirror(visitorMulter.any()),
};

export default upload;
