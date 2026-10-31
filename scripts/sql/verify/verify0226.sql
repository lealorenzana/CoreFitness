-- VERIFICATION for 0226 (the platform suspends an account)
-- Paste into the Supabase SQL editor right after 0226. Read-only; the error is the report.
do $$
declare c boolean; g text; k text;
begin
  select coalesce((select migration_0226_applied()), false) into c;
  select pg_get_functiondef('public.current_gym_id()'::regprocedure) into g;
  select pg_get_constraintdef(oid) into k from pg_constraint where conname = 'email_outbox_kind_check';
  raise exception 'REPORT 0226: platform_suspensions=% | current_gym_id refuses the suspended=% | suspend=% | lift=% | gyms see the mark=% | email kind=% | marker=%',
    to_regclass('public.platform_suspensions') is not null,
    position('is_platform_suspended' in g) > 0,
    to_regprocedure('public.platform_suspend(uuid,text)') is not null,
    to_regprocedure('public.platform_lift_suspension(uuid)') is not null,
    to_regprocedure('public.gym_suspended_people()') is not null,
    position('account_suspended' in k) > 0, c;
end
$$;
