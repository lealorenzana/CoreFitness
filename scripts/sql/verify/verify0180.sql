-- VERIFICATION for 0180 (booking approvals per kind)
-- Paste into the Supabase SQL editor right after 0180. Read-only; the error is the report.
do $$
declare c1 boolean; c2 boolean; c3 boolean; c4 int; c5 boolean; v text;
begin
  select exists (select 1 from information_schema.columns where table_name = 'gym_settings' and column_name = 'class_booking_approval') into c1;
  select exists (select 1 from information_schema.columns where table_name = 'bookings' and column_name = 'coach_ok_at') into c2;
  c3 := has_function_privilege('authenticated', 'set_booking_approval(text, text)', 'execute');
  select count(*) into c4 from pg_trigger where tgname in ('a_booking_mode_insert', 'a_booking_mode_decide');
  select coalesce((select migration_0180_applied()), false) into c5;
  select string_agg(distinct class_booking_approval || '/' || pt_booking_approval, ', ') into v from gym_settings;
  raise exception 'REPORT 0180: columns=% | coach_ok=% | setter=% | triggers=% (want 4) | marker=% | modes now: %', c1, c2, c3, c4, c5, v;
end
$$;
