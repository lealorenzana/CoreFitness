-- VERIFICATION for 0146_ai_coach_meals.sql
-- Paste into the Supabase SQL editor right after 0146. Read-only: it changes
-- nothing and ends in an error that *is* the report.
do $$
declare v_rls boolean; v_write_pol int; v_fns int; v_kind boolean; v_rule boolean; v_trainer_rule boolean;
        v_anon boolean; v_tenant boolean;
begin
  select relrowsecurity into v_rls from pg_class where relname = 'ai_meal_guides' and relnamespace = 'public'::regnamespace;
  select count(*) into v_write_pol from pg_policies
   where tablename = 'ai_meal_guides' and cmd in ('INSERT','UPDATE','DELETE','ALL') and permissive = 'PERMISSIVE';
  select count(distinct proname) into v_fns from pg_proc where pronamespace = 'public'::regnamespace
   and proname in ('meal_text_ok','my_meal_guide','trainee_meal_guide');
  select exists (select 1 from pg_constraint where conname = 'ai_proposals_kind_check'
                  and pg_get_constraintdef(oid) like '%meals.set%') into v_kind;
  -- The rule itself, on three it must refuse and one it must allow.
  select not meal_text_ok('1800 kcal a day') and not meal_text_ok('150g protein')
     and not meal_text_ok('40% carbs') and meal_text_ok('2 eggs and a fist of rice') into v_rule;
  select exists (select 1 from pg_policies where tablename = 'ai_meal_guides' and cmd = 'SELECT'
                  and permissive = 'PERMISSIVE' and qual like '%is_my_trainee%' and qual like '%trainer%') into v_trainer_rule;
  select has_table_privilege('anon', 'public.ai_meal_guides', 'select') into v_anon;
  select tenancy_gym_tables() @> array['ai_meal_guides'] into v_tenant;
  raise exception 'REPORT 0146: RLS on=% % | write policies=% % | functions=% of 3 % | meals.set kind=% % | no-numbers rule=% % | trainer rule=% % | anon can read=% % | tenant table=% %',
    v_rls, case when v_rls then 'OK' else 'NOT OK - STOP' end,
    v_write_pol, case when v_write_pol = 0 then 'OK' else 'NOT OK - STOP' end,
    v_fns, case when v_fns = 3 then 'OK' else 'NOT OK' end,
    v_kind, case when v_kind then 'OK' else 'NOT OK' end,
    v_rule, case when v_rule then 'OK' else 'NOT OK - STOP' end,
    v_trainer_rule, case when v_trainer_rule then 'OK' else 'NOT OK - STOP' end,
    v_anon, case when not v_anon then 'OK' else 'NOT OK - STOP' end,
    v_tenant, case when v_tenant then 'OK' else 'NOT OK' end;
end $$;
