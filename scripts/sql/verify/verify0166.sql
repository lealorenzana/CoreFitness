-- VERIFICATION for 0166 (meal guides retired)
-- Paste into the Supabase SQL editor right after 0166. Read-only; the error is the report.
-- trigger should be true, pending_meals 0, trainer_can_read false, marker true.
do $$
declare c1 boolean; n int; c2 boolean; c3 boolean;
begin
  select exists (select 1 from pg_trigger where tgname = 'ai_proposals_no_meals' and not tgisinternal) into c1;
  select count(*) into n from ai_proposals where kind = 'meals.set' and status = 'pending';
  c2 := has_function_privilege('authenticated', 'trainee_meal_guide(uuid)', 'execute');
  select coalesce((select migration_0166_applied()), false) into c3;
  raise exception 'REPORT 0166: trigger=% | pending_meals=% | trainer_can_read=% | marker=%', c1, n, c2, c3;
end
$$;
