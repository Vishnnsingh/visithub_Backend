alter table if exists public.visitors
  add column if not exists custom_values jsonb not null default '{}'::jsonb;
