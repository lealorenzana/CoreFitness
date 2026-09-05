-- 0065_media_attachments.sql
--
-- Picture attachments for events, challenges, announcements and resources.
--
-- ## Why a bucket and not a path
--
-- 0061 gave `workout_resources` an `image_url` that holds a **path into each
-- app's `public/resource-previews/`** — a file the developer commits. That works
-- for nine curated links and is useless to the gym: the admin cannot add a
-- picture without someone rebuilding and redeploying the app. The column stays
-- exactly as it is (existing rows keep working), but it can now also hold a
-- storage URL, which the admin can produce from the browser.
--
-- ## Layout: media/<kind>/<random>.<ext>
--
-- Unlike `avatars`, these files are not owned by the uploader — an event
-- picture belongs to the gym, and the next admin must be able to replace it.
-- So the write policies key off the **role**, not the folder, and the folder is
-- only there to keep the bucket browsable.
--
-- Public-read, same reasoning as 0021: these are pictures the member app puts
-- on screen behind a login, and signed URLs would expire mid-render.
--
-- ## Who may write
--
-- Admin and staff. Staff already compose announcements and run the front desk;
-- attaching a picture to one is the same class of action. Deleting is
-- admin-only, matching 0021 — removing a file that other rows may point at is
-- not a reversible front-desk transaction.

-- ── Columns ─────────────────────────────────────────────────────────────────
-- Nullable everywhere. NULL means "no picture", which is the normal case and
-- must never render a stand-in image (see 0061).
alter table events        add column if not exists image_url text;
alter table challenges    add column if not exists image_url text;
alter table notifications add column if not exists image_url text;

comment on column events.image_url is
  'Optional picture shown with the event in the member app. NULL is normal.';
comment on column challenges.image_url is
  'Optional picture shown with the challenge in the member app. NULL is normal.';
comment on column notifications.image_url is
  'Optional picture shown with the announcement. Copied to every recipient row '
  'by broadcastNotification, because a notification row IS one recipient.';

-- ── Bucket ──────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'media',
  'media',
  true,
  3145728,                                            -- 3 MB, enforced server-side
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ── Policies on storage.objects ─────────────────────────────────────────────
-- Dropped first so this migration is safe to re-run.
drop policy if exists media_read_all      on storage.objects;
drop policy if exists media_insert_staff  on storage.objects;
drop policy if exists media_update_staff  on storage.objects;
drop policy if exists media_delete_admin  on storage.objects;

-- Anyone may read: the bucket is public, so this mirrors what the CDN already
-- allows and keeps direct API reads working for authenticated clients.
create policy media_read_all on storage.objects
  for select
  using (bucket_id = 'media');

-- Schema-qualified `public.get_my_role()`: these policies are evaluated in the
-- `storage` schema, where `public` is not guaranteed to be on the search_path.
-- 0021 learned this the hard way.
create policy media_insert_staff on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'media'
    and public.get_my_role() in ('admin', 'staff')
  );

create policy media_update_staff on storage.objects
  for update to authenticated
  using (
    bucket_id = 'media'
    and public.get_my_role() in ('admin', 'staff')
  );

create policy media_delete_admin on storage.objects
  for delete to authenticated
  using (bucket_id = 'media' and public.get_my_role() = 'admin');

-- ── Verification ────────────────────────────────────────────────────────────
-- select id, public, file_size_limit from storage.buckets where id = 'media';
-- select policyname from pg_policies
--  where schemaname = 'storage' and tablename = 'objects'
--    and policyname like 'media%';
-- select table_name, column_name from information_schema.columns
--  where column_name = 'image_url'
--    and table_name in ('events','challenges','notifications','workout_resources');
-- Expect: one bucket row (public = true, 3145728), four policies, four columns.
