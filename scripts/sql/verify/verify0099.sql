-- Paste into the Supabase SQL editor right after 0099. Read-only: it changes
-- nothing and ends in an error that *is* the report. Every "NOT OK" means stop
-- and do not paste 0100.
do $$
declare
  v_rls_off text; v_missing text; v_views text; v_lock text;
begin
  -- RLS on for every table.
  select string_agg(c.relname, ', ') into v_rls_off from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and not c.relrowsecurity;
  -- The four same-gym policies on every gym table.
  select string_agg(t, ', ') into v_missing from unnest(tenancy_gym_tables()) t
   where (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = t
            and p.policyname in ('tenant_select', 'tenant_insert', 'tenant_update', 'tenant_delete')
            and p.permissive = 'RESTRICTIVE') <> 4;
  -- Views that run as their owner must filter to the current gym themselves.
  select string_agg(c.relname, ', ') into v_views from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind = 'v'
     and not coalesce('security_invoker=true' = any(c.reloptions), false)
     and pg_get_viewdef(c.oid) not like '%current_gym_id()%';
  v_lock := coalesce(gym_lock_reason(gym_one()), 'none');
  raise exception 'REPORT 0099: tables with RLS off: % % | gym tables missing a same-gym policy: % % | owner views without a gym filter: % % | Gym #1 lock: % %',
    coalesce(v_rls_off, 'none'), case when v_rls_off is null then 'OK' else 'NOT OK' end,
    coalesce(v_missing, 'none'), case when v_missing is null then 'OK' else 'NOT OK' end,
    coalesce(v_views, 'none'),   case when v_views is null then 'OK' else 'NOT OK' end,
    v_lock,                      case when v_lock = 'none' then 'OK' else 'NOT OK' end;
end $$;
