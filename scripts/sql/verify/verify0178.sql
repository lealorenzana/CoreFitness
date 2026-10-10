-- VERIFICATION for 0178 (room pictures; coach status)
-- Paste into the Supabase SQL editor right after 0178. Read-only; the error is the report.
do $$
declare c1 boolean; c2 boolean; c3 boolean; c4 boolean;
begin
  select exists (select 1 from information_schema.columns where table_name = 'rooms' and column_name = 'photo_url') into c1;
  select exists (select 1 from information_schema.columns where table_name = 'trainer_profiles' and column_name = 'presence') into c2;
  c3 := has_function_privilege('authenticated', 'my_room_photos()', 'execute');
  select coalesce((select migration_0178_applied()), false) into c4;
  raise exception 'REPORT 0178: room_photos=% | presence=% | photos_fn=% | marker=%', c1, c2, c3, c4;
end
$$;
