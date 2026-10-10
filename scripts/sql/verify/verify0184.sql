-- VERIFICATION for 0184 (gym equipment, reports, the AI coach reads the list)
-- Paste into the Supabase SQL editor right after 0184. Read-only; the error is the report.
do $$
declare c1 int; c2 boolean; c3 boolean; c4 boolean;
begin
  select count(*) into c1 from information_schema.tables where table_name in ('gym_equipment', 'equipment_exercises', 'equipment_reports');
  select exists (select 1 from platform_features where key = 'equipment') into c2;
  c3 := exists (select 1 from pg_proc where proname = 'ai_coach_gym_info_v1');
  select coalesce((select migration_0184_applied()), false) into c4;
  raise exception 'REPORT 0184: tables=% (want 3) | switch=% | coach reader extended=% | marker=%', c1, c2, c3, c4;
end
$$;
