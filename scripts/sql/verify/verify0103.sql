-- Paste into the Supabase SQL editor right after 0103 — the last tenancy
-- migration. Read-only: it changes nothing and ends in an error that *is* the
-- report. Every "NOT OK" means stop and tell the developer before using the apps.
do $$
declare
  v_notif_out int; v_log_out int; v_keys int; v_old_notify int; v_cross int; v_acting uuid;
begin
  select count(*) into v_notif_out from notifications where gym_id is distinct from gym_one();
  select count(*) into v_log_out from activity_log where gym_id is distinct from gym_one();
  -- Only the three keys the apps still upsert on remain (dropped after Part B).
  select count(*) into v_keys from pg_constraint where conname like '%\_transition' escape '\';
  -- The six-argument notify_once is gone (the new one takes an optional gym).
  select count(*) into v_old_notify from pg_proc
   where proname = 'notify_once' and pronamespace = 'public'::regnamespace and pronargs = 6;
  -- Nobody holds a notification in a gym they are not part of.
  select count(*) into v_cross from notifications n
   where not exists (select 1 from gym_roles r where r.user_id = n.user_id and r.gym_id = n.gym_id);
  v_acting := acting_gym_id();
  raise exception 'REPORT 0103: notifications outside Gym #1=% % | activity outside Gym #1=% % | transition keys=% % | old notify_once=% % | notifications to non-members=% (0, or accounts that had none before) | acting gym with no caller=% %',
    v_notif_out, case when v_notif_out = 0 then 'OK' else 'NOT OK' end,
    v_log_out, case when v_log_out = 0 then 'OK' else 'NOT OK' end,
    v_keys, case when v_keys = 3 then 'OK' else 'NOT OK' end,
    v_old_notify, case when v_old_notify = 0 then 'OK' else 'NOT OK' end,
    v_cross,
    v_acting, case when v_acting = gym_one() then 'OK' else 'NOT OK' end;
end $$;
