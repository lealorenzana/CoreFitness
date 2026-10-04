-- VERIFICATION for 0155_member_terms_versions.sql
-- Paste into the Supabase SQL editor right after 0155. Read-only: it changes
-- nothing and ends in an error that *is* the report.
do $$
declare v_rls boolean; v_ins int; v_trg boolean; v_fn boolean; v_anon boolean; v_backfill int; v_missing int; v_tenant boolean; v_marker boolean;
begin
  select relrowsecurity into v_rls from pg_class where relname = 'terms_acceptances';
  -- No insert/update/delete policy for anybody: only the trigger and the function write.
  select count(*) into v_ins from pg_policies where tablename = 'terms_acceptances' and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL') and permissive = 'PERMISSIVE';
  select exists (select 1 from pg_trigger where tgname = 'member_terms_from_signup' and not tgisinternal) into v_trg;
  select has_function_privilege('authenticated', 'accept_member_terms(text,text)', 'execute') into v_fn;
  select has_function_privilege('anon', 'accept_member_terms(text,text)', 'execute') into v_anon;
  select count(*) into v_backfill from terms_acceptances where source = 'backfill';
  -- Every member 0079 stamped now has a row for both documents.
  select count(*) into v_missing from member_profiles m
   where m.terms_accepted_at is not null
     and (select count(distinct t.document) from terms_acceptances t where t.gym_id = m.gym_id and t.profile_id = m.profile_id) < 2;
  select 'terms_acceptances' = any(tenancy_gym_tables()) into v_tenant;
  select coalesce((select migration_0155_applied()), false) into v_marker;
  raise exception 'REPORT 0155: RLS on=% % | write policies=% % | sign-up trigger=% % | members can agree=% % | anon can agree=% % | backfilled rows=% (informational) | stamped members missing a record=% % | on tenancy list=% % | marker=% %',
    v_rls, case when v_rls then 'OK' else 'NOT OK - STOP' end,
    v_ins, case when v_ins = 0 then 'OK' else 'NOT OK - STOP' end,
    v_trg, case when v_trg then 'OK' else 'NOT OK' end,
    v_fn, case when v_fn then 'OK' else 'NOT OK' end,
    v_anon, case when not v_anon then 'OK' else 'NOT OK - STOP' end,
    v_backfill,
    v_missing, case when v_missing = 0 then 'OK' else 'NOT OK' end,
    v_tenant, case when v_tenant then 'OK' else 'NOT OK' end,
    v_marker, case when v_marker then 'OK' else 'NOT OK' end;
end
$$;
