-- 0216 — the big moments (wave 1 of the lively member app, 2026-10-27;
-- docs/superpowers/specs/2026-10-27-lively-member-app-design.md).
--
-- Nothing here decides a number. Streaks, the earned level, points and badges
-- are what they were; this records only (1) the gym owner's two switches,
-- (2) the member's own sound setting, and (3) which moments a member has
-- already been shown, so each plays once — on the account, never the phone
-- (CLAUDE.md: per-user state never lives in localStorage).
--
-- Paste after 0215. Then scripts/sql/verify/verify0216.sql.

-- 1. The owner's switches (admin app → Your app). Off: a big moment becomes a
--    small card; no sound for anyone at this gym. gym_settings_update_admin is
--    the writer, as for every other gym setting.
alter table gym_settings
  add column if not exists celebrations       boolean not null default true,
  add column if not exists celebration_sounds boolean not null default true;

-- 2 and 3. The member's own row. member_profiles_update_self already lets a
--    member write their own row (only qr_code is guarded), so no new writer.
alter table member_profiles
  add column if not exists celebration_sounds    boolean not null default true,
  -- The earned level last celebrated (member_progression().level). NULL: never
  -- seen — the first sighting is recorded without a celebration, so a member
  -- who has been Intermediate for months is not congratulated on it today.
  add column if not exists celebrated_level      text,
  -- The day Today's arrival last played, and the day a check-in was last
  -- celebrated (a scan at the kiosk while the app was closed plays on next open).
  add column if not exists arrival_on            date,
  add column if not exists checkin_celebrated_on date,
  -- Challenges whose finish has been celebrated. Members have no UPDATE on
  -- challenge_participants (no policy, by design), so the list lives here.
  add column if not exists celebrated_challenges uuid[] not null default '{}';

-- A target's celebration is marked on the target (fitness_goals_write_self
-- already lets a member update their own; the achieved guard is untouched).
alter table fitness_goals
  add column if not exists celebrated_at timestamptz;

-- What was reached or finished before today is history, not a moment: mark it
-- celebrated so nobody is shown a pile of old wins on their first open.
update fitness_goals set celebrated_at = now()
 where achieved_on is not null and celebrated_at is null;
update member_profiles mp set celebrated_challenges = coalesce((
  select array_agg(cp.challenge_id) from challenge_participants cp
   where cp.member_id = mp.profile_id and cp.completed_on is not null), '{}')
 where mp.celebrated_challenges = '{}';

-- What's new, once per person (0212). The members', the coaches' and the owners'.
insert into app_releases (app, title, items)
select 'member', 'Big moments, and the app offline', array[
  'Checking in, finishing a workout, a new badge, a higher earned level, a target reached and a challenge finished now each get their own moment.',
  'They play a sound and buzz. Settings → Sounds for big moments turns the sound off.',
  'With no signal the app still opens on what you last saw, and what you log waits on your phone until you are back online.'
]
where not exists (select 1 from app_releases where app = 'member' and title = 'Big moments, and the app offline');

insert into app_releases (app, title, items)
select 'trainer', 'Today first, and You', array[
  'The rail opens on Today: requests to decide, your day, and who needs you.',
  'Messages shows one row per person; a 1-on-1 is tagged.',
  'Tap your name at the bottom for your status and every coach screen.'
]
where not exists (select 1 from app_releases where app = 'trainer' and title = 'Today first, and You');

insert into app_releases (app, title, items)
select 'admin', 'Celebrations in the member app', array[
  'Members now get a moment when they check in, finish a workout or reach something.',
  'Your app → Celebrations turns them down to a small card, or turns their sound off, for your whole gym.'
]
where not exists (select 1 from app_releases where app = 'admin' and title = 'Celebrations in the member app');

-- The probe (scripts/probe-migrations.py) asks with the anon key, as for every marker.
create or replace function migration_0216_applied() returns boolean language sql stable as $$ select true $$;
grant execute on function migration_0216_applied() to anon, authenticated;
