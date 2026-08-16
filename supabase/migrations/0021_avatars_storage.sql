-- 0021_avatars_storage.sql
--
-- Profile photos for members and trainers.
--
-- `profiles.photo_url` has existed since 0001 and `updateMyProfile` has always
-- accepted it, but nothing ever wrote to it: the member app's Edit Profile
-- screen read the chosen file into component state and then dropped it on save.
-- This adds the storage side so that picker can actually do something.
--
-- Layout: avatars/<auth.uid()>/<random>.<ext>
--   * the uid folder is what the write policies key off, so nobody can
--     overwrite anyone else's photo;
--   * the filename is random so a public URL cannot be derived from a user id.
--
-- The bucket is public-read. These are gym member avatars displayed behind a
-- login, and signed URLs would expire mid-render for no real gain. If this ever
-- needs tightening, flip `public` to false and switch the client to
-- createSignedUrl().

-- ── Bucket ──────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  2097152,                                            -- 2 MB, enforced server-side
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ── Policies on storage.objects ─────────────────────────────────────────────
-- Dropped first so this migration is safe to re-run.
drop policy if exists avatars_read_all      on storage.objects;
drop policy if exists avatars_insert_own    on storage.objects;
drop policy if exists avatars_update_own    on storage.objects;
drop policy if exists avatars_delete_own    on storage.objects;
drop policy if exists avatars_delete_admin  on storage.objects;

-- Anyone may read. The bucket is public, so this mirrors what the CDN already
-- allows; it keeps direct API reads working for authenticated clients too.
create policy avatars_read_all on storage.objects
  for select
  using (bucket_id = 'avatars');

-- Write only inside your own uid folder. `storage.foldername(name)` returns the
-- path segments, so [1] is the uid directory.
create policy avatars_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy avatars_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy avatars_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Moderation: an admin can remove anyone's photo. Deliberately admin-only —
-- `staff` can take payments and check people in, but removing someone's photo
-- is not a reversible front-desk transaction.
-- Schema-qualified: this policy is evaluated in the `storage` schema, where
-- `public` is not guaranteed to be on the search_path.
create policy avatars_delete_admin on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and public.get_my_role() = 'admin');

-- ── Let an admin clear someone's photo_url ──────────────────────────────────
-- Deleting the file alone would leave a dangling URL on the profile row, so the
-- admin needs to null the column too. `profiles_update_admin` (0002, redefined
-- in 0006) already lets an admin update any profile row with no column
-- restriction, so no new policy on `profiles` is required — this comment exists
-- so the next person does not go looking for one.

-- ── Verification ────────────────────────────────────────────────────────────
-- select id, public, file_size_limit from storage.buckets where id = 'avatars';
-- select policyname from pg_policies
--  where schemaname = 'storage' and tablename = 'objects'
--    and policyname like 'avatars%';
-- Expect: one bucket row (public = true, 2097152) and five policies.
