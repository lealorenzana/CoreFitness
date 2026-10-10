-- VERIFICATION for 0172 (one Workouts section)
-- Paste into the Supabase SQL editor right after 0172. Read-only; the error is the report.
-- every value should be true.
do $$
declare c1 boolean; c2 boolean; c3 boolean; c4 boolean;
begin
  select exists (select 1 from information_schema.columns where table_name = 'member_profiles' and column_name = 'workouts_intro_seen_at') into c1;
  c2 := has_function_privilege('authenticated', 'mark_workouts_intro_seen()', 'execute');
  select exists (select 1 from information_schema.columns where table_name = 'workout_routines' and column_name = 'edited_by') into c3;
  select coalesce((select migration_0172_applied()), false) into c4;
  raise exception 'REPORT 0172: intro_column=% | mark_fn=% | routine_authorship=% | marker=%', c1, c2, c3, c4;
end
$$;
