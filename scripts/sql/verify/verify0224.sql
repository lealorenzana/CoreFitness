-- VERIFICATION for 0224 (paying before approval)
-- Paste into the Supabase SQL editor right after 0224. Read-only; the error is the report.
do $$
declare c boolean; g text; s text; k text;
begin
  select coalesce((select migration_0224_applied()), false) into c;
  select pg_get_functiondef('public.create_gym(text,text,uuid)'::regprocedure) into g;
  select pg_get_functiondef('public.paymongo_settle(text,text,integer,text)'::regprocedure) into s;
  select pg_get_constraintdef(oid) into k from pg_constraint where conname = 'paymongo_checkouts_purpose_check';
  raise exception 'REPORT 0224: application_payments=% | approval waits for payment=% | PayMongo settles applications=% | purpose allowed=% | claim=% | confirm=% | marker=%',
    to_regclass('public.application_payments') is not null,
    position('application_plan_due' in g) > 0,
    position('''application''' in s) > 0,
    position('application' in k) > 0,
    to_regprocedure('public.claim_application_payment(uuid,uuid,text)') is not null,
    to_regprocedure('public.confirm_application_payment(uuid,boolean,text)') is not null, c;
end
$$;
