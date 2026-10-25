-- VERIFICATION for 0211 (a check-in scanned with no connection is recorded when it comes back)
-- Paste into the Supabase SQL editor right after 0211. Read-only; the error is the report.
do $$
declare a boolean; b boolean; c boolean; d boolean;
begin
  select to_regprocedure('record_offline_checkin(uuid, timestamptz, text, text, text)') is not null into a;
  select not has_function_privilege('anon', 'record_offline_checkin(uuid, timestamptz, text, text, text)', 'execute') into b;
  select prosecdef from pg_proc where oid = to_regprocedure('record_offline_checkin(uuid, timestamptz, text, text, text)') into c;
  select coalesce((select migration_0211_applied()), false) into d;
  raise exception 'REPORT 0211: record_offline_checkin=% | closed to visitors=% | security definer=% | marker=%', a, b, c, d;
end
$$;
