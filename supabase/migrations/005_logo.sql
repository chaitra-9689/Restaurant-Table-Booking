-- Restaurant logo: stored as a URL on site_settings; uploads go to a public storage bucket.

alter table site_settings add column if not exists logo_url text not null default '/img/logo.svg';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-assets', 'site-assets', true, 2097152,
        array['image/png','image/jpeg','image/webp','image/svg+xml','image/gif'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "site-assets staff insert" on storage.objects;
drop policy if exists "site-assets staff update" on storage.objects;
drop policy if exists "site-assets staff delete" on storage.objects;
create policy "site-assets staff insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'site-assets' and public.is_staff());
create policy "site-assets staff update" on storage.objects for update to authenticated
  using (bucket_id = 'site-assets' and public.is_staff());
create policy "site-assets staff delete" on storage.objects for delete to authenticated
  using (bucket_id = 'site-assets' and public.is_staff());
