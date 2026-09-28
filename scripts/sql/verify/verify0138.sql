-- VERIFICATION for 0138_platform_billing_capacity.sql
-- Paste into the Supabase SQL editor right after 0138. Read-only: it changes
-- nothing and ends in an error that *is* the report.
--
-- Every existing payment has a receipt number and each is unique; the lock and
-- gym_state() read the platform's grace period instead of a typed 7; the two new
-- tables have RLS on with no policy; the platform-only functions refuse others.
do $$
declare v_pay int; v_numbered int; v_distinct int; v_uniq int; v_grace int; v_reads int;
        v_rls int; v_policies int; v_guarded int;
begin
  select count(*), count(receipt_no), count(distinct receipt_no) into v_pay, v_numbered, v_distinct from gym_payments;
  select count(*) into v_uniq from pg_constraint where conname = 'gym_payments_receipt_no_key' and contype = 'u';
  select grace_days into v_grace from platform_billing where id;
  select count(*) into v_reads from pg_proc where pronamespace = 'public'::regnamespace
     and proname in ('gym_lock_reason', 'gym_state') and prosrc like '%platform_grace_days()%';
  select count(*) into v_rls from pg_class where relnamespace = 'public'::regnamespace and relrowsecurity
     and relname in ('platform_billing', 'platform_receipt_counters');
  select count(*) into v_policies from pg_policies where schemaname = 'public'
     and tablename in ('platform_billing', 'platform_receipt_counters');
  select count(*) into v_guarded from pg_proc where pronamespace = 'public'::regnamespace
     and proname in ('billing_settings', 'set_billing_settings', 'platform_capacity') and prosrc like '%is_platform_admin()%';
  raise exception 'REPORT 0138: payments=% numbered=% unique=% % | unique constraint % | grace=% days | lock reads it=% of 2 % | RLS on=% of 2, policies=% % | platform-only=% of 3 %',
    v_pay, v_numbered, v_distinct, case when v_pay = v_numbered and v_numbered = v_distinct then 'OK' else 'NOT OK - STOP' end,
    case when v_uniq = 1 then 'OK' else 'NOT OK - STOP' end, v_grace,
    v_reads, case when v_reads = 2 then 'OK' else 'NOT OK - STOP' end,
    v_rls, v_policies, case when v_rls = 2 and v_policies = 0 then 'OK' else 'NOT OK - STOP' end,
    v_guarded, case when v_guarded = 3 then 'OK' else 'NOT OK - STOP' end;
end $$;
