-- 0120 — A file belongs to a gym, and only that gym may touch it.
--
-- ---- WHAT WAS WRONG ----------------------------------------------------------------------
--
-- The three storage buckets predate tenancy. 0097–0105 moved ~50 tables onto
-- `current_gym_id()` and never looked at `storage.objects`, whose policies
-- still asked one question: "is the caller an admin?" — via `get_my_role()`,
-- which since 0097 means "an admin *of whichever gym they are in*". So the
-- owner of any gym passed every one of them, for every gym's files:
--
--   credentials (private)  credentials_read_admin — one gym's owner could read
--                          every trainer's certificates and IDs, at every gym.
--   media (public)         insert/update for admin or staff, delete for admin,
--                          on any path — one gym's desk could overwrite or
--                          delete another gym's logo, whose URL is printed on
--                          its public /join page.
--   avatars (public)       avatars_delete_admin — one gym's owner could delete
--                          anybody's profile photo.
--
-- Found 2026-09-26 while designing the Content Studio (0121), which puts a lot
-- more files in `media`. The table-side rows were already safe (trainer_credentials
-- is tenant-tagged in 0098); only the files were not. pglite's tenancy harness
-- never covered storage, which is how it survived — storage-tenancy.mjs does now.
--
-- ---- THE RULE ----------------------------------------------------------------------------
--
-- **A file belongs to a gym because its path says so.**
--
--   media        gyms/<gym_id>/<kind>/<uuid>.jpg. Writes need that <gym_id> to
--                be the caller's current gym, an *active* admin/staff role
--                there, and gym_writable() (0113: support sessions and locked
--                gyms write nothing). Legacy paths with no gym folder stay
--                readable — every existing logo keeps working — and become
--                untouchable by any gym: replacing a legacy logo uploads a new
--                file and orphans the old one, which is cheaper than letting
--                the wrong gym delete it. The platform owner may still clean up.
--   credentials  an admin reads a file only when a trainer_credentials row in
--                their current gym points at it. Not "the trainer works here":
--                a trainer at two gyms uploads separately to each, and gym A has
--                no business reading what they sent gym B.
--   avatars      an admin deletes a photo only of somebody in their current gym.
--
-- Everybody's own-folder rights (a person's avatar, a trainer's own documents)
-- are unchanged.

-- ---- helpers --------------------------------------------------------------------------------
-- Definer functions rather than inline subqueries: these policies are evaluated
-- in the `storage` schema, where `name` is also a column of storage.objects and
-- a subquery on a table with its own `name` would silently bind to the wrong one.

-- The caller's role in their current gym, only while it is active. NULL otherwise.
create or replace function storage_role_here() returns text
language sql stable security definer set search_path = public as $$
  select r.role::text from gym_roles r
   where r.user_id = auth.uid() and r.gym_id = current_gym_id() and r.status = 'active';
$$;

-- The gym folder of a media path: 'gyms/<uuid>/...' -> that uuid as text, else NULL.
create or replace function media_path_gym(p_name text) returns text
language sql immutable set search_path = public as $$
  select case when split_part(p_name, '/', 1) = 'gyms' then nullif(split_part(p_name, '/', 2), '') end;
$$;

-- May the caller write this media path? Their current gym's folder, active
-- admin or staff there, gym writable.
create or replace function may_write_media(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    media_path_gym(p_name) = current_gym_id()::text
    and storage_role_here() in ('admin', 'staff')
    and gym_writable(),
    false);
$$;

create or replace function may_delete_media(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (media_path_gym(p_name) = current_gym_id()::text
      and storage_role_here() = 'admin'
      and gym_writable())
    or is_platform_admin(),
    false);
$$;

-- Is this credential file one that a row in the caller's current gym points at?
create or replace function credential_file_in_my_gym(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from trainer_credentials c
                  where c.file_path = p_name and c.gym_id = current_gym_id());
$$;

-- Does the avatar folder (a user id, as text) belong to somebody in the caller's gym?
create or replace function avatar_owner_in_my_gym(p_folder text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from gym_roles r
                  where r.user_id::text = p_folder and r.gym_id = current_gym_id());
$$;

revoke all on function storage_role_here(), may_write_media(text), may_delete_media(text),
  credential_file_in_my_gym(text), avatar_owner_in_my_gym(text), media_path_gym(text)
  from public, anon;
grant execute on function storage_role_here(), may_write_media(text), may_delete_media(text),
  credential_file_in_my_gym(text), avatar_owner_in_my_gym(text), media_path_gym(text)
  to authenticated;

-- ---- media ----------------------------------------------------------------------------------

drop policy if exists media_insert_staff on storage.objects;
drop policy if exists media_update_staff on storage.objects;
drop policy if exists media_delete_admin on storage.objects;
drop policy if exists media_insert_gym   on storage.objects;
drop policy if exists media_update_gym   on storage.objects;
drop policy if exists media_delete_gym   on storage.objects;

create policy media_insert_gym on storage.objects
  for insert to authenticated
  with check (bucket_id = 'media' and public.may_write_media(name));

create policy media_update_gym on storage.objects
  for update to authenticated
  using (bucket_id = 'media' and public.may_write_media(name))
  with check (bucket_id = 'media' and public.may_write_media(name));

create policy media_delete_gym on storage.objects
  for delete to authenticated
  using (bucket_id = 'media' and public.may_delete_media(name));

-- ---- credentials ----------------------------------------------------------------------------

drop policy if exists credentials_read_admin   on storage.objects;
drop policy if exists credentials_delete_admin on storage.objects;
drop policy if exists credentials_read_gym     on storage.objects;
drop policy if exists credentials_delete_gym   on storage.objects;

create policy credentials_read_gym on storage.objects
  for select to authenticated
  using (bucket_id = 'credentials'
         and public.storage_role_here() = 'admin'
         and public.credential_file_in_my_gym(name));

create policy credentials_delete_gym on storage.objects
  for delete to authenticated
  using (bucket_id = 'credentials'
         and public.storage_role_here() = 'admin'
         and public.credential_file_in_my_gym(name)
         and public.gym_writable());

-- ---- avatars --------------------------------------------------------------------------------

drop policy if exists avatars_delete_admin on storage.objects;
drop policy if exists avatars_delete_gym   on storage.objects;

create policy avatars_delete_gym on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars'
         and public.storage_role_here() = 'admin'
         and public.avatar_owner_in_my_gym((storage.foldername(name))[1])
         and public.gym_writable());

-- The rule, as a query: every storage policy that grants an admin anything
-- must name one of the gym-scoped helpers above. Anything listed here is a
-- policy that trusts a role without asking which gym — the 0120 bug.
create or replace function storage_policies_without_gym() returns table (policy text, bucket_rule text)
language sql stable security definer set search_path = public as $$
  select p.policyname::text, coalesce(p.qual, p.with_check)::text
    from pg_policies p
   where p.schemaname = 'storage' and p.tablename = 'objects'
     and coalesce(p.qual, '') || coalesce(p.with_check, '') ~ 'get_my_role|is_front_desk'
$$;
revoke all on function storage_policies_without_gym() from public, anon;
grant execute on function storage_policies_without_gym() to authenticated;

-- ---- the probe's marker ------------------------------------------------------------------

create or replace function migration_0120_applied() returns boolean
language sql immutable as $marker$ select true $marker$;
revoke all on function migration_0120_applied() from public, anon;
grant execute on function migration_0120_applied() to authenticated;
comment on function migration_0120_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0120.sql
