-- VERIFICATION for 0193 (paying online for a different plan mid-term is the desk's call)
-- Paste into the Supabase SQL editor right after 0193. Read-only; the error is the report.
do $$
declare c1 boolean; c2 boolean; c3 boolean;
begin
  select exists (select 1 from pg_proc where proname = 'paymongo_prepare_member' and prosrc like '%switch plans at the desk%') into c1;
  select exists (select 1 from pg_proc where proname = 'paymongo_settle' and prosrc like '%not applied; the desk decides%') into c2;
  select coalesce((select migration_0193_applied()), false) into c3;
  raise exception 'REPORT 0193: mid-term switch refused online=% | a switch paid anyway is left to the desk=% | marker=%', c1, c2, c3;
end
$$;
