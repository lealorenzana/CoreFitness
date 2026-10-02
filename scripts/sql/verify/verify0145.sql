-- VERIFICATION for 0145_ai_coach_proposals.sql
-- Paste into the Supabase SQL editor right after 0145. Read-only: it changes
-- nothing and ends in an error that *is* the report.
do $$
declare v_rls boolean; v_write_pol int; v_fns int; v_member_can_check boolean; v_src int; v_tenant boolean;
begin
  select relrowsecurity into v_rls from pg_class where relname = 'ai_proposals' and relnamespace = 'public'::regnamespace;
  select count(*) into v_write_pol from pg_policies
   where tablename = 'ai_proposals' and cmd in ('INSERT','UPDATE','DELETE','ALL') and permissive = 'PERMISSIVE';
  select count(distinct proname) into v_fns from pg_proc where pronamespace = 'public'::regnamespace
   and proname in ('create_ai_proposal','apply_ai_proposal','undo_ai_proposal','discard_ai_proposal',
                   'my_ai_proposals','ai_coach_exercises','ai_coach_routines','ai_coach_schedule','ai_proposal_check');
  select has_function_privilege('authenticated', 'ai_proposal_check(text, jsonb, uuid, uuid)', 'execute')
    into v_member_can_check;
  select count(*) into v_src from pg_constraint
   where conname in ('workout_routines_source_check', 'gym_plans_source_check') and contype = 'c';
  select tenancy_gym_tables() @> array['ai_proposals'] into v_tenant;
  raise exception 'REPORT 0145: RLS on=% % | write policies=% % | functions=% of 9 % | member can call the check=% % | source checks=% of 2 % | tenant table=% %',
    v_rls, case when v_rls then 'OK' else 'NOT OK - STOP' end,
    v_write_pol, case when v_write_pol = 0 then 'OK' else 'NOT OK - STOP' end,
    v_fns, case when v_fns = 9 then 'OK' else 'NOT OK' end,
    v_member_can_check, case when not v_member_can_check then 'OK' else 'NOT OK - STOP' end,
    v_src, case when v_src = 2 then 'OK' else 'NOT OK' end,
    v_tenant, case when v_tenant then 'OK' else 'NOT OK' end;
end $$;
