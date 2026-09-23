/**
 * Sync every app user email into Supabase Authentication.
 * Usage: node scripts/sync-auth-users.mjs
 */
import path from 'path';
import { randomBytes } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const url = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '').replace(/\/rest\/v1$/i, '');
const service = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

async function listAllAuth(admin) {
  const out = [];
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    out.push(...data.users);
    if (data.users.length < 200) break;
  }
  return out;
}

async function main() {
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: row, error } = await admin.from('app_kv').select('value').eq('key', 'app-store.json').maybeSingle();
  if (error) throw error;
  const appUsers = Array.isArray(row?.value?.users) ? row.value.users : [];
  console.log('App users:', appUsers.length);

  const authUsers = await listAllAuth(admin);
  const byEmail = new Map(authUsers.map((u) => [(u.email || '').toLowerCase(), u]));

  let created = 0;
  for (const u of appUsers) {
    const email = String(u.email || '')
      .trim()
      .toLowerCase();
    if (!email) continue;
    const existing = byEmail.get(email);
    if (existing) {
      if (!existing.email_confirmed_at) {
        await admin.auth.admin.updateUserById(existing.id, { email_confirm: true });
        console.log('Confirmed', email);
      } else {
        console.log('Exists   ', email);
      }
      continue;
    }
    const tempPass = `${randomBytes(24).toString('base64url')}Aa1!`;
    const { data, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: tempPass,
      email_confirm: true,
      user_metadata: {
        full_name: u.fullName || '',
        phone: u.phone || '',
        role: u.role || '',
        organization_id: u.organizationId || null,
        synced_from_app: true,
      },
    });
    if (createErr) console.log('FAIL    ', email, createErr.message);
    else {
      created += 1;
      console.log('Created ', email, data.user.id);
    }
  }

  const after = await listAllAuth(admin);
  console.log(`\nDone. Created ${created}. Auth total now: ${after.length}`);
  after.forEach((u) => console.log(' -', u.email));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
