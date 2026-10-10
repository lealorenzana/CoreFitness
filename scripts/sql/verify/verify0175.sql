-- VERIFICATION for 0175 (squads are called teams)
-- Paste into the Supabase SQL editor right after 0175. Read-only; the error is the report.
-- every value should be true.
do $$
declare c1 boolean; c2 boolean; c3 boolean;
begin
  select label = 'Teams and gym goal' into c1 from platform_features where key = 'squads';
  select bool_and(prosrc !~ 'already in a squad') into c2 from pg_proc where proname in ('create_squad', 'join_squad');
  select coalesce((select migration_0175_applied()), false) into c3;
  raise exception 'REPORT 0175: switch_label=% | refusals_say_team=% | marker=%', c1, c2, c3;
end
$$;
