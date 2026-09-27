-- VERIFICATION for 0134_platform_gym_logos.sql
-- Paste into the Supabase SQL editor right after 0134. Read-only: it changes
-- nothing and ends in an error that *is* the report.
--
-- "platform_gyms returns logo_url and accent" must say 2 of 2. "gyms with a
-- logo" is how many gyms will show their own logo in the platform app.
do $$
declare v_cols int; v_logos int; v_gyms int;
begin
  select count(*) into v_cols from (
    select unnest(proargnames) as a from pg_proc where proname = 'platform_gyms' and pronamespace = 'public'::regnamespace
  ) x where a in ('logo_url', 'accent');
  select count(*) into v_gyms from gyms;
  select count(*) into v_logos from gym_settings where nullif(btrim(logo_url), '') is not null;
  raise exception 'REPORT 0134: platform_gyms returns logo_url and accent=% of 2 % | gyms with a logo=% of %',
    v_cols, case when v_cols = 2 then 'OK' else 'NOT OK' end, v_logos, v_gyms;
end $$;
