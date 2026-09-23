-- Public bucket for logos, selfies, aadhaar, signatures, etc.
-- Run in Supabase SQL Editor AFTER migrating images.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'uploads',
  'uploads',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'application/pdf']
)
on conflict (id) do update set public = true;

-- Public read
drop policy if exists "uploads_public_read" on storage.objects;
create policy "uploads_public_read"
  on storage.objects for select
  to public
  using (bucket_id = 'uploads');

-- Service role / authenticated uploads from API (service_role bypasses RLS;
-- keep insert for authenticated just in case)
drop policy if exists "uploads_service_insert" on storage.objects;
create policy "uploads_service_insert"
  on storage.objects for insert
  to authenticated, service_role
  with check (bucket_id = 'uploads');

drop policy if exists "uploads_service_update" on storage.objects;
create policy "uploads_service_update"
  on storage.objects for update
  to authenticated, service_role
  using (bucket_id = 'uploads');
