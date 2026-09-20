-- Paste into the Supabase SQL editor right after 0110. Read-only: it changes
-- nothing and ends in an error that *is* the report. Any "NOT OK" means stop.
--
-- The two lines that matter most:
--
--   "gyms switched off anything"  must be 0 on paste day. A missing gym_modules
--   row reads as ON, so this migration takes nothing away from anybody. It
--   stops being 0 when an owner unticks something, which is the point.
--
--   "gyms not on the open door"   must be 0 on paste day, for the same reason:
--   every gym keeps taking sign-ups exactly as it did until its owner chooses
--   otherwise.
do $$
declare
  v_cols int; v_modules int; v_off int; v_closed int; v_fns int;
  v_restrictive int; v_writable int; v_gym1 text; v_others int; v_listed int;
begin
  select count(*) into v_cols from information_schema.columns
   where table_schema = 'public' and table_name = 'gym_settings'
     and column_name in ('points_name', 'points_name_short', 'welcome_message',
                         'join_policy', 'join_code');

  select count(*) into v_modules from gym_modules;
  select count(*) into v_off from gym_modules where not enabled;
  select count(*) into v_closed from gym_settings where coalesce(join_policy, 'open') <> 'open';

  select count(*) into v_fns from pg_proc
   where pronamespace = 'public'::regnamespace
     and proname in ('gym_words', 'gym_module_on', 'my_gym_modules', 'set_gym_module',
                     'set_join_policy', 'gym_by_slug', 'gym_by_code', 'my_gym_app',
                     'save_gym_words', 'new_join_code');

  -- gym_modules is one gym's table, so it must carry the same four RESTRICTIVE
  -- policies as the other fifty, and no write policy for anybody.
  select count(*) into v_restrictive from pg_policies
   where schemaname = 'public' and tablename = 'gym_modules'
     and policyname in ('tenant_select', 'tenant_insert', 'tenant_update', 'tenant_delete');
  select count(*) into v_writable from pg_policies
   where schemaname = 'public' and tablename = 'gym_modules'
     and cmd <> 'SELECT' and permissive = 'PERMISSIVE';

  select points_name into v_gym1 from gym_settings where gym_id = gym_one();
  select count(*) into v_others from gym_settings
   where gym_id <> gym_one() and points_name is not null;

  select count(*) into v_listed from list_gyms(null);

  raise exception 'REPORT 0110: gym_settings new columns=% of 5 % | new functions=% of 10 % | gym_modules rows=% (switched off=% — 0 on paste day, by design) | gyms not on the open door=% (0 on paste day) | gyms listed publicly=% | RESTRICTIVE policies on gym_modules=% of 4 % | write policies on it=% % | Gym #1 points are called "%" | other gyms that inherited a points name=% %',
    v_cols, case when v_cols = 5 then 'OK' else 'NOT OK' end,
    v_fns, case when v_fns = 10 then 'OK' else 'NOT OK' end,
    v_modules, v_off,
    v_closed,
    v_listed,
    v_restrictive, case when v_restrictive = 4 then 'OK' else 'NOT OK — STOP' end,
    v_writable, case when v_writable = 0 then 'OK' else 'NOT OK' end,
    coalesce(v_gym1, '(none)'),
    v_others, case when v_others = 0 then 'OK' else 'NOT OK — a gym inherited another gym''s word' end;
end $$;
