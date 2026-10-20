-- VERIFICATION for 0207 (equipment reports and room removals say why)
-- Paste into the Supabase SQL editor right after 0207. Read-only; the error is the report.
do $$
declare a boolean; b boolean; c boolean; d boolean;
begin
  select to_regprocedure('dismiss_equipment_report(uuid, text)') is not null into a;
  select to_regprocedure('moderate_room_item(text, uuid, text)') is not null into b;
  select not has_function_privilege('anon', 'moderate_room_item(text, uuid, text)', 'execute')
     and not has_function_privilege('anon', 'dismiss_equipment_report(uuid, text)', 'execute') into c;
  select coalesce((select migration_0207_applied()), false) into d;
  raise exception 'REPORT 0207: dismiss_equipment_report=% | moderate_room_item=% | closed to visitors=% | marker=%', a, b, c, d;
end
$$;
