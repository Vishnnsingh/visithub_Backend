-- Visit Hub full relational schema (run in Supabase SQL Editor)
-- Replaces local JSON files. Service role / backend uses these tables.

-- ========== Core ==========
create table if not exists public.vh_organizations (
  id uuid primary key,
  name text not null,
  slug text,
  business_type text not null default '',
  contact_number text not null default '',
  email text not null default '',
  website text,
  address_line_1 text not null default '',
  address_line_2 text,
  city text not null default '',
  state text not null default '',
  country text not null default 'India',
  pincode text not null default '',
  admin_user_id uuid,
  is_active boolean not null default true,
  logo_file text,
  welcome_image_file text,
  working_days jsonb,
  opening_time text,
  closing_time text,
  default_wait_minutes int,
  google_review_enabled boolean,
  google_review_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  raw jsonb
);

create table if not exists public.vh_users (
  id uuid primary key,
  email text not null unique,
  password_hash text not null,
  full_name text not null default '',
  phone text not null default '',
  role text not null default 'org_admin',
  organization_id uuid references public.vh_organizations(id) on delete set null,
  staff_role_id uuid,
  staff_code text,
  allowed_pages jsonb,
  is_active boolean not null default true,
  supabase_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  raw jsonb
);

create index if not exists vh_users_org_idx on public.vh_users (organization_id);
create index if not exists vh_users_email_idx on public.vh_users (lower(email));

create table if not exists public.vh_staff_roles (
  id uuid primary key,
  organization_id uuid not null references public.vh_organizations(id) on delete cascade,
  name text not null,
  code text,
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vh_qr_codes (
  id uuid primary key,
  organization_id uuid not null references public.vh_organizations(id) on delete cascade,
  public_code text,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vh_qr_org_idx on public.vh_qr_codes (organization_id);
create index if not exists vh_qr_public_idx on public.vh_qr_codes (public_code);

create table if not exists public.vh_visitors (
  id uuid primary key,
  organization_id uuid not null references public.vh_organizations(id) on delete cascade,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vh_visitors_org_idx on public.vh_visitors (organization_id);

create table if not exists public.vh_org_json (
  organization_id uuid not null references public.vh_organizations(id) on delete cascade,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (organization_id, kind)
);

-- ========== Billing / plans ==========
create table if not exists public.vh_subscription_plans (
  id uuid primary key,
  raw jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.vh_org_subscriptions (
  id uuid primary key,
  organization_id uuid,
  raw jsonb not null default '{}'::jsonb,
  paid_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists vh_org_subs_org_idx on public.vh_org_subscriptions (organization_id);

create table if not exists public.vh_payments (
  id uuid primary key,
  organization_id uuid,
  raw jsonb not null default '{}'::jsonb,
  paid_at timestamptz,
  updated_at timestamptz not null default now()
);

-- ========== Catalog / CMS ==========
create table if not exists public.vh_business_types (
  name text primary key,
  sort_order int not null default 0
);

create table if not exists public.vh_contact_messages (
  id uuid primary key,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.vh_help_messages (
  id uuid primary key,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.vh_legal_pages (
  slug text primary key,
  raw jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Small settings blobs (landing theme, contact info, invoice, plan settings, gateway…)
create table if not exists public.vh_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Keep app_kv as full-store mirror for backward-compatible hydrate
create table if not exists public.app_kv (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- RLS: deny anon/authenticated direct access; service_role bypasses RLS
do $$
declare
  t text;
begin
  foreach t in array array[
    'vh_organizations','vh_users','vh_staff_roles','vh_qr_codes','vh_visitors','vh_org_json',
    'vh_subscription_plans','vh_org_subscriptions','vh_payments','vh_business_types',
    'vh_contact_messages','vh_help_messages','vh_legal_pages','vh_settings','app_kv'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists deny_all on public.%I', t);
    execute format(
      'create policy deny_all on public.%I for all to anon, authenticated using (false) with check (false)',
      t
    );
  end loop;
end $$;
