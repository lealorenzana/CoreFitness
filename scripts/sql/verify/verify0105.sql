-- Paste into the Supabase SQL editor right after 0105 — and only once the
-- member app carrying Part B is deployed. Read-only: it changes nothing and
-- ends in an error that *is* the report. Any "NOT OK" means stop.
do $$
declare
  v_left int; v_per_gym int; v_mirror int;
begin
  select count(*) into v_left from pg_constraint where conname like '%\_transition' escape '\';
  -- The per-gym keys that replace them are all in place.
  select count(*) into v_per_gym from pg_constraint
   where conname in ('member_share_prefs_pkey', 'body_measurements_member_id_measured_on_key', 'trainer_ratings_pkey')
     and pg_get_constraintdef(oid) like '%gym_id%';
  -- The transition mirror stays until the three status paths get a reason dialog.
  select count(*) into v_mirror from pg_trigger where tgname = 'mirror_profile_role' and not tgisinternal;
  raise exception 'REPORT 0105: transition keys left=% % | per-gym keys in place=% of 3 % | role mirror still on=% (expected 1, by design)',
    v_left, case when v_left = 0 then 'OK' else 'NOT OK' end,
    v_per_gym, case when v_per_gym = 3 then 'OK' else 'NOT OK' end,
    v_mirror;
end $$;
