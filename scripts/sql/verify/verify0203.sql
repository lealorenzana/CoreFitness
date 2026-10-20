-- VERIFICATION for 0203 (who approves means who approves)
-- Paste into the Supabase SQL editor right after 0203. Read-only; the error is the report.
do $$
declare a boolean; b boolean; c boolean; d boolean;
begin
  select position('coach decides these bookings' in pg_get_functiondef('trg_booking_mode_decide()'::regprocedure)) > 0 into a;
  select to_regprocedure('booking_coach_can_decide(uuid, uuid)') is not null into b;
  select not has_function_privilege('authenticated', 'booking_coach_can_decide(uuid, uuid)', 'execute') into c;
  select coalesce((select migration_0203_applied()), false) into d;
  raise exception 'REPORT 0203: the gym held to the choice=% | helper=% | helper closed to the app=% | marker=%', a, b, c, d;
end
$$;
