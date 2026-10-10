-- VERIFICATION for 0173 (programs that build week on week)
-- Paste into the Supabase SQL editor right after 0173. Read-only; the error is the report.
-- every value should be true.
do $$
declare c1 boolean; c2 boolean; c3 boolean; c4 boolean; c5 boolean;
begin
  select exists (select 1 from information_schema.columns where table_name = 'gym_workout_items' and column_name = 'progress_step') into c1;
  select exists (select 1 from information_schema.columns where table_name = 'gym_programs' and column_name = 'member_id') into c2;
  c3 := has_function_privilege('authenticated', 'program_day_targets(uuid)', 'execute');
  c4 := (program_effective_week(3, 3) = 0 and program_effective_week(4, 3) = 3);
  select coalesce((select migration_0173_applied()), false) into c5;
  raise exception 'REPORT 0173: progression=% | personal_programs=% | targets_fn=% | lighter_week=% | marker=%', c1, c2, c3, c4, c5;
end
$$;
