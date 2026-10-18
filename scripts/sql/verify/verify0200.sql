-- VERIFICATION for 0200 (the door: members pick their activity, coaches check in too)
-- Paste into the Supabase SQL editor right after 0200. Read-only; the error is the report.
do $$
declare a boolean; b boolean; c boolean; d boolean; e boolean; f boolean;
begin
  select exists (select 1 from information_schema.columns where table_name = 'gym_settings' and column_name = 'coach_checkin_on')
     and exists (select 1 from information_schema.columns where table_name = 'gym_settings' and column_name = 'member_activity_pick') into a;
  select exists (select 1 from information_schema.columns where table_name = 'attendance' and column_name = 'activity_by')
     and exists (select 1 from information_schema.columns where table_name = 'attendance' and column_name = 'source') into b;
  select to_regclass('public.coach_checkins') is not null and to_regclass('public.checkin_picks') is not null into c;
  select exists (select 1 from pg_trigger where tgname = 'a_attendance_pick') into d;
  select not has_function_privilege('anon', 'record_coach_checkin(uuid, text, text)', 'execute')
     and not has_function_privilege('authenticated', 'trg_attendance_pick()', 'execute') into e;
  select coalesce((select migration_0200_applied()), false) into f;
  raise exception 'REPORT 0200: switches=% | attendance columns=% | tables=% | pick trigger=% | grants closed=% | marker=%', a, b, c, d, e, f;
end
$$;
