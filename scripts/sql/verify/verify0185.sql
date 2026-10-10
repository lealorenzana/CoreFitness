-- VERIFICATION for 0185 (day passes and walk-ins at the desk)
-- Paste into the Supabase SQL editor right after 0185. Read-only; the error is the report.
do $$
declare c1 int; c2 boolean; c3 boolean; c4 boolean;
begin
  select count(*) into c1 from information_schema.tables where table_name in ('guests', 'guest_visits');
  c2 := has_function_privilege('authenticated', 'record_guest_visit(uuid, text, text, text, text)', 'execute');
  c3 := exists (select 1 from pg_proc where proname = 'platform_gym_usage' and prosrc like '%guest_visits%');
  select coalesce((select migration_0185_applied()), false) into c4;
  raise exception 'REPORT 0185: tables=% (want 2) | desk records=% | platform count extended=% | marker=%', c1, c2, c3, c4;
end
$$;
