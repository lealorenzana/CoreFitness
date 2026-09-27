-- VERIFICATION for 0125_referrals.sql
-- Paste into the Supabase SQL editor right after 0125. Read-only: it changes
-- nothing and ends in an error that *is* the report.
--
-- Two lines decide whether it is safe to keep:
--
--   **"the payment trigger"** must be 1. Without it a referral is recorded and
--   never paid — members would invite friends for nothing.
--
--   **"write policies on referrals"** must be 0. A referral a client can write is
--   points a client can award itself.
--
-- "gyms with both rules" should equal "gyms". "sweeps set the gym" should be 2:
-- 0125 also re-defines 0124's settle_squads/settle_gym_goals so a scheduled
-- (session-less) run pays correctly.
do $$
declare v_pay int; v_signup int; v_write int; v_rules int; v_gyms int; v_sweeps int;
begin
  select count(*) into v_pay from pg_trigger
   where tgrelid = 'public.payments'::regclass and tgname = 'payments_referral' and not tgisinternal;
  select count(*) into v_signup from pg_trigger
   where tgrelid = 'public.gym_roles'::regclass and tgname = 'gym_roles_referral' and not tgisinternal;
  select count(*) into v_write from pg_policies
   where schemaname = 'public' and tablename in ('referrals', 'referral_codes')
     and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL') and permissive = 'PERMISSIVE';
  select count(*) into v_rules from (
    select gym_id from point_rules where key in ('referral', 'referral_welcome')
     group by gym_id having count(*) = 2) r;
  select count(*) into v_gyms from gyms;
  select count(*) into v_sweeps from pg_proc
   where pronamespace = 'public'::regnamespace and proname in ('settle_squads', 'settle_gym_goals')
     and prosrc like '%act_as_gym%';

  raise exception 'REPORT 0125: the payment trigger=% % | the sign-up trigger=% % | write policies on referrals=% % | gyms with both rules=% of % % | sweeps set the gym=% %',
    v_pay, case when v_pay = 1 then 'OK' else 'NOT OK - STOP' end,
    v_signup, case when v_signup = 1 then 'OK' else 'NOT OK' end,
    v_write, case when v_write = 0 then 'OK' else 'NOT OK - STOP' end,
    v_rules, v_gyms, case when v_rules = v_gyms then 'OK' else 'NOT OK' end,
    v_sweeps, case when v_sweeps = 2 then 'OK' else 'NOT OK' end;
end $$;
