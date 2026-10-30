-- VERIFICATION for 0220 (simplify: personal training only)
-- Paste into the Supabase SQL editor right after 0220. Read-only; the error is the report.
do $$
declare offs int; extra_rooms int; groups int; friends int; cols int; fns int; notes int; ended_open int; c boolean;
begin
  select count(*) from platform_features where key in ('classes', 'squads', 'seasons', 'events') and not default_on into offs;
  select count(*) from rooms where kind <> 'pt'
     or not exists (select 1 from coachings k where k.gym_id = rooms.gym_id and k.trainer_id = rooms.trainer_id
                                                and k.member_id = rooms.member_id and k.kind = 'pt') into extra_rooms;
  select count(*) from coachings where kind <> 'pt' into groups;
  select count(*) from pg_class where relname in ('friendships', 'cheers') and relnamespace = 'public'::regnamespace into friends;
  select count(*) from information_schema.columns
   where (table_name = 'member_profiles' and column_name in ('friend_code', 'findable', 'share_wins'))
      or (table_name = 'gym_settings' and column_name = 'friends_on') into cols;
  select count(*) from pg_proc where proname in ('create_group_room', 'join_room', 'reset_room_code', 'friend_wins', 'cheer_win', 'my_friends') into fns;
  select count(*) from app_releases where title in ('A simpler app', 'Personal training, simpler', 'Personal training only, unless you want more') into notes;
  -- Rooms of packages with nothing running are archived (read-only), never deleted.
  select count(*) from rooms r where r.archived_at is null and not exists (select 1 from coachings k
     where k.gym_id = r.gym_id and k.trainer_id = r.trainer_id and k.member_id = r.member_id and k.status = 'active') into ended_open;
  select coalesce((select migration_0220_applied()), false) into c;
  raise exception 'REPORT 0220: off-by-default features=% (expect 4) | rooms that are not a package''s=% (expect 0) | group terms=% (expect 0) | friends tables=% (expect 0) | friends columns=% (expect 0) | removed functions left=% (expect 0) | notes=% (expect 3) | ended packages'' rooms still open=% (expect 0) | marker=%',
    offs, extra_rooms, groups, friends, cols, fns, notes, ended_open, c;
end
$$;
