-- VERIFICATION for 0194 (day passes bought in the app)
-- Paste into the Supabase SQL editor right after 0194. Read-only; the error is the report.
do $$
declare c1 boolean; c2 boolean; c3 boolean; c4 boolean; c5 boolean;
begin
  select relrowsecurity from pg_class where relname = 'day_passes' into c1;
  select exists (select 1 from information_schema.columns where table_name = 'gym_settings' and column_name = 'day_pass_classes') into c2;
  select exists (select 1 from pg_proc where proname = 'enforce_class_booking_entitlement' and prosrc like '%has_day_pass%') into c3;
  select exists (select 1 from pg_proc where proname = 'paymongo_settle' and prosrc like '%day_passes%') into c4;
  select coalesce((select migration_0194_applied()), false) into c5;
  raise exception 'REPORT 0194: day passes RLS=% | owner switch for classes=% | a pass books that day=% | settle records the pass=% | marker=%', c1, c2, c3, c4, c5;
end
$$;
