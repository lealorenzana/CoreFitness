-- VERIFICATION for 0169 (leave and delete rooms)
-- Paste into the Supabase SQL editor right after 0169. Read-only; the error is the report.
-- every value should be true.
do $$
declare c1 boolean; c2 boolean; c3 boolean; c4 boolean; c5 boolean;
begin
  select exists (select 1 from information_schema.tables where table_name = 'room_leaves') into c1;
  select exists (select 1 from information_schema.columns where table_name = 'rooms' and column_name = 'closed_by_trainer') into c2;
  c3 := has_function_privilege('authenticated', 'delete_room(uuid)', 'execute');
  c4 := has_function_privilege('authenticated', 'leave_room(uuid)', 'execute');
  select coalesce((select migration_0169_applied()), false) into c5;
  raise exception 'REPORT 0169: room_leaves=% | closed_by_trainer=% | delete_room=% | leave_room=% | marker=%', c1, c2, c3, c4, c5;
end
$$;
