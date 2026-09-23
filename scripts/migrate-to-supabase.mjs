/**
 * One-shot migrate: local data/*.json → app_kv + uploads/* → Storage bucket.
 *
 * Prerequisites:
 * 1. Run sql/009_app_kv.sql and sql/010_storage_uploads.sql in Supabase SQL Editor
 * 2. .env must have REAL service_role key (not the anon key)
 *
 * Usage: node --import tsx scripts/migrate-to-supabase.mjs
 *    or: npx tsx scripts/migrate-to-supabase.ts
 */
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const url = process.env.SUPABASE_URL || '';
const anon = process.env.SUPABASE_ANON_KEY || '';
const service = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function decodeRole(jwt) {
  try {
    const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'));
    return String(payload.role || '');
  } catch {
    return '';
  }
}

async function main() {
  if (!url || !service) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
    process.exit(1);
  }

  const role = decodeRole(service);
  console.log('SERVICE_ROLE_KEY role claim:', role || '(unknown)');
  if (service === anon) {
    console.error(
      '\nERROR: SUPABASE_SERVICE_ROLE_KEY is the SAME as SUPABASE_ANON_KEY.\n' +
        'Open Supabase → Project Settings → API → copy the secret "service_role" key\n' +
        '(Reveal / copy). Paste it into .env as SUPABASE_SERVICE_ROLE_KEY, then re-run.\n'
    );
    process.exit(1);
  }
  if (role && role !== 'service_role') {
    console.error(
      `\nERROR: SERVICE_ROLE_KEY has role="${role}", expected "service_role".\n` +
        'Use the service_role secret from Supabase API settings.\n'
    );
    process.exit(1);
  }

  const admin = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Ensure app_kv readable
  const probe = await admin.from('app_kv').select('key').limit(1);
  if (probe.error) {
    console.error(
      'app_kv table missing or inaccessible:',
      probe.error.message,
      '\n→ Run Backend/sql/009_app_kv.sql in Supabase SQL Editor first.'
    );
    process.exit(1);
  }

  const dataDir = path.join(process.cwd(), 'data');
  const jsonFiles = fs.readdirSync(dataDir).filter((f) => f.endsWith('.json'));
  console.log(`Migrating ${jsonFiles.length} JSON stores…`);
  for (const file of jsonFiles) {
    const full = path.join(dataDir, file);
    const value = JSON.parse(fs.readFileSync(full, 'utf8'));
    const { error } = await admin.from('app_kv').upsert(
      { key: file, value, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    );
    if (error) {
      console.error(`  FAIL ${file}:`, error.message);
    } else {
      console.log(`  OK   ${file}`);
    }
  }

  // Storage bucket
  const { data: buckets } = await admin.storage.listBuckets();
  const hasUploads = (buckets || []).some((b) => b.name === 'uploads' || b.id === 'uploads');
  if (!hasUploads) {
    const { error } = await admin.storage.createBucket('uploads', {
      public: true,
      fileSizeLimit: 5 * 1024 * 1024,
      allowedMimeTypes: ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'application/pdf'],
    });
    if (error) {
      console.error(
        'Could not create uploads bucket:',
        error.message,
        '\n→ Run Backend/sql/010_storage_uploads.sql in SQL Editor.'
      );
    } else {
      console.log('Created storage bucket: uploads');
    }
  }

  const uploadsDir = path.join(process.cwd(), 'uploads');
  const files = fs.existsSync(uploadsDir)
    ? fs.readdirSync(uploadsDir).filter((f) => f !== '.gitkeep' && !f.startsWith('.'))
    : [];
  console.log(`Migrating ${files.length} upload files…`);
  let ok = 0;
  for (const file of files) {
    const full = path.join(uploadsDir, file);
    const buf = fs.readFileSync(full);
    const ext = path.extname(file).toLowerCase();
    const contentType =
      ext === '.png'
        ? 'image/png'
        : ext === '.webp'
          ? 'image/webp'
          : ext === '.pdf'
            ? 'application/pdf'
            : 'image/jpeg';
    const { error } = await admin.storage.from('uploads').upload(file, buf, {
      contentType,
      upsert: true,
    });
    if (error) console.error(`  FAIL ${file}:`, error.message);
    else {
      ok += 1;
      console.log(`  OK   ${file}`);
    }
  }

  console.log(`\nDone. JSON stores: ${jsonFiles.length}, images uploaded: ${ok}/${files.length}`);
  console.log('Next: put the same SERVICE_ROLE key on Render env and redeploy.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
