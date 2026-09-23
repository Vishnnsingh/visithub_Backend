alter table if exists public.visitors
  add column if not exists visitor_uid text,
  add column if not exists out_label text,
  add column if not exists out_public_code text,
  add column if not exists out_qr_code_id uuid;
