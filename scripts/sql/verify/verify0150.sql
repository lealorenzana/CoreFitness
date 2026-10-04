-- VERIFICATION for 0150_own_exercise_hides_shared.sql
-- Paste into the Supabase SQL editor right after 0150. Read-only: it changes
-- nothing and ends in an error that *is* the report.
do $$
declare v_col boolean; v_trig int; v_members int; v_dupes int; v_marker boolean;
begin
  select exists (select 1 from information_schema.columns
                  where table_name = 'gym_exercise_media' and column_name = 'hidden_by_own') into v_col;
  select count(*) into v_trig from pg_trigger
   where tgname in ('own_exercise_hides_shared', 'overlay_hidden_by_hand') and not tgisinternal;
  -- Nobody but the triggers may call the helpers.
  select count(*) into v_members from (values ('hide_shared_duplicate(uuid)'), ('release_shared_duplicate(uuid,uuid)')) f(sig)
   where has_function_privilege('authenticated', f.sig, 'execute') or has_function_privilege('anon', f.sig, 'execute');
  -- Every gym-owned exercise named like a shared one now hides the shared one for that gym
  -- (skipped only for a gym with no active owner to sign the overlay row).
  select count(*) into v_dupes
    from exercises own
    join exercises lib on lib.gym_id is null and lower(lib.name) = lower(own.name)
   where own.gym_id is not null
     and exists (select 1 from gym_roles r where r.gym_id = own.gym_id and r.role = 'admin' and r.status = 'active')
     and not exists (select 1 from gym_exercise_media m
                      where m.gym_id = own.gym_id and m.exercise_id = lib.id and m.hidden);
  select coalesce((select migration_0150_applied()), false) into v_marker;
  raise exception 'REPORT 0150: column=% % | triggers=% of 2 % | callable by members/anon=% % | duplicates still showing=% % | marker=% %',
    v_col, case when v_col then 'OK' else 'NOT OK' end,
    v_trig, case when v_trig = 2 then 'OK' else 'NOT OK' end,
    v_members, case when v_members = 0 then 'OK' else 'NOT OK - STOP' end,
    v_dupes, case when v_dupes = 0 then 'OK' else 'NOT OK' end,
    v_marker, case when v_marker then 'OK' else 'NOT OK' end;
end $$;
