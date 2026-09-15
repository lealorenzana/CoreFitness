-- 0080 — the demo data stays, and members stop seeing it.
--
-- `scripts/demo-data/` seeds 150 members, coaches, classes, events, challenges
-- and rewards so the dashboard has something to show a panel. It has to stay:
-- every admin figure is computed from it, and deleting it empties the demo.
--
-- But it is seeded into the same tables the member app reads, and the
-- member-facing policies are all "any signed-in user may select". So a real
-- member opening Book a Session saw coaches who keep no hours, Events listed a
-- fun run that already happened, and the rewards catalogue offered prizes the
-- desk has never stocked. The gym's own members were browsing the demo.
--
-- ## The rule
--
-- **A demo row is invisible to `member`, and unchanged for everyone else.**
-- Admin and the front desk keep seeing all of it, which is what the dashboard
-- counts. A trainer keeps seeing it too: their screens filter to their own id,
-- so the only demo rows they can reach are ones seeded against a demo coach.
--
-- ## How a demo row is recognised
--
-- By the id the seed gives it: `5eed____-0000-4000-8000-____________`, the same
-- pattern `remove-demo-data.sql` deletes by. `gen_random_uuid()` will not
-- produce it — the first 32 bits would have to land on 0x5eed AND the middle
-- three groups on those exact constants, which is not a coincidence a real row
-- will ever have. When the seed is removed this migration simply stops matching
-- anything; there is nothing to undo.
--
-- Deliberately **not** a column. The seed files are already written and pasted;
-- adding `is_demo boolean` would mean editing all six of them and re-running,
-- and a column would then have to be maintained by hand for ever after. The id
-- is the fact, and it is already there.

create or replace function is_demo_row(p uuid) returns boolean
language sql immutable parallel safe as $fn$
  -- A uuid's first group is EIGHT hex characters: '5eed' plus four more.
  -- The first version of this wrote eight underscores after 5eed, matched
  -- nothing at all, and would have shipped a filter that filtered nothing.
  select p::text like '5eed____-0000-4000-8000-____________'
$fn$;

comment on function is_demo_row(uuid) is
  'True for a row seeded by scripts/demo-data (id 5eed...-0000-4000-8000-...). '
  'Used to hide the demo from members while the desk keeps counting it (0080).';

-- `sees_demo_data()` rather than repeating the role test in five policies: when
-- the gym stops demoing, one function body changes and every screen follows.
--
-- `auth.uid() is null` is TRUE here — the SQL Editor, the replay harness and
-- any server-side job see everything. The alternative hides the demo from the
-- person who pasted it and calls that a policy.
create or replace function sees_demo_data() returns boolean
language sql stable security definer set search_path = public as $fn$
  select auth.uid() is null or get_my_role() is distinct from 'member'
$fn$;

comment on function sees_demo_data() is
  'Everyone except a signed-in member. The demo is the gym''s furniture, not '
  'the membership''s (0080).';

revoke all on function sees_demo_data() from public, anon;
grant execute on function sees_demo_data() to authenticated;

-- ── The three tables a member reads directly ────────────────────────────────
-- Same policies as before, plus the demo test. Nothing else about them changes.

drop policy if exists events_select_authenticated on events;
create policy events_select_authenticated on events for select
  using (auth.uid() is not null and (sees_demo_data() or not is_demo_row(id)));

drop policy if exists challenges_select_authenticated on challenges;
create policy challenges_select_authenticated on challenges
  for select to authenticated
  using (sees_demo_data() or not is_demo_row(id));

drop policy if exists rewards_select_authenticated on rewards;
create policy rewards_select_authenticated on rewards
  for select to authenticated
  using (sees_demo_data() or not is_demo_row(id));

-- ── The two views a member reads ────────────────────────────────────────────
-- A view is the better place when one exists: the admin app reads the base
-- tables, so filtering here cannot change a single figure on the dashboard.

create or replace view public_trainers as
select
  p.id,
  p.first_name,
  p.last_name,
  p.photo_url,
  tp.specialization,
  tp.bio,
  tp.availability,
  tp.years_experience,
  tp.certifications,
  tp.focus_areas,
  tp.achievements
from profiles p
join trainer_profiles tp on tp.profile_id = p.id
where p.role = 'trainer'
  and p.status = 'active'
  -- The seeded coaches. They have no availability, so a member who tapped one
  -- got an empty week and no way to tell that from a coach who is simply full.
  and (sees_demo_data() or not is_demo_row(p.id));

revoke all on public_trainers from anon;
grant select on public_trainers to authenticated;

create or replace view class_availability as
select
  c.id as class_id,
  c.capacity,
  count(b.id) filter (where b.status in ('pending', 'approved'))::int as booked_count
from classes c
left join bookings b on b.class_id = c.id
where sees_demo_data() or not is_demo_row(c.id)
group by c.id, c.capacity;

revoke all on class_availability from anon;
grant select on class_availability to authenticated;

-- `classes` itself is read directly by the member app's timetable, so the view
-- alone would leave the class on screen with no seat count beside it.
drop policy if exists classes_select_authenticated on classes;
create policy classes_select_authenticated on classes for select
  using (auth.uid() is not null and (sees_demo_data() or not is_demo_row(id)));

-- Marker for scripts/probe-migrations.py: everything above is a policy or a
-- view body, and neither leaves a trace the REST probe can see.
create or replace function migration_0080_applied() returns boolean
language sql immutable as $fn$ select true $fn$;

revoke all on function migration_0080_applied() from public, anon;
grant execute on function migration_0080_applied() to authenticated;

comment on function migration_0080_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION
--   As a member:  select count(*) from events where id::text like '5eed%';   -- 0
--   As an admin:  the same query still returns the seeded rows, and every
--                 dashboard figure is unchanged.
--   select is_demo_row('5eed0001-0000-4000-8000-000000000001');  -- true
--   select is_demo_row(gen_random_uuid());                       -- false
