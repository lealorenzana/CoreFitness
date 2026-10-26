-- VERIFICATION for 0213 (assistant button placement; reward reminders use the gym's points name)
-- Paste into the Supabase SQL editor right after 0213. Read-only; the error is the report.
do $$
declare a boolean; b text; c boolean; d boolean;
begin
  select exists (select 1 from information_schema.columns where table_name = 'member_profiles' and column_name = 'assistant_button') into a;
  select string_agg(assistant_button || '=' || n, ', ') from (select assistant_button, count(*) n from member_profiles group by 1) x into b;
  select position('points_name' in pg_get_functiondef('trg_notify_reward_reachable()'::regprocedure)) > 0 into c;
  select coalesce((select migration_0213_applied()), false) into d;
  raise exception 'REPORT 0213: assistant_button column=% | members by choice: % | reminder uses points_name=% | marker=%', a, coalesce(b, 'none'), c, d;
end
$$;
