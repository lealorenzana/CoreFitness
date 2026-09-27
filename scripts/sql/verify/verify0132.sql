-- VERIFICATION for 0132_progress_photos.sql
-- Paste into the Supabase SQL editor right after 0132. Read-only: it changes
-- nothing and ends in an error that *is* the report.
--
-- "progress bucket public" MUST be false — the photos are private.
-- "storage policies granting the owner/desk progress files" MUST be 0.
-- "members sharing photos" should be 0 after pasting: sharing ships off.
do $$
declare v_public boolean; v_staff int; v_share int; v_pol int;
begin
  select public into v_public from storage.buckets where id = 'progress';
  select count(*) into v_pol from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'progress_%';
  select count(*) into v_staff from pg_policies
   where schemaname = 'storage' and tablename = 'objects' and policyname like 'progress_%'
     and (coalesce(qual, '') ~ '''(admin|staff)''' or coalesce(with_check, '') ~ '''(admin|staff)''');
  select count(*) into v_share from member_share_prefs where share_photos;
  raise exception 'REPORT 0132: progress bucket public=% % | progress storage policies=% of 3 % | granting the owner/desk=% % | members sharing photos=%',
    v_public, case when v_public = false then 'OK' else 'NOT OK - STOP' end,
    v_pol, case when v_pol = 3 then 'OK' else 'NOT OK' end,
    v_staff, case when v_staff = 0 then 'OK' else 'NOT OK - STOP' end,
    v_share;
end $$;
