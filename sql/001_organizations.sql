create extension if not exists pgcrypto;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  business_type text not null,
  contact_number text not null,
  email text not null,
  website text,
  address_line_1 text not null,
  address_line_2 text,
  city text not null,
  state text not null,
  country text not null default 'India',
  pincode text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  full_name text not null,
  email text not null unique,
  phone text not null,
  role text not null default 'org_admin',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.organizations enable row level security;
alter table public.users enable row level security;

drop policy if exists "organizations_insert" on public.organizations;
create policy "organizations_insert"
  on public.organizations
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists "organizations_select_own" on public.organizations;
create policy "organizations_select_own"
  on public.organizations
  for select
  to authenticated
  using (true);

drop policy if exists "users_insert" on public.users;
create policy "users_insert"
  on public.users
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists "users_select_own" on public.users;
create policy "users_select_own"
  on public.users
  for select
  to authenticated
  using (id = auth.uid());
