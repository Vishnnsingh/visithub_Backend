-- Rename Visit Hub tables to users / organizations (run in SQL Editor once)
-- Drops empty legacy tables from 001_organizations.sql first.

drop table if exists public.users cascade;
drop table if exists public.organizations cascade;

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'vh_organizations'
  ) and not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'organizations'
  ) then
    alter table public.vh_organizations rename to organizations;
  end if;

  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'vh_users'
  ) and not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'users'
  ) then
    alter table public.vh_users rename to users;
  end if;
end $$;

-- Ensure RLS still on
alter table if exists public.users enable row level security;
alter table if exists public.organizations enable row level security;

comment on table public.users is 'Visit Hub app users (org admin / staff / super admin)';
comment on table public.organizations is 'Visit Hub organisations';
