create table if not exists public.organisation_presence (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  logo_file text,
  website text,
  working_days text[],
  opening_time char(5),
  closing_time char(5),
  updated_at timestamptz not null default now(),
  constraint presence_opening_format check (opening_time is null or opening_time ~ '^[0-2][0-9]:[0-5][0-9]$'),
  constraint presence_closing_format check (closing_time is null or closing_time ~ '^[0-2][0-9]:[0-5][0-9]$')
);

create index if not exists organisation_presence_updated_idx
  on public.organisation_presence (updated_at desc);
