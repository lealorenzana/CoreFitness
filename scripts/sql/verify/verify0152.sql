-- VERIFICATION for 0152_gym_terms_owners.sql
-- Paste into the Supabase SQL editor right after 0152. Read-only: it changes
-- nothing and ends in an error that *is* the report.
do $$
declare v_col boolean; v_rls boolean; v_writes int; v_owner boolean; v_anon boolean; v_pub_anon boolean; v_keys boolean; v_tenant boolean; v_marker boolean;
begin
  select exists (select 1 from information_schema.columns where table_name = 'platform_billing' and column_name = 'gym_terms_published') into v_col;
  select relrowsecurity into v_rls from pg_class where relname = 'gym_terms_acceptances';
  select count(*) into v_writes from pg_policies where tablename = 'gym_terms_acceptances' and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL') and permissive = 'PERMISSIVE';
  select has_function_privilege('authenticated', 'accept_gym_terms_owner(text)', 'execute') into v_owner;
  select has_function_privilege('anon', 'accept_gym_terms_owner(text)', 'execute') or has_function_privilege('anon', 'platform_publish_gym_terms(text)', 'execute') into v_anon;
  select has_function_privilege('anon', 'platform_public_terms()', 'execute') into v_pub_anon;
  select (platform_public_terms() ? 'gym_terms_published') into v_keys;
  select 'gym_terms_acceptances' = any(tenancy_gym_tables()) into v_tenant;
  select coalesce((select migration_0152_applied()), false) into v_marker;
  raise exception 'REPORT 0152: published column=% % | RLS on=% % | write policies=% % | owners can agree=% % | anon can agree/publish=% % | website reads it=% % | in effect now=% (NULL = drafts) | on tenancy list=% % | marker=% %',
    v_col, case when v_col then 'OK' else 'NOT OK' end,
    v_rls, case when v_rls then 'OK' else 'NOT OK - STOP' end,
    v_writes, case when v_writes = 0 then 'OK' else 'NOT OK - STOP' end,
    v_owner, case when v_owner then 'OK' else 'NOT OK' end,
    v_anon, case when not v_anon then 'OK' else 'NOT OK - STOP' end,
    v_pub_anon and v_keys, case when v_pub_anon and v_keys then 'OK' else 'NOT OK' end,
    (select gym_terms_published from platform_billing where id),
    v_tenant, case when v_tenant then 'OK' else 'NOT OK' end,
    v_marker, case when v_marker then 'OK' else 'NOT OK' end;
end
$$;
