-- Paste into the Supabase SQL editor right after 0115. Read-only: it changes
-- nothing and ends in an error that *is* the report.
--
-- Two lines decide it: **"definer views with no barrier"** must be 0, and
-- **"definer views readable by anon"** must say none.
--
-- What this does NOT do is silence the Security Advisor. The advisor tests for
-- `security_invoker`, and these seven views must not have it — each is an
-- aggregate or projection over rows the caller is deliberately not allowed to
-- read one by one (a member may know a class has 18 of 20 places taken without
-- reading the eighteen bookings). Flipping them was measured, not argued:
-- class_availability keeps all 72 of its rows and counts zero bookings.
--
-- So the advisor's finding stays, and this is the answer to it. The last line
-- prints each view's own gym filter, which is the part that actually makes
-- them safe — if any view listed there says "NO GYM FILTER", that one is a
-- real cross-gym leak and is the thing to fix.
do $$
declare
  v_bare int; v_barrier int; v_invoker int; v_marker int;
  v_names text; v_filters text; v_anon text;
begin
  select count(*) into v_bare from views_without_protection();

  select count(*) into v_barrier from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'v'
     and coalesce((select option_value = 'true' from pg_options_to_table(c.reloptions)
                    where option_name = 'security_barrier'), false);

  select count(*) into v_invoker from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'v'
     and coalesce((select option_value = 'true' from pg_options_to_table(c.reloptions)
                    where option_name = 'security_invoker'), false);

  select count(*) into v_marker from pg_proc
   where pronamespace = 'public'::regnamespace and proname = 'views_without_protection';

  select string_agg(view_name, ', ' order by view_name) into v_names
    from views_without_protection();

  -- The thing that actually keeps a definer view inside one gym. Read from the
  -- view's own definition, so this reports what is deployed rather than what a
  -- migration file says.
  select string_agg(
           c.relname || '=' || case when pg_get_viewdef(c.oid) like '%current_gym_id()%'
                                    then 'gym filtered' else 'NO GYM FILTER' end,
           ' | ' order by c.relname)
    into v_filters
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'v'
     and not coalesce((select option_value = 'true' from pg_options_to_table(c.reloptions)
                        where option_name = 'security_invoker'), false);

  -- A definer view readable by a signed-out stranger is the serious version of
  -- this finding, and all seven were until 0115 revoked it: every `grant select`
  -- said `to authenticated`, and Supabase's project defaults had already granted
  -- anon. Expected after 0115: none.
  select coalesce(string_agg(table_name, ', ' order by table_name), 'none') into v_anon
    from information_schema.role_table_grants g
   where g.table_schema = 'public' and g.grantee = 'anon' and g.privilege_type = 'SELECT'
     and exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                  where n.nspname = 'public' and c.relkind = 'v' and c.relname = g.table_name
                    and not coalesce((select option_value = 'true'
                                        from pg_options_to_table(c.reloptions)
                                       where option_name = 'security_invoker'), false));

  raise exception 'REPORT 0115: definer views with no barrier=% % (%) | views with a barrier=% | invoker views=% | rule function=% % | definer views readable by anon=% | gym filters: %',
    v_bare, case when v_bare = 0 then 'OK' else 'NOT OK' end, coalesce(v_names, 'none'),
    v_barrier, v_invoker,
    v_marker, case when v_marker = 1 then 'OK' else 'NOT OK' end,
    case when v_anon = 'none' then v_anon else v_anon || ' -- NOT OK' end,
    coalesce(v_filters, 'none');
end $$;
