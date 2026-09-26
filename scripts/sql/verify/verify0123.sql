-- VERIFICATION for 0123_records_quests_seasons.sql
-- Paste into the Supabase SQL editor right after 0123. Read-only: it changes
-- nothing and ends in an error that *is* the report.
--
-- Two lines decide whether it is safe to keep:
--
--   **"the PR trigger"** must be 1. Without it nothing is ever a record, and the
--   screens will say "no records yet" to everyone forever.
--
--   **"write policies on PRs and claims"** must be 0. A PR or a season claim a
--   client can insert is points a client can award itself.
--
-- "gyms with the PR rule" should equal "gyms". "members on the boards" reads 0
-- after pasting: nobody is shown until they opt in.
do $$
declare v_trg int; v_write int; v_rule int; v_gyms int; v_tbls int; v_boards int;
begin
  select count(*) into v_trg from pg_trigger
   where tgrelid = 'public.workout_sets'::regclass and tgname = 'workout_sets_personal_record' and not tgisinternal;
  select count(*) into v_write from pg_policies
   where schemaname = 'public' and tablename in ('personal_records', 'season_claims')
     and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL') and permissive = 'PERMISSIVE';
  select count(distinct gym_id) into v_rule from point_rules where key = 'personal_record';
  select count(*) into v_gyms from gyms;
  select count(*) into v_tbls from pg_tables where schemaname = 'public'
     and tablename in ('personal_records', 'season_tiers', 'season_claims');
  select count(*) into v_boards from member_profiles where show_on_boards;

  raise exception 'REPORT 0123: the PR trigger=% % | write policies on PRs and claims=% % | tables=% of 3 % | gyms with the PR rule=% of % % | members on the boards=%',
    v_trg, case when v_trg = 1 then 'OK' else 'NOT OK - STOP' end,
    v_write, case when v_write = 0 then 'OK' else 'NOT OK - STOP' end,
    v_tbls, case when v_tbls = 3 then 'OK' else 'NOT OK' end,
    v_rule, v_gyms, case when v_rule = v_gyms then 'OK' else 'NOT OK' end,
    v_boards;
end $$;
