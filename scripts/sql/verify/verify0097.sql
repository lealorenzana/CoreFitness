-- Paste into the Supabase SQL editor right after 0097. Read-only: it changes
-- nothing and ends in an error that *is* the report. Every "NOT OK" means stop
-- and do not paste 0098.
do $$
declare
  v_gyms int; v_gym1 text; v_missing int; v_mismatch int; v_outside int;
begin
  select count(*) into v_gyms from gyms;
  select name into v_gym1 from gyms where id = gym_one();
  -- Everyone has their current role in Gym #1 ...
  select count(*) into v_missing from profiles p
   where not exists (select 1 from gym_roles r where r.user_id = p.id and r.gym_id = gym_one());
  select count(*) into v_mismatch from profiles p join gym_roles r on r.user_id = p.id and r.gym_id = gym_one()
   where r.role is distinct from p.role;
  -- ... and is signed in to it.
  select count(*) into v_outside from profiles where active_gym_id is distinct from gym_one();
  raise exception 'REPORT 0097: gyms=% (Gym #1 = "%") | accounts without a Gym #1 role=% % | role differs=% % | not in Gym #1=% %',
    v_gyms, v_gym1,
    v_missing,  case when v_missing  = 0 then 'OK' else 'NOT OK' end,
    v_mismatch, case when v_mismatch = 0 then 'OK' else 'NOT OK' end,
    v_outside,  case when v_outside  = 0 then 'OK' else 'NOT OK' end;
end $$;
