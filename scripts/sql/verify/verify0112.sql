-- Paste into the Supabase SQL editor right after 0112. Read-only: it changes
-- nothing and ends in an error that *is* the report. Any "NOT OK" means stop.
--
-- "gyms with an action colour" is 0 on paste day and that is correct: NULL
-- means amber, which is what every gym had before this column existed, so
-- pasting changes nobody's app. It stops being 0 when an owner picks one.
--
-- The report ends by printing each gym's two colours. Read that line — it
-- should match what you chose on the owner's setup screen.
do $$
declare
  v_col int; v_fns int; v_accents int; v_actions int; v_pairs text; v_logos int;
begin
  select count(*) into v_col from information_schema.columns
   where table_schema = 'public' and table_name = 'gym_settings'
     and column_name = 'accent_action';

  select count(*) into v_fns from pg_proc
   where pronamespace = 'public'::regnamespace and proname = 'save_gym_look';

  -- The widened list: fourteen, each with a text step proven readable by
  -- `node scripts/accent-contrast.mjs` in CI.
  select count(*) into v_accents from pg_constraint
   where conrelid = 'gym_settings'::regclass and conname = 'gym_settings_accent_check'
     and pg_get_constraintdef(oid) like '%fuchsia%'
     and pg_get_constraintdef(oid) like '%red%';

  select count(*) into v_actions from gym_settings where accent_action is not null;
  select count(*) into v_logos from gym_settings where coalesce(btrim(logo_url), '') <> '';

  select string_agg(g.name || '=' || coalesce(s.accent, 'violet')
                    || '/' || coalesce(s.accent_action, 'amber'), ', ' order by g.name)
    into v_pairs
    from gyms g left join gym_settings s on s.gym_id = g.id;

  raise exception 'REPORT 0112: accent_action column=% % | fourteen colours accepted=% % | save_gym_look=% % | gyms with an action colour=% (0 on paste day, by design) | gyms with a logo=% | each gym reads as name=where-you-are/what-you-can-do: %',
    v_col, case when v_col = 1 then 'OK' else 'NOT OK' end,
    v_accents, case when v_accents = 1 then 'OK' else 'NOT OK' end,
    v_fns, case when v_fns = 1 then 'OK' else 'NOT OK' end,
    v_actions, v_logos,
    coalesce(v_pairs, '(no gyms)');
end $$;
