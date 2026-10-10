-- VERIFICATION for 0174 (one place per coach; coaches edit routines)
-- Paste into the Supabase SQL editor right after 0174. Read-only; the error is the report.
-- every value should be true.
do $$
declare c1 boolean; c2 boolean; c3 boolean; c4 boolean; c5 boolean;
begin
  select exists (select 1 from information_schema.tables where table_name = 'workout_routine_versions') into c1;
  c2 := has_function_privilege('authenticated', 'coach_save_routine(uuid,uuid,text,text,jsonb)', 'execute');
  c3 := has_function_privilege('authenticated', 'coach_timeline(uuid,timestamptz,integer)', 'execute');
  c4 := not has_function_privilege('authenticated', 'routine_put_exercises(uuid,uuid,jsonb)', 'execute');
  select coalesce((select migration_0174_applied()), false) into c5;
  raise exception 'REPORT 0174: versions=% | coach_save=% | timeline=% | internals_hidden=% | marker=%', c1, c2, c3, c4, c5;
end
$$;
