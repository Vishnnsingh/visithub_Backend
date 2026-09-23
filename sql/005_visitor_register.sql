create table if not exists public.visitor_field_settings (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  fields jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.visitors (
  id uuid primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  qr_code_id uuid not null references public.qr_codes (id) on delete cascade,
  public_code text not null,
  label text not null,
  visit_date date,
  visitor_name text,
  mobile_number text,
  address_company text,
  person_to_meet text,
  department text,
  purpose text,
  vehicle_number text,
  in_time text,
  out_time text,
  signature_file text,
  remarks text,
  aadhaar_front_file text,
  aadhaar_back_file text,
  selfie_file text,
  custom_values jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists visitors_org_created_idx
  on public.visitors (organization_id, created_at desc);

create index if not exists visitors_qr_created_idx
  on public.visitors (public_code, created_at desc);

create index if not exists visitors_org_mobile_idx
  on public.visitors (organization_id, mobile_number);
