-- Paste into the Supabase SQL editor right after 0114. Read-only: it changes
-- nothing and ends in an error that *is* the report. Any "NOT OK" means stop.
--
-- The line that matters most is **"my_gym_app columns"**. 0114 drops and
-- recreates that function with two new columns, and both apps read it at
-- launch. If it says 13 rather than 15, the drop ran and the create did not —
-- paste 0114 again before opening either app.
--
-- "gyms sharing a link" must be 0. A slug is an address; two gyms at one
-- address means /join/<slug> sends people to whichever row sorts first.
do $$
declare
  v_col int; v_fns int; v_app int; v_dupes int; v_named int;
  v_slugs text; v_words text; v_taglines int;
begin
  select count(*) into v_col from information_schema.columns
   where table_schema = 'public' and table_name = 'gym_settings' and column_name = 'vocabulary';

  select count(*) into v_fns from pg_proc
   where pronamespace = 'public'::regnamespace
     and proname in ('gym_vocabulary', 'gym_vocabulary_defaults', 'gym_vocabulary_keys_ok',
                     'save_gym_vocabulary', 'set_gym_slug');

  -- The row type, read from the catalogue rather than by calling it: in the SQL
  -- editor there is no member session for current_gym_id() to resolve.
  select count(*) into v_app from pg_proc p, unnest(p.proargmodes) m
   where p.pronamespace = 'public'::regnamespace and p.proname = 'my_gym_app' and m = 't';

  select count(*) into v_dupes from (
    select slug from gyms group by slug having count(*) > 1) d;

  select count(*) into v_named from gym_settings where vocabulary is not null;
  select count(*) into v_taglines from gym_settings where nullif(btrim(coalesce(tagline, '')), '') is not null;

  select string_agg(g.name || ' = /join/' || g.slug, ' | ' order by g.name)
    into v_slugs from gyms g where g.status = 'active';

  select string_agg(g.name || ' calls trainers "' || (gym_vocabulary(g.id) ->> 'trainers') || '"',
                    ' | ' order by g.name)
    into v_words from gyms g;

  raise exception 'REPORT 0114: vocabulary column=% % | new functions=% of 5 % | my_gym_app columns=% % | gyms sharing a link=% % | gyms that renamed something=% | gyms with a tagline=% | addresses: % | words: %',
    v_col, case when v_col = 1 then 'OK' else 'NOT OK' end,
    v_fns, case when v_fns = 5 then 'OK' else 'NOT OK' end,
    v_app, case when v_app = 15 then 'OK' else 'NOT OK — paste 0114 again' end,
    v_dupes, case when v_dupes = 0 then 'OK' else 'NOT OK — STOP' end,
    v_named, v_taglines,
    coalesce(v_slugs, 'none'), coalesce(v_words, 'none');
end $$;
