alter table if exists public.visitors
  add column if not exists selfie_file text;
