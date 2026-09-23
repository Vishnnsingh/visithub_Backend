create extension if not exists pgcrypto;

create table if not exists public.staff_roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code char(8) not null,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_roles_code_format check (code ~ '^[A-Z0-9]{8}$'),
  constraint staff_roles_code_mixed check (code ~ '[A-Z]' and code ~ '[0-9]')
);

create unique index if not exists staff_roles_org_code_uidx
  on public.staff_roles (organization_id, code);

create unique index if not exists staff_roles_org_name_uidx
  on public.staff_roles (organization_id, lower(btrim(name)));

create index if not exists staff_roles_org_created_idx
  on public.staff_roles (organization_id, created_at desc);

create table if not exists public.staff_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  role_id uuid not null references public.staff_roles(id) on delete restrict,
  full_name text not null,
  email text not null,
  phone text not null,
  code char(8) not null,
  password_hash text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_accounts_code_format check (code ~ '^[A-Z0-9]{8}$'),
  constraint staff_accounts_code_mixed check (code ~ '[A-Z]' and code ~ '[0-9]')
);

create unique index if not exists staff_accounts_org_code_uidx
  on public.staff_accounts (organization_id, code);

create unique index if not exists staff_accounts_email_uidx
  on public.staff_accounts (lower(email));

create unique index if not exists staff_accounts_org_phone_uidx
  on public.staff_accounts (organization_id, phone);

create unique index if not exists staff_accounts_org_name_uidx
  on public.staff_accounts (organization_id, lower(btrim(full_name)));

create index if not exists staff_accounts_org_role_idx
  on public.staff_accounts (organization_id, role_id, created_at desc);

create index if not exists staff_accounts_org_created_idx
  on public.staff_accounts (organization_id, created_at desc);

create index if not exists staff_accounts_org_active_idx
  on public.staff_accounts (organization_id, is_active);

create table if not exists public.staff_summaries (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  total_staff integer not null default 0,
  total_roles integer not null default 0,
  total_active integer not null default 0,
  updated_at timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists staff_roles_touch on public.staff_roles;
create trigger staff_roles_touch
  before update on public.staff_roles
  for each row execute function public.touch_updated_at();

drop trigger if exists staff_accounts_touch on public.staff_accounts;
create trigger staff_accounts_touch
  before update on public.staff_accounts
  for each row execute function public.touch_updated_at();
