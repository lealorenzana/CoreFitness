-- Paste into the Supabase SQL editor right after 0116. Read-only: it changes
-- nothing and ends in an error that *is* the report.
--
-- One line decides it: **"my_gyms columns"** must be 8. 0116 drops and
-- recreates that function, and the member app calls it at sign-in to decide
-- which gym you are in — if it says 5, the drop ran and the create did not, and
-- the gym picker will fail to load. Paste 0116 again before opening the app.
--
-- The last line is the point of the migration: which of your gyms has a logo a
-- member can now actually see. A gym reading "no logo" is not broken — it
-- renders a monogram in its own colour — but if you uploaded one and it still
-- says "no logo", the upload did not save and that is worth knowing.
do $$
declare
  v_cols int; v_marker int; v_gyms int; v_logos int; v_state text;
begin
  select count(*) into v_cols from pg_proc p, unnest(p.proargmodes) m
   where p.pronamespace = 'public'::regnamespace and p.proname = 'my_gyms' and m = 't';

  select count(*) into v_marker from pg_proc
   where pronamespace = 'public'::regnamespace and proname = 'migration_0116_applied';

  select count(*) into v_gyms from gyms;
  select count(*) into v_logos from gym_settings
   where nullif(btrim(coalesce(logo_url, '')), '') is not null;

  select string_agg(
           g.name || ' = ' || case
             when nullif(btrim(coalesce(s.logo_url, '')), '') is not null then 'logo'
             else 'no logo (monogram "' || upper(left(btrim(g.name), 1)) || '")'
           end, ' | ' order by g.name)
    into v_state
    from gyms g left join gym_settings s on s.gym_id = g.id;

  raise exception 'REPORT 0116: my_gyms columns=% % | marker=% % | gyms=% | gyms with a logo=% | %',
    v_cols, case when v_cols = 8 then 'OK' else 'NOT OK - paste 0116 again' end,
    v_marker, case when v_marker = 1 then 'OK' else 'NOT OK' end,
    v_gyms, v_logos, coalesce(v_state, 'none');
end $$;
