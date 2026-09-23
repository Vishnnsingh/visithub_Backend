/**
 * Copy vh_users → users and vh_organizations → organizations AFTER sql/012 is applied.
 * If 012 not applied yet, prints the SQL to run.
 */
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const url = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '').replace(/\/rest\/v1$/i, '');
const service = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

async function main() {
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });

  const probeUsers = await admin.from('users').select('password_hash').limit(1);
  const hasPasswordHash = !probeUsers.error;
  const probeVh = await admin.from('vh_users').select('id', { count: 'exact', head: true });

  if (probeUsers.error && /password_hash|column/i.test(probeUsers.error.message)) {
    console.error(`
Legacy empty "users" / "organizations" tables are still present.
Run this in Supabase SQL Editor (sql/012_rename_users_organizations.sql):

drop table if exists public.users cascade;
drop table if exists public.organizations cascade;
alter table public.vh_organizations rename to organizations;
alter table public.vh_users rename to users;

Then re-run: node scripts/rename-users-orgs.mjs
`);
    process.exit(1);
  }

  if (probeVh.error) {
    // already renamed
    const u = await admin.from('users').select('id', { count: 'exact', head: true });
    const o = await admin.from('organizations').select('id', { count: 'exact', head: true });
    console.log('Already renamed. users=', u.count, 'organizations=', o.count);
    return;
  }

  if (!hasPasswordHash) {
    console.error('users table missing password_hash — run sql/012 first.');
    process.exit(1);
  }

  console.log('Tables already use Visit Hub schema (password_hash present).');
  const u = await admin.from('users').select('id', { count: 'exact', head: true });
  const o = await admin.from('organizations').select('id', { count: 'exact', head: true });
  console.log('users=', u.count, 'organizations=', o.count);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
