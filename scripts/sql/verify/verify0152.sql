-- VERIFICATION for 0152_streak_history.sql
-- Paste into the Supabase SQL editor right after 0152. Read-only: it changes
-- nothing and ends in an error that *is* the report.
do $$
declare v_hist boolean; v_inner boolean; v_marker boolean;
begin
  select exists (select 1 from pg_proc where proname = 'streak_card' and prosrc like '%''history''%') into v_hist;
  select has_function_privilege('authenticated', 'streak_card(uuid,uuid)', 'execute')
      or has_function_privilege('anon', 'streak_card(uuid,uuid)', 'execute') into v_inner;
  select coalesce((select migration_0152_applied()), false) into v_marker;
  raise exception 'REPORT 0152: the card carries its history=% % | the inner card callable directly=% % | marker=% %',
    v_hist, case when v_hist then 'OK' else 'NOT OK' end,
    v_inner, case when not v_inner then 'OK' else 'NOT OK - STOP' end,
    v_marker, case when v_marker then 'OK' else 'NOT OK' end;
end $$;
