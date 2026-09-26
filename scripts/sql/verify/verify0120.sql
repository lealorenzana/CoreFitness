-- VERIFICATION for 0120_storage_tenancy.sql
-- Paste into the Supabase SQL editor right after 0120. Read-only: it changes
-- nothing and ends in an error that *is* the report.
--
-- Two lines decide whether it is safe to keep:
--
--   **"policies trusting any gym's admin"** must be 0. Anything else is a
--   storage rule that still lets one gym touch another gym's files.
--
--   **"gym-scoped policies"** must be 6: media insert/update/delete,
--   credentials read/delete, avatars delete. Fewer means a policy was dropped
--   and not replaced, and that bucket now refuses its own gym.
--
-- "legacy media files" is information: files uploaded before 0120 (logos,
-- challenge pictures). They keep working and nobody can delete them now.
do $$
declare
  v_loose int; v_scoped int; v_fns int; v_legacy int; v_new int;
begin
  select count(*) into v_loose from storage_policies_without_gym();

  select count(*) into v_scoped from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and policyname in ('media_insert_gym', 'media_update_gym', 'media_delete_gym',
                        'credentials_read_gym', 'credentials_delete_gym', 'avatars_delete_gym');

  select count(*) into v_fns from pg_proc
   where pronamespace = 'public'::regnamespace
     and proname in ('storage_role_here', 'media_path_gym', 'may_write_media', 'may_delete_media',
                     'credential_file_in_my_gym', 'avatar_owner_in_my_gym', 'storage_policies_without_gym');

  select count(*) into v_legacy from storage.objects
   where bucket_id = 'media' and split_part(name, '/', 1) <> 'gyms';
  select count(*) into v_new from storage.objects
   where bucket_id = 'media' and split_part(name, '/', 1) = 'gyms';

  raise exception 'REPORT 0120: policies trusting any gym''s admin=% % | gym-scoped policies=% of 6 % | helper functions=% of 7 % | legacy media files=% | gym-folder media files=%',
    v_loose, case when v_loose = 0 then 'OK' else 'NOT OK - STOP' end,
    v_scoped, case when v_scoped = 6 then 'OK' else 'NOT OK - STOP' end,
    v_fns, case when v_fns = 7 then 'OK' else 'NOT OK' end,
    v_legacy, v_new;
end $$;
