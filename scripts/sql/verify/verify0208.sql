-- VERIFICATION for 0208 (squad weeks and gym goals pay by the member's plan)
-- Paste into the Supabase SQL editor right after 0208. Read-only; the error is the report.
do $$
declare a boolean; b boolean; c boolean; d boolean; e boolean;
begin
  select pg_get_functiondef('settle_squads()'::regprocedure) like '%member_plan_allows(m.member_id%' into a;
  select pg_get_functiondef('settle_gym_goals()'::regprocedure) like '%member_plan_allows(r.user_id%' into b;
  select pg_get_functiondef('settle_squads()'::regprocedure) not like '% plan_allows(%'
     and pg_get_functiondef('settle_gym_goals()'::regprocedure) not like '% plan_allows(%' into c;
  select not has_function_privilege('authenticated', 'member_plan_allows(uuid, text)', 'execute') into d;
  select coalesce((select migration_0208_applied()), false) into e;
  raise exception 'REPORT 0208: squads ask the plan=% | gym goals ask the plan=% | no caller shortcut left=% | member_plan_allows closed=% | marker=%', a, b, c, d, e;
end
$$;
