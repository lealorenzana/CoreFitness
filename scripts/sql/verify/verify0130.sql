-- VERIFICATION for 0130_retention_radar.sql
-- Paste into the Supabase SQL editor right after 0130. Read-only: it changes
-- nothing and ends in an error that *is* the report.
--
-- "gyms with the 3 win-back messages" should equal "gyms", and "switched ON"
-- must be 0 — they ship off; the owner turns each on under People -> At risk.
do $$
declare v_gyms int; v_with int; v_on int;
begin
  select count(*) into v_gyms from gyms;
  select count(*) into v_with from (select gym_id from winback_rules group by gym_id having count(*) = 3) x;
  select count(*) into v_on from winback_rules where is_active;
  raise exception 'REPORT 0130: gyms with the 3 win-back messages=% of % % | switched ON=% %',
    v_with, v_gyms, case when v_with = v_gyms then 'OK' else 'NOT OK' end,
    v_on, case when v_on = 0 then 'OK' else 'CHECK' end;
end $$;
