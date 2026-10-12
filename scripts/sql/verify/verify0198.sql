-- VERIFICATION for 0198 (a free trial stops on its last day: 7 days, no grace, locked for everyone)
-- Paste into the Supabase SQL editor right after 0198. Read-only; the error is the report.
do $$
declare d int; f boolean; m boolean;
begin
  select trial_days from platform_plans where key = 'trial' into d;
  select exists (select 1 from pg_proc where proname = 'gym_trial_over') into f;
  select coalesce((select migration_0198_applied()), false) into m;
  raise exception 'REPORT 0198: trial days=% (want 7) | gym_trial_over=% | marker=%', d, f, m;
end
$$;
