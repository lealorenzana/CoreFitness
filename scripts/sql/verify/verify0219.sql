-- VERIFICATION for 0219 (fair points, programs that retire, reasons)
-- Paste into the Supabase SQL editor right after 0219. Read-only; the error is the report.
do $$
declare cols int; trg int; fn int; counted int; finished int; open_fn int; note int; c boolean;
begin
  select count(*) from information_schema.columns where table_name = 'workout_logs' and column_name in ('started_at', 'counts') into cols;
  select count(*) from pg_trigger where not tgisinternal and tgname in ('workout_guard', 'workout_sets_recount', 'workout_logs_points_back',
    'personal_records_points_back', 'fitness_goals_points_back') into trg;
  select count(*) from pg_proc where proname in ('workout_qualifies', 'take_points_back', 'delete_or_retire_program', 'record_reason', 'guests_with_visits') into fn;
  select count(*) from workout_logs where counts into counted;
  select count(*) from workout_logs where completed_at is not null into finished;
  -- Helpers no screen calls stay closed.
  select count(*) from pg_proc p where p.proname in ('take_points_back') and has_function_privilege('authenticated', p.oid, 'execute') into open_fn;
  select count(*) from app_releases where title = 'Fair points' into note;
  select coalesce((select migration_0219_applied()), false) into c;
  raise exception 'REPORT 0219: workout columns=% (expect 2) | triggers=% (expect 5) | functions=% (expect 5) | counted workouts=% (expect = finished: %) | closed helpers open=% (expect 0) | note=% (expect 1) | marker=%',
    cols, trg, fn, counted, finished, open_fn, note, c;
end
$$;
