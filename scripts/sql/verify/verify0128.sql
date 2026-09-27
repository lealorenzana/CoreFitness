-- VERIFICATION for 0128_coaching_rooms.sql
-- Paste into the Supabase SQL editor right after 0128. Read-only: it changes
-- nothing and ends in an error that *is* the report.
--
-- "write policies on rooms/room_members" must be 0: rooms are made by the sweep
-- and groups are joined only through join_room(), which checks the code and plan.
-- "plans with coaching_rooms" should be at least 1 (paid plans, by default).
do $$
declare v_write int; v_tbls int; v_feat int; v_rooms int;
begin
  select count(*) into v_write from pg_policies
   where schemaname = 'public' and tablename in ('rooms', 'room_members')
     and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL') and permissive = 'PERMISSIVE';
  select count(*) into v_tbls from pg_tables where schemaname = 'public'
     and tablename in ('rooms', 'room_members', 'room_posts', 'room_comments');
  select count(*) into v_feat from plan_features where feature_key = 'coaching_rooms';
  select count(*) into v_rooms from rooms;
  raise exception 'REPORT 0128: write policies on rooms/room_members=% % | tables=% of 4 % | plans with coaching_rooms=% % | rooms=% (made when a trainer opens Rooms)',
    v_write, case when v_write = 0 then 'OK' else 'NOT OK - STOP' end,
    v_tbls, case when v_tbls = 4 then 'OK' else 'NOT OK' end,
    v_feat, case when v_feat >= 1 then 'OK' else 'NOT OK' end,
    v_rooms;
end $$;
