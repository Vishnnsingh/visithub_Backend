import fs from 'fs';
import path from 'path';
import { getSupabaseAdmin } from '../config/supabase';
import env from '../config/env';
import logger from '../config/logger';

export const UPLOADS_BUCKET = 'uploads';

function uploadDir() {
  return path.join(process.cwd(), env.UPLOAD_DIR);
}

function contentTypeFor(filename: string) {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.pdf') return 'application/pdf';
  return 'application/octet-stream';
}

/** Upload a local file into Supabase Storage (same filename). */
export async function mirrorFileToSupabase(filename: string): Promise<boolean> {
  const admin = getSupabaseAdmin();
  if (!admin) return false;
  const full = path.join(uploadDir(), filename);
  if (!fs.existsSync(full)) return false;
  const body = fs.readFileSync(full);
  const { error } = await admin.storage.from(UPLOADS_BUCKET).upload(filename, body, {
    contentType: contentTypeFor(filename),
    upsert: true,
  });
  if (error) {
    logger.warn(`Supabase storage upload failed (${filename}): ${error.message}`);
    return false;
  }
  return true;
}

/** Download all objects from Storage bucket into local uploads/. */
export async function hydrateUploadsFromSupabase(): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) return;

  const dir = uploadDir();
  fs.mkdirSync(dir, { recursive: true });

  try {
    const { data: objects, error } = await admin.storage.from(UPLOADS_BUCKET).list('', {
      limit: 1000,
      offset: 0,
    });
    if (error) {
      logger.warn(
        `Supabase storage list failed: ${error.message}. Run sql/010_storage_uploads.sql if bucket missing.`
      );
      return;
    }
    if (!objects?.length) {
      logger.info('Supabase uploads bucket empty — will upload local files on migrate/first write');
      return;
    }

    let n = 0;
    for (const obj of objects) {
      if (!obj.name || obj.name === '.emptyFolderPlaceholder') continue;
      const dest = path.join(dir, obj.name);
      if (fs.existsSync(dest) && fs.statSync(dest).size > 0) continue;
      const { data, error: dlErr } = await admin.storage.from(UPLOADS_BUCKET).download(obj.name);
      if (dlErr || !data) {
        logger.warn(`Download ${obj.name}: ${dlErr?.message || 'no data'}`);
        continue;
      }
      const buf = Buffer.from(await data.arrayBuffer());
      fs.writeFileSync(dest, buf);
      n += 1;
    }
    logger.info(`Supabase uploads hydrated (${n} files downloaded)`);
  } catch (err) {
    logger.warn(`hydrateUploadsFromSupabase: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** Push every local uploads/* file to Supabase Storage. */
export async function bootstrapUploadsToSupabase(): Promise<number> {
  const admin = getSupabaseAdmin();
  if (!admin) return 0;
  const dir = uploadDir();
  if (!fs.existsSync(dir)) return 0;
  const files = fs.readdirSync(dir).filter((f) => f !== '.gitkeep' && !f.startsWith('.'));
  let n = 0;
  for (const file of files) {
    const ok = await mirrorFileToSupabase(file);
    if (ok) n += 1;
  }
  if (n > 0) logger.info(`Supabase uploads bootstrapped (${n} files)`);
  return n;
}
