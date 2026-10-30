-- 0220 — Simplify: personal training only (owner, 2026-10-28; spec docs/superpowers/specs/2026-10-28-simplify-design.md).
--
-- WHAT THIS DELETES, FOR GOOD — it cannot be undone, and no switch brings the data back:
--   • coaching groups: every group room, its posts, classwork, comments and members, and every
--     group coaching term and group price;
--   • class rooms (one per class timetable): their posts, classwork and comments;
--   • 1-on-1 rooms of people who never had a coaching package (single sessions keep their chat,
--     which is a different table and is not touched);
--   • Friends (0217): every friendship, every cheer, friend codes, the two privacy switches,
--     the gym's Friends switch, and the "friends" notifications.
--   Rooms of packages — running or ended — stay. An ended package's room is archived (read-only),
--   never deleted.
--
-- WHAT IS ONLY SWITCHED OFF — every gym, now, and each owner can switch it back on in Your app:
--   Classes, Squads and gym goal, Seasons and boards, and Events (a new switch inside Notifications).
--   A switch hides a part of the app; the rows stay. A missing gym_modules row now means the
--   feature's own default (platform_features.default_on) — on for everything except those four.
--
-- 1. default_on, the Events switch, the module functions
-- 2. Events follow their switch for members and coaches (the desk always sees them)
-- 3. Rooms are only for packages
-- 4. Friends removed
-- 5. What's new, marker

-- ============================================================================
-- 1. SWITCHES WITH A DEFAULT
-- ============================================================================
alter table platform_features add column if not exists default_on boolean not null default true;
comment on column platform_features.default_on is
  'What a gym gets when it has never touched this switch (0220). Off for classes, squads, seasons and events.';

insert into platform_features (key, label, description, sort_order, parent_key) values
  ('events', 'Events', 'One-off events members sign up for: a fun run, a seminar, an open day.', 81, 'push')
on conflict (key) do nothing;

update platform_features set default_on = false where key in ('classes', 'squads', 'seasons', 'events');
update platform_features
   set label = 'Package rooms',
       description = 'A room for each coaching package: chat, classwork and progress between the coach and their trainee.'
 where key = 'rooms';

-- Every gym starts again from the defaults for these four: off, until the owner switches one on.
-- Only the first time: pasting 0220 again must not undo an owner who has switched one back on.
do $$
begin
  if to_regprocedure('migration_0220_applied()') is null then
    delete from gym_modules where feature_key in ('classes', 'squads', 'seasons', 'events');
  end if;
end $$;

-- 0141's definition, with the feature's own default in place of "true".
create or replace function gym_module_on(p_gym uuid, p_feature text)
returns boolean
language sql stable security definer set search_path = public as $$
  select
    gym_plan_allows(coalesce(p_gym, current_gym_id()), p_feature)
    and coalesce(
      (select m.enabled from gym_modules m
        where m.gym_id = coalesce(p_gym, current_gym_id()) and m.feature_key = p_feature),
      (select f.default_on from platform_features f where f.key = p_feature),
      true)
    and coalesce(
      (select gym_module_on(p_gym, f.parent_key) from platform_features f
        where f.key = p_feature and f.parent_key is not null),
      true);
$$;

-- 0141's list, saying "off" for a feature that is off by default and never switched on.
create or replace function my_gym_modules()
returns table (feature_key text, label text, description text,
               state text, enabled boolean, sort_order int, parent_key text)
language sql stable security definer set search_path = public as $$
  select f.key, f.label, f.description,
         case when not gym_plan_allows(current_gym_id(), f.key) then 'not_sold'
              when not coalesce(m.enabled, f.default_on) then 'off'
              when f.parent_key is not null and not gym_module_on(current_gym_id(), f.parent_key) then 'parent_off'
              else 'on' end,
         gym_module_on(current_gym_id(), f.key),
         f.sort_order,
         f.parent_key
    from platform_features f
    left join gym_modules m on m.feature_key = f.key and m.gym_id = current_gym_id()
   where current_gym_id() is not null
   order by coalesce((select p.sort_order from platform_features p where p.key = f.parent_key), f.sort_order),
            f.parent_key nulls first, f.sort_order;
$$;
revoke all on function my_gym_modules() from public, anon;
grant execute on function my_gym_modules() to authenticated;
-- my_gym_app() folds gym_module_on() into `modules`, so it follows without a change.

-- ============================================================================
-- 2. EVENTS FOLLOW THEIR SWITCH
-- ============================================================================
-- Restrictive: on top of 0080's read rule. Off, a member or coach reads no events; the desk
-- still sees them all (to run them, or to switch the feature back on knowing what is there).
drop policy if exists events_follow_switch on events;
create policy events_follow_switch on events as restrictive for select to authenticated
  using (is_front_desk() or gym_module_on(gym_id, 'events'));

-- ============================================================================
-- 3. ROOMS ARE ONLY FOR PACKAGES
-- ============================================================================
-- Posts, classwork, submissions, comments, members and leaves go with their room (on delete cascade).
delete from rooms where kind in ('class', 'group');
delete from rooms r
 where r.kind = 'pt'
   and not exists (select 1 from coachings c
                    where c.gym_id = r.gym_id and c.trainer_id = r.trainer_id
                      and c.member_id = r.member_id and c.kind = 'pt');
-- A package that is not running keeps its room, read-only.
update rooms r set archived_at = now()
 where r.kind = 'pt' and r.archived_at is null
   and not exists (select 1 from coachings c
                    where c.gym_id = r.gym_id and c.trainer_id = r.trainer_id
                      and c.member_id = r.member_id and c.status = 'active');
delete from coachings where kind = 'group';
delete from coaching_prices where kind = 'group';

-- The kind checks were declared inline (generated names): find them by what they say.
do $$
declare c record;
begin
  for c in select conrelid::regclass::text as tbl, conname from pg_constraint
            where contype = 'c'
              and conrelid in ('rooms'::regclass, 'coachings'::regclass, 'coaching_prices'::regclass)
              and pg_get_constraintdef(oid) ~ '''group'''
              and pg_get_constraintdef(oid) ~ '\mkind\M'
              and pg_get_constraintdef(oid) !~ 'join_code' loop
    execute format('alter table %s drop constraint %I', c.tbl, c.conname);
  end loop;
end $$;
alter table rooms           drop constraint if exists rooms_kind_pt;
alter table coachings       drop constraint if exists coachings_kind_pt;
alter table coaching_prices drop constraint if exists coaching_prices_kind_pt;
alter table rooms           add constraint rooms_kind_pt           check (kind = 'pt');
alter table coachings       add constraint coachings_kind_pt       check (kind = 'pt');
alter table coaching_prices add constraint coaching_prices_kind_pt check (kind = 'pt');

-- Members can no longer pick a group.
update gym_settings set coaching_modes = array_remove(coaching_modes, 'pick_group')
 where 'pick_group' = any (coaching_modes);
alter table gym_settings drop constraint if exists gym_settings_coaching_modes_check;
alter table gym_settings add constraint gym_settings_coaching_modes_check
  check (coaching_modes <@ array['classes', 'pick_pt', 'desk_assigns', 'coach_invites']);

drop function if exists create_group_room(text, text);
drop function if exists reset_room_code(uuid);
drop function if exists join_room(text);

-- 0169's rule for the one kind left: the trainee is in their room unless they left it since
-- their last session or package with that coach — a renewed package brings it back, as a new
-- session always did.
create or replace function room_member_ids(p_room uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  select r.member_id from rooms r
   where r.id = p_room and r.kind = 'pt'
     and not exists (
       select 1 from room_leaves l where l.room_id = r.id and l.member_id = r.member_id
          and l.left_at > greatest(
            coalesce((select max(s.created_at) from pt_sessions s
                       where s.gym_id = r.gym_id and s.trainer_id = r.trainer_id and s.member_id = r.member_id),
                     '-infinity'::timestamptz),
            coalesce((select max(c.created_at) from coachings c
                       where c.gym_id = r.gym_id and c.trainer_id = r.trainer_id and c.member_id = r.member_id),
                     '-infinity'::timestamptz)));
$$;

-- A package's room is never deleted (its history is the coaching's); the coach closes it instead.
create or replace function delete_room(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r rooms;
begin
  select * into r from rooms where id = p_room and gym_id = current_gym_id();
  if r.id is null or r.trainer_id is distinct from auth.uid() or not gym_writable() then
    raise exception 'Only this room''s trainer can delete it.' using errcode = '42501';
  end if;
  raise exception 'A package''s room stays with the package — close it instead.';
end;
$$;
revoke all on function delete_room(uuid) from public, anon;
grant execute on function delete_room(uuid) to authenticated;

-- A room for each running package and nothing else. An ended package's room is archived,
-- never deleted; a renewed one opens again (unless its coach closed it, 0169).
create or replace function sync_gym_rooms() returns int
language plpgsql security definer set search_path = public as $$
declare v_gym uuid := current_gym_id(); n int := 0;
begin
  if v_gym is null or storage_role_here() is null then return 0; end if;

  insert into rooms (gym_id, kind, trainer_id, member_id, name)
  select distinct c.gym_id, 'pt', c.trainer_id, c.member_id,
         left(coalesce(nullif(btrim(p.first_name || ' ' || p.last_name), ''), 'Trainee') || ' · 1-on-1', 80)
    from coachings c join profiles p on p.id = c.member_id
   where c.gym_id = v_gym and c.kind = 'pt' and c.status = 'active'
  on conflict (gym_id, trainer_id, member_id) where kind = 'pt' do nothing;
  get diagnostics n = row_count;

  update rooms r set archived_at = now()
   where r.gym_id = v_gym and r.kind = 'pt' and r.archived_at is null
     and not exists (select 1 from coachings c
                      where c.gym_id = r.gym_id and c.trainer_id = r.trainer_id
                        and c.member_id = r.member_id and c.status = 'active');
  update rooms r set archived_at = null
   where r.gym_id = v_gym and r.kind = 'pt' and r.archived_at is not null and not r.closed_by_trainer
     and exists (select 1 from coachings c
                  where c.gym_id = r.gym_id and c.trainer_id = r.trainer_id
                    and c.member_id = r.member_id and c.status = 'active');
  return n;
end;
$$;

-- ============================================================================
-- 4. FRIENDS REMOVED (0217)
-- ============================================================================
drop trigger if exists friend_code on member_profiles;
drop table if exists cheers;
drop table if exists friendships;

-- Every function 0217 made; none existed before it and no later migration calls one.
do $$
declare f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p
            where p.pronamespace = 'public'::regnamespace
              and p.proname = any (array[
                'new_friend_code', 'trg_friend_code', 'friends_live', 'is_active_member', 'are_friends',
                'in_same_squad', 'referral_pair', 'friends_caller', 'send_friend_request',
                'send_friend_request_by_code', 'respond_friend_request', 'remove_friend', 'my_friends',
                'my_friend_requests', 'friend_state', 'find_members', 'people_you_may_know', 'my_friend_code',
                'wins_for', 'friend_wins', 'cheer_win', 'uncheer_win', 'trainee_cheers', 'member_social_counts']) loop
    execute format('drop function %s', f);
  end loop;
end $$;

drop index if exists member_profiles_friend_code;
alter table member_profiles drop column if exists friend_code,
                            drop column if exists findable,
                            drop column if exists share_wins;
alter table gym_settings drop column if exists friends_on;

delete from notifications where type = 'friends';
delete from app_releases where app = 'admin' and title = 'Friends and cheers, if you want them';

-- 0217's list without friendships and cheers.
create or replace function tenancy_gym_tables() returns text[] language sql immutable as $$
  select array['account_status_events','achievement_unlocks','achievements','activity_log',
    'ai_coach_profiles','ai_meal_guides','ai_proposals','ai_usage_days',
    'assistant_conversations','assistant_messages','attendance','body_measurements','bookings',
    'cancellation_reasons','cash_closeouts','challenge_participants','challenges','checkin_picks','class_templates',
    'class_waitlist','classes','coach_checkins','coaching_prices','coaching_standins','coachings','conversations',
    'equipment_exercises','equipment_reports','event_registrations','events','fitness_goals','freemium_trials',
    'goal_templates','guest_visits','guests','gym_equipment','gym_exercise_media','gym_goals','gym_house_rules','gym_invitations','gym_modules','gym_payment_methods','gym_photos','gym_plans',
    'gym_program_days','gym_programs','gym_settings','gym_terms_acceptances','gym_waivers','gym_workout_items','gym_workouts',
    'house_rules_acceptances','invoice_counters','member_profiles','member_share_prefs','membership_events',
    'membership_plans','membership_requests','memberships','messages',
    'notifications','payments','pending_registrations','personal_records','plan_features',
    'point_ledger','point_rules','program_enrolments','progress_photos',
    'pt_sessions','referral_codes','referrals','refund_rules','renewal_requests',
    'reward_redemptions','rewards','room_assignments','room_comments','room_leaves','room_members','room_posts',
    'room_submissions','rooms',
    'saved_resources','season_claims','season_tiers','shop_products','shop_sale_items','shop_sales',
    'squad_members','squad_weeks','squads','staff_permissions','stock_moves','streak_milestones','terms_acceptances',
    'trainer_availability','trainer_credentials','trainer_feedback','trainer_payment_methods','trainer_profiles',
    'trainer_ratings','waiver_acceptances','winback_rules','winback_sends','workout_logs','workout_plans',
    'workout_routine_exercises','workout_routine_versions','workout_routines','workout_sets']::text[]
$$;

-- ============================================================================
-- 5. WHAT'S NEW, MARKER
-- ============================================================================
insert into app_releases (app, title, items)
select 'member', 'A simpler app', array[
  'Train is now Workout and Coach: your workouts in one place, and everything with your coach in one place.',
  'A coaching package has its own room with your coach: chat, classwork and progress together.',
  'Friends and cheers are gone.'
]
where not exists (select 1 from app_releases where app = 'member' and title = 'A simpler app');

insert into app_releases (app, title, items)
select 'trainer', 'Personal training, simpler', array[
  'Personal training is one place: single sessions and monthly packages.',
  'Each package trainee has a room — their photo on your rail. Single-session trainees keep their chat.',
  'Coaching groups and class rooms are gone.'
]
where not exists (select 1 from app_releases where app = 'trainer' and title = 'Personal training, simpler');

insert into app_releases (app, title, items)
select 'admin', 'Personal training only, unless you want more', array[
  'Classes, squads, seasons and events are switched off. Switch any back on in Your app → What you run.',
  'Coaching groups, class rooms and Friends are gone; package rooms stay.'
]
where not exists (select 1 from app_releases where app = 'admin' and title = 'Personal training only, unless you want more');

create or replace function migration_0220_applied() returns boolean language sql stable as $$ select true $$;
grant execute on function migration_0220_applied() to anon, authenticated;
