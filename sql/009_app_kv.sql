-- Visit Hub: persist all backend JSON stores in Supabase
-- Run once in Supabase SQL Editor (service role will access this table).

create table if not exists public.app_kv (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists app_kv_updated_at_idx on public.app_kv (updated_at desc);

alter table public.app_kv enable row level security;

-- No public policies: only service_role (bypasses RLS) reads/writes from the API server.
drop policy if exists "app_kv_deny_all" on public.app_kv;
create policy "app_kv_deny_all"
  on public.app_kv
  for all
  to anon, authenticated
  using (false)
  with check (false);

comment on table public.app_kv is 'Backend JSON file stores mirrored to Supabase for Render persistence';
