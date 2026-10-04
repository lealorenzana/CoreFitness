-- VERIFICATION for 0160_credential_details_expiry.sql
-- Paste into the Supabase SQL editor right after 0160. Read-only: it changes
-- nothing and ends in an error that *is* the report.
do $$
declare v_cols int; v_view int; v_barrier boolean; v_anon boolean; v_sweep boolean; v_marker boolean;
begin
  select count(*) into v_cols from information_schema.columns
   where table_name = 'trainer_credentials' and column_name in ('issuer', 'credential_number', 'issued_on', 'expires_on');
  select count(*) into v_view from information_schema.columns where table_name = 'public_trainer_credentials' and column_name in ('issuer', 'expires_on');
  select coalesce((select 'security_barrier=true' = any(reloptions) from pg_class where relname = 'public_trainer_credentials'), false) into v_barrier;
  select has_table_privilege('anon', 'public_trainer_credentials', 'select') into v_anon;
  select has_function_privilege('authenticated', 'credential_expiry_sweep()', 'execute') into v_sweep;
  select coalesce((select migration_0160_applied()), false) into v_marker;
  raise exception 'REPORT 0160: new columns=% of 4 % | view shows issuer+expiry=% of 2 % | view barriered=% % | anon reads view=% % | sweep callable=% % | marker=% %',
    v_cols, case when v_cols = 4 then 'OK' else 'NOT OK - STOP' end,
    v_view, case when v_view = 2 then 'OK' else 'NOT OK' end,
    v_barrier, case when v_barrier then 'OK' else 'NOT OK - STOP' end,
    v_anon, case when not v_anon then 'OK' else 'NOT OK - STOP' end,
    v_sweep, case when v_sweep then 'OK' else 'NOT OK' end,
    v_marker, case when v_marker then 'OK' else 'NOT OK' end;
end
$$;
