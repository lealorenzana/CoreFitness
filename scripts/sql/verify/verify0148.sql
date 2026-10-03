-- VERIFICATION for 0148_gym_onboarding_payments.sql
-- Paste into the Supabase SQL editor right after 0148. Read-only: it changes
-- nothing and ends in an error that *is* the report.
do $$
declare v_tables int; v_rls int; v_policies int; v_fns int; v_anon int; v_anon_bad int; v_unique int; v_marker boolean;
begin
  select count(*) into v_tables from pg_tables
   where schemaname = 'public' and tablename in ('application_messages', 'platform_payment_methods', 'gym_payment_claims');
  select count(*) into v_rls from pg_tables
   where schemaname = 'public' and tablename in ('application_messages', 'platform_payment_methods', 'gym_payment_claims') and rowsecurity;
  select count(*) into v_policies from pg_policies
   where schemaname = 'public' and tablename in ('application_messages', 'platform_payment_methods', 'gym_payment_claims');
  select count(*) into v_fns from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('submit_gym_application', 'application_status', 'application_reply',
     'platform_applications', 'platform_application_thread', 'platform_application_reply', 'platform_payment_options',
     'save_payment_method', 'remove_payment_method', 'submit_gym_payment', 'my_gym_payment_claims', 'platform_payment_claims',
     'verify_gym_payment', 'reject_gym_payment', 'platform_bell');
  -- The website calls these three without signing in.
  select count(*) into v_anon from (values ('submit_gym_application(text,text,text,text,text,int,text,text,text,text,text,text)'),
      ('application_status(text)'), ('application_reply(text,text)'), ('platform_payment_options()')) f(sig)
   where has_function_privilege('anon', f.sig, 'execute');
  -- And never these.
  select count(*) into v_anon_bad from (values ('platform_applications(text)'), ('platform_application_reply(uuid,text)'),
      ('submit_gym_payment(numeric,date,uuid,text,text,int,text)'), ('verify_gym_payment(uuid,date,numeric)'),
      ('platform_payment_claims(text)'), ('save_payment_method(uuid,text,text,text,text,text,text,int,boolean)')) f(sig)
   where has_function_privilege('anon', f.sig, 'execute');
  select count(*) into v_unique from pg_indexes where indexname = 'uq_gym_payment_claims_reference';
  select coalesce((select migration_0148_applied()), false) into v_marker;
  raise exception 'REPORT 0148: tables=% of 3 % | RLS on=% of 3 % | policies=% % | functions=% of 15 % | website can call=% of 4 % | anon on platform functions=% % | one claim per reference=% % | marker=% %',
    v_tables, case when v_tables = 3 then 'OK' else 'NOT OK' end,
    v_rls, case when v_rls = 3 then 'OK' else 'NOT OK - STOP' end,
    v_policies, case when v_policies = 0 then 'OK' else 'NOT OK - STOP' end,
    v_fns, case when v_fns = 15 then 'OK' else 'NOT OK' end,
    v_anon, case when v_anon = 4 then 'OK' else 'NOT OK' end,
    v_anon_bad, case when v_anon_bad = 0 then 'OK' else 'NOT OK - STOP' end,
    v_unique, case when v_unique = 1 then 'OK' else 'NOT OK' end,
    v_marker, case when v_marker then 'OK' else 'NOT OK' end;
end $$;
