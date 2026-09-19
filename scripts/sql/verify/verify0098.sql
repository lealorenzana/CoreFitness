-- Paste into the Supabase SQL editor right after 0098. Read-only: it changes
-- nothing and ends in an error that *is* the report. Every "NOT OK" means stop
-- and do not paste 0099.
do $$
declare
  t text; n int;
  v_outside int := 0; v_where text := '';
  v_narrow int; v_settings int; v_gyms int; v_transition int; v_acting uuid;
begin
  -- Every row of every gym table is Gym #1's (it is the only gym).
  foreach t in array tenancy_gym_tables() loop
    execute format('select count(*) from %I where gym_id is distinct from gym_one()', t) into n;
    if n > 0 then v_outside := v_outside + n; v_where := v_where || ' ' || t || '=' || n; end if;
  end loop;
  -- Every reference between two gym tables names the gym.
  select count(*) into v_narrow from pg_constraint c
   where c.contype = 'f'
     and c.conrelid::regclass::text = any(tenancy_gym_tables())
     and c.confrelid::regclass::text = any(tenancy_gym_tables())
     and pg_get_constraintdef(c.oid) not like 'FOREIGN KEY (gym_id,%';
  select count(*) into v_settings from gym_settings;
  select count(*) into v_gyms from gyms;
  select count(*) into v_transition from pg_constraint where conname like '%\_transition' escape '\';
  -- With one gym, system code with no caller still lands in it.
  v_acting := acting_gym_id();
  raise exception 'REPORT 0098: rows outside Gym #1=% % % | narrow gym references=% % | settings rows=% for % gyms % | transition keys=% (expect 10) | acting gym with no caller=% %',
    v_outside, case when v_outside = 0 then 'OK' else 'NOT OK' end, v_where,
    v_narrow, case when v_narrow = 0 then 'OK' else 'NOT OK' end,
    v_settings, v_gyms, case when v_settings = v_gyms then 'OK' else 'NOT OK' end,
    v_transition,
    v_acting, case when v_acting = gym_one() then 'OK' else 'NOT OK' end;
end $$;
