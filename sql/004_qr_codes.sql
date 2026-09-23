create table if not exists public.qr_codes (
  id uuid primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  label text not null,
  public_code text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists qr_codes_org_created_idx
  on public.qr_codes (organization_id, created_at);

create unique index if not exists qr_codes_org_label_idx
  on public.qr_codes (organization_id, label);
