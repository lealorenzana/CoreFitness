-- Paste into the Supabase SQL editor right after 0104. Read-only: it changes
-- nothing and ends in an error that *is* the report. Any "NOT OK" means stop.
do $$
declare
  v_active int; v_ctx int; v_people int; v_legacy int;
begin
  -- Every active account has a current gym the apps can read (my_gym_context
  -- joins exactly these), so nobody is locked out when the apps switch to it.
  select count(*) into v_active from profiles where status = 'active';
  select count(*) into v_ctx from profiles p
    join gym_roles r on r.user_id = p.id and r.gym_id = p.active_gym_id
    join gyms g on g.id = r.gym_id
   where p.status = 'active';
  -- gym_people in Gym #1 carries the same roles the legacy column does today.
  select count(*) into v_people from profiles p
    join gym_roles r on r.user_id = p.id and r.gym_id = gym_one();
  select count(*) into v_legacy from profiles p
    join gym_roles r on r.user_id = p.id and r.gym_id = gym_one()
   where r.role is distinct from p.role or r.status is distinct from p.status;
  raise exception 'REPORT 0104: active accounts=% with a readable current gym=% % | people in Gym #1=% | role or status differing from the legacy columns=% %',
    v_active, v_ctx, case when v_active = v_ctx then 'OK' else 'NOT OK' end,
    v_people,
    v_legacy, case when v_legacy = 0 then 'OK' else 'NOT OK' end;
end $$;
