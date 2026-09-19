-- Paste into the Supabase SQL editor right after 0101. Read-only: it changes
-- nothing and ends in an error that *is* the report. Every "NOT OK" means stop.
do $$
declare
  v_coaches int; v_listed int; v_orphans text; v_old int;
begin
  -- Every coach with a coach profile in Gym #1 is an active coach there, or they
  -- would drop off the coach list (public_trainers now reads gym_roles).
  select count(*) into v_coaches from trainer_profiles t
    join profiles p on p.id = t.profile_id
   where t.gym_id = gym_one() and p.role = 'trainer' and p.status = 'active';
  select count(*) into v_listed from trainer_profiles t
    join gym_roles r on r.user_id = t.profile_id and r.gym_id = t.gym_id
   where t.gym_id = gym_one() and r.role = 'trainer' and r.status = 'active';
  select string_agg(trim(p.first_name || ' ' || p.last_name), ', ') into v_orphans
    from trainer_profiles t join profiles p on p.id = t.profile_id
   where t.gym_id = gym_one() and p.role = 'trainer' and p.status = 'active'
     and not exists (select 1 from gym_roles r where r.user_id = t.profile_id and r.gym_id = t.gym_id
                       and r.role = 'trainer' and r.status = 'active');
  -- The old argument lists are gone (a leftover would be called instead).
  select count(*) into v_old from pg_proc
   where proname in ('sweep_stale_requests', 'generate_class_instances')
     and pronamespace = 'public'::regnamespace
     and pronargs < 2 and not (proname = 'sweep_stale_requests' and pronargs = 1);
  raise exception 'REPORT 0101: active coaches=% listed as coaches of Gym #1=% % % | old signatures left=% %',
    v_coaches, v_listed, case when v_coaches = v_listed then 'OK' else 'NOT OK' end,
    coalesce('(missing: ' || v_orphans || ')', ''),
    v_old, case when v_old = 0 then 'OK' else 'NOT OK' end;
end $$;
