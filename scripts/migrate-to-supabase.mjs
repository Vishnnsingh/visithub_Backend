/**
 * Migrate local data → Supabase tables + Storage.
 * Requires REAL service_role key in .env (not anon).
 *
 * 1) Supabase SQL Editor run:
 *    sql/009_app_kv.sql
 *    sql/010_storage_uploads.sql
 *    sql/011_visit_hub_tables.sql
 * 2) Fix SUPABASE_SERVICE_ROLE_KEY
 * 3) node scripts/migrate-to-supabase.mjs
 */
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env') });

function decodeRole(jwt) {
  try {
    return JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8')).role || '';
  } catch {
    return '';
  }
}

async function main() {
  const url = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '').replace(/\/rest\/v1$/i, '');
  const anon = process.env.SUPABASE_ANON_KEY || '';
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!url || !service) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }
  console.log('SUPABASE_URL:', url);

  const role = decodeRole(service);
  console.log('SERVICE_ROLE_KEY role:', role || '(unknown)');
  if (service === anon || role === 'anon') {
    console.error(`
============================================================
  SUPABASE_SERVICE_ROLE_KEY is still the ANON key.
  Migration CANNOT run until you fix this.

  Fix:
  1. Open https://supabase.com/dashboard/project/qjtbxzybewrvqmdpbqgi/settings/api
  2. Under "Project API keys" find  service_role  (secret)
  3. Click Reveal, copy the key
  4. Put it in Backend/.env as SUPABASE_SERVICE_ROLE_KEY=...
  5. Also set the same key on Render Environment
  6. Re-run: node scripts/migrate-to-supabase.mjs
============================================================
`);
    process.exit(1);
  }

  const admin = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  for (const table of ['app_kv', 'vh_users', 'vh_organizations']) {
    const { error } = await admin.from(table).select('*', { count: 'exact', head: true });
    if (error) {
      console.error(
        `Table missing: ${table} → ${error.message}\nRun sql/011_visit_hub_tables.sql in SQL Editor.`
      );
      process.exit(1);
    }
  }

  const dataDir = path.join(process.cwd(), 'data');
  const jsonFiles = fs.readdirSync(dataDir).filter((f) => f.endsWith('.json'));
  console.log(`\n1) Uploading ${jsonFiles.length} stores → app_kv …`);
  const loaded = {};
  for (const file of jsonFiles) {
    const value = JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'));
    loaded[file] = value;
    const { error } = await admin.from('app_kv').upsert(
      { key: file, value, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    );
    console.log(error ? `  FAIL ${file}: ${error.message}` : `  OK   ${file}`);
  }

  // Dynamic import sync helpers via inline logic (script is plain JS)
  console.log('\n2) Expanding into real tables (vh_*) …');
  await syncApp(admin, loaded['app-store.json']);
  await syncSubs(admin, loaded['org-subscriptions.json']);
  await syncPlans(admin, loaded['subscription-plans.json']);
  await syncTypes(admin, loaded['business-types.json']);
  await syncMsgs(admin, 'vh_contact_messages', loaded['contact-messages.json']?.messages);
  await syncMsgs(admin, 'vh_help_messages', loaded['help-messages.json']?.messages);
  await syncLegal(admin, loaded['legal-pages.json']?.pages);
  await syncPays(admin, loaded['payment-ledger.json']?.payments);

  for (const key of [
    'landing-theme.json',
    'contact-info.json',
    'invoice-settings.json',
    'custom-plan-settings.json',
    'org-custom-plan-settings.json',
    'business-type-plan-settings.json',
    'payment-ledger.json',
  ]) {
    if (!loaded[key]) continue;
    await admin.from('vh_settings').upsert({
      key,
      value: loaded[key],
      updated_at: new Date().toISOString(),
    });
    console.log(`  OK   vh_settings:${key}`);
  }

  console.log('\n3) Uploading images → Storage bucket uploads …');
  const { data: buckets } = await admin.storage.listBuckets();
  if (!(buckets || []).some((b) => b.id === 'uploads' || b.name === 'uploads')) {
    const { error } = await admin.storage.createBucket('uploads', {
      public: true,
      fileSizeLimit: 5 * 1024 * 1024,
    });
    if (error) console.error('  bucket:', error.message, '(run sql/010_storage_uploads.sql)');
    else console.log('  Created bucket uploads');
  }

  const uploadsDir = path.join(process.cwd(), 'uploads');
  const files = fs.existsSync(uploadsDir)
    ? fs.readdirSync(uploadsDir).filter((f) => f !== '.gitkeep' && !f.startsWith('.'))
    : [];
  let ok = 0;
  for (const file of files) {
    const buf = fs.readFileSync(path.join(uploadsDir, file));
    const ext = path.extname(file).toLowerCase();
    const contentType =
      ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : ext === '.pdf' ? 'application/pdf' : 'image/jpeg';
    const { error } = await admin.storage.from('uploads').upload(file, buf, { contentType, upsert: true });
    if (error) console.error(`  FAIL ${file}: ${error.message}`);
    else {
      ok += 1;
      console.log(`  OK   ${file}`);
    }
  }

  console.log(`\nDone. Tables filled. Images ${ok}/${files.length}.`);
  console.log('Local JSON will no longer be written when backend runs with Supabase.');
  console.log('Set the same SERVICE_ROLE key on Render and redeploy.');
}

async function syncApp(admin, data) {
  if (!data) return;
  const orgs = data.organizations || [];
  const users = data.users || [];
  if (orgs.length) {
    const { error } = await admin.from('vh_organizations').upsert(
      orgs.map((o) => ({
        id: o.id,
        name: o.name || '',
        slug: o.slug || null,
        business_type: o.businessType || '',
        contact_number: o.contactNumber || '',
        email: o.email || '',
        website: o.website ?? null,
        address_line_1: o.addressLine1 || '',
        address_line_2: o.addressLine2 ?? null,
        city: o.city || '',
        state: o.state || '',
        country: o.country || 'India',
        pincode: o.pincode || '',
        admin_user_id: o.adminUserId || null,
        is_active: o.isActive !== false,
        logo_file: o.logoFile ?? null,
        welcome_image_file: o.welcomeImageFile ?? null,
        raw: o,
        created_at: o.createdAt || new Date().toISOString(),
        updated_at: o.updatedAt || new Date().toISOString(),
      })),
      { onConflict: 'id' }
    );
    console.log(error ? `  FAIL orgs: ${error.message}` : `  OK   vh_organizations (${orgs.length})`);
  }
  if (users.length) {
    const { error } = await admin.from('vh_users').upsert(
      users.map((u) => ({
        id: u.id,
        email: String(u.email || '').toLowerCase(),
        password_hash: u.passwordHash || '',
        full_name: u.fullName || '',
        phone: u.phone || '',
        role: u.role || 'org_admin',
        organization_id: u.organizationId || null,
        is_active: u.isActive !== false,
        raw: u,
        created_at: u.createdAt || new Date().toISOString(),
        updated_at: u.updatedAt || new Date().toISOString(),
      })),
      { onConflict: 'id' }
    );
    console.log(error ? `  FAIL users: ${error.message}` : `  OK   vh_users (${users.length})`);
  }
  const visitors = data.visitors || [];
  for (let i = 0; i < visitors.length; i += 200) {
    const slice = visitors.slice(i, i + 200);
    const { error } = await admin.from('vh_visitors').upsert(
      slice.map((v) => ({
        id: v.id,
        organization_id: v.organizationId,
        raw: v,
        created_at: v.createdAt || new Date().toISOString(),
        updated_at: v.updatedAt || new Date().toISOString(),
      })),
      { onConflict: 'id' }
    );
    if (error) console.error(`  FAIL visitors: ${error.message}`);
  }
  if (visitors.length) console.log(`  OK   vh_visitors (${visitors.length})`);
  const qrs = data.qrCodes || [];
  if (qrs.length) {
    const { error } = await admin.from('vh_qr_codes').upsert(
      qrs.map((q) => ({
        id: q.id,
        organization_id: q.organizationId,
        public_code: q.publicCode || null,
        raw: q,
        created_at: q.createdAt || new Date().toISOString(),
        updated_at: q.updatedAt || new Date().toISOString(),
      })),
      { onConflict: 'id' }
    );
    console.log(error ? `  FAIL qr: ${error.message}` : `  OK   vh_qr_codes (${qrs.length})`);
  }
}

async function syncSubs(admin, data) {
  const subs = data?.subscriptions || [];
  if (!subs.length) return;
  const { error } = await admin.from('vh_org_subscriptions').upsert(
    subs.map((s) => ({
      id: s.id,
      organization_id: s.organizationId || null,
      raw: s,
      paid_at: s.paidAt || null,
      updated_at: new Date().toISOString(),
    })),
    { onConflict: 'id' }
  );
  console.log(error ? `  FAIL subs: ${error.message}` : `  OK   vh_org_subscriptions (${subs.length})`);
}

async function syncPlans(admin, data) {
  const plans = data?.plans || [];
  if (!plans.length) return;
  const { error } = await admin.from('vh_subscription_plans').upsert(
    plans.map((p) => ({ id: p.id, raw: p, updated_at: new Date().toISOString() })),
    { onConflict: 'id' }
  );
  console.log(error ? `  FAIL plans: ${error.message}` : `  OK   vh_subscription_plans (${plans.length})`);
}

async function syncTypes(admin, data) {
  const types = data?.types || (Array.isArray(data) ? data : []);
  if (!types.length) return;
  const { error } = await admin.from('vh_business_types').upsert(
    types.map((name, i) => ({ name: String(name), sort_order: i })),
    { onConflict: 'name' }
  );
  console.log(error ? `  FAIL types: ${error.message}` : `  OK   vh_business_types (${types.length})`);
}

async function syncMsgs(admin, table, items) {
  if (!items?.length) return;
  const { error } = await admin.from(table).upsert(
    items.map((m) => ({ id: m.id, raw: m, created_at: m.createdAt || new Date().toISOString() })),
    { onConflict: 'id' }
  );
  console.log(error ? `  FAIL ${table}: ${error.message}` : `  OK   ${table} (${items.length})`);
}

async function syncLegal(admin, pages) {
  if (!pages?.length) return;
  const { error } = await admin.from('vh_legal_pages').upsert(
    pages.map((p) => ({ slug: p.slug, raw: p, updated_at: new Date().toISOString() })),
    { onConflict: 'slug' }
  );
  console.log(error ? `  FAIL legal: ${error.message}` : `  OK   vh_legal_pages (${pages.length})`);
}

async function syncPays(admin, payments) {
  if (!payments?.length) return;
  const { error } = await admin.from('vh_payments').upsert(
    payments.map((p) => ({
      id: p.id,
      organization_id: p.organizationId || null,
      raw: p,
      paid_at: p.paidAt || null,
      updated_at: new Date().toISOString(),
    })),
    { onConflict: 'id' }
  );
  console.log(error ? `  FAIL payments: ${error.message}` : `  OK   vh_payments (${payments.length})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
