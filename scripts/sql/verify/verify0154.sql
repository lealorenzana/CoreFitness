-- VERIFICATION for 0154_gym_terms_acceptance.sql
-- Paste into the Supabase SQL editor right after 0154. Read-only: it changes
-- nothing and ends in an error that *is* the report.
do $$
declare v_pub boolean; v_cols int; v_checks int; v_anon boolean; v_cols_out int; v_marker boolean;
begin
  select count(*) into v_cols from information_schema.columns
   where table_schema = 'public' and table_name = 'gym_applications'
     and column_name in ('terms_version', 'terms_accepted_at');
  select count(*) into v_checks from pg_constraint
   where conname in ('gym_applications_terms_version_check', 'gym_applications_terms_pair_check');
  -- The website calls it without a session.
  select has_function_privilege('anon', 'accept_gym_terms(text,text)', 'execute') into v_anon;
  -- The platform's list now ends in the two new columns.
  select count(*) into v_cols_out from pg_proc p, unnest(p.proargnames) a
   where p.proname = 'platform_applications' and a in ('terms_version', 'terms_accepted_at');
  select has_function_privilege('anon', 'platform_public_terms()', 'execute') into v_pub;
  select coalesce((select migration_0154_applied()), false) into v_marker;
  raise exception 'REPORT 0154: columns=% of 2 % | checks=% of 2 % | website can agree=% % | platform list shows it=% of 2 % | documents can quote settings=% % | marker=% %',
    v_cols, case when v_cols = 2 then 'OK' else 'NOT OK' end,
    v_checks, case when v_checks = 2 then 'OK' else 'NOT OK' end,
    v_anon, case when v_anon then 'OK' else 'NOT OK' end,
    v_cols_out, case when v_cols_out = 2 then 'OK' else 'NOT OK' end,
    v_pub, case when v_pub then 'OK' else 'NOT OK' end,
    v_marker, case when v_marker then 'OK' else 'NOT OK' end;
end
$$;
