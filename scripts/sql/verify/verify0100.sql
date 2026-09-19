-- Paste into the Supabase SQL editor right after 0100. Read-only: it changes
-- nothing (it reads the invoice counter rather than drawing a number) and ends
-- in an error that *is* the report. Every "NOT OK" means stop.
do $$
declare
  v_counter int; v_last text; v_left int; v_trial int; v_members int;
begin
  -- Gym #1's invoice sequence carried over: the counter matches the last number issued.
  select last_seq into v_counter from invoice_counters
   where gym_id = gym_one() and year = extract(year from (now() at time zone 'Asia/Manila'))::int;
  select invoice_number into v_last from payments
   where gym_id = gym_one() and invoice_number like 'INV-' || extract(year from (now() at time zone 'Asia/Manila'))::int || '-%'
   order by invoice_number desc limit 1;
  -- 0098 kept 10 keys; 0100 drops 5. The other 5 go in 0102 and after Part B.
  select count(*) into v_left from pg_constraint where conname like '%\_transition' escape '\';
  -- Every member has a member row in Gym #1 (sign-ups, approvals and renewals read it).
  select count(*) into v_members from gym_roles r
   where r.gym_id = gym_one() and r.role = 'member'
     and not exists (select 1 from member_profiles m where m.gym_id = r.gym_id and m.profile_id = r.user_id);
  select count(*) into v_trial from freemium_trials where gym_id is distinct from gym_one();
  raise exception 'REPORT 0100: Gym #1 invoice counter=% last issued=% % | transition keys left=% % | members without a member row=% (0 or the same as before 0097) | trials outside Gym #1=% %',
    coalesce(v_counter, 0), coalesce(v_last, 'none this year'),
    case when v_last is null or v_last like '%-' || lpad(v_counter::text, 4, '0') then 'OK' else 'CHECK' end,
    v_left, case when v_left = 5 then 'OK' else 'NOT OK' end,
    v_members,
    v_trial, case when v_trial = 0 then 'OK' else 'NOT OK' end;
end $$;
