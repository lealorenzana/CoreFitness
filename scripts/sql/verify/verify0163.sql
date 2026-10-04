-- VERIFICATION for 0163 (AI plan caps)
-- Paste into the Supabase SQL editor right after 0163. Read-only; the error is the report. Every value should be true.
do $$
declare c0 boolean; c1 boolean; c2 boolean; c3 boolean;
begin
  select (select count(*) = 2 from information_schema.columns where table_name = 'platform_plans' and column_name in ('ai_daily_cap','ai_monthly_cap')) into c0;
  c1 := exists (select 1 from pg_trigger where tgname = 'gym_settings_ai_within_plan' and not tgisinternal);
  c2 := not has_function_privilege('anon','set_plan_ai_caps(text, int, int)','execute');
  select coalesce((select migration_0163_applied()), false) into c3;
  raise exception 'REPORT 0163: check 1=% | check 2=% | check 3=% | marker=%', c0, c1, c2, c3;
end
$$;
