-- 0084 — the demo is for the presentation, so members and trainers see it too.
--
-- 0080 hid every seeded row (`5eed____-0000-4000-8000-…`) from members, so the
-- phone app showed only the handful of real rows while the admin showed the
-- whole gym. For the panel that reads as the member app lagging the admin one
-- (the gym's decision, 2026-09-18): the demo is now everyone's.
--
-- Three things, all reversible by `scripts/demo-data/remove-demo-data.sql`,
-- which deletes by the same id pattern and cascades the rest:
--
--   1. `sees_demo_data()` returns true for everyone. 0080 routed all five of its
--      policies and both views through this one function precisely so that a
--      change of mind is one function body; nothing else in 0080 changes.
--   2. The twelve demo coaches get bookable hours. 0080 hid them *because* they
--      had none — a coach with an empty week looks the same as a full one.
--      `trainer_availability` cascades from `trainer_profiles`, so removing the
--      demo removes these too.
--   3. The ten demo class templates are un-retired and the generator is run, so
--      the member's Train week and each demo coach's Schedule have sessions in
--      them. Generated classes carry the template's id in `template_id`, which
--      is how the removal script already finds and deletes them.
--
-- Paste once, in the SQL Editor. Safe to re-run: hours are keyed by fixed ids
-- and `generate_class_instances()` skips a (template, time) it already made.

-- ── 1 · Everyone sees the demo ──────────────────────────────────────────────
create or replace function sees_demo_data() returns boolean
language sql stable security definer set search_path = public as $fn$
  -- Was: auth.uid() is null or get_my_role() is distinct from 'member' (0080).
  select true
$fn$;

comment on function sees_demo_data() is
  'True for everyone since 0084: the demo is shown to members and trainers for '
  'the presentation. 0080 made it desk-only; revert this body to hide it again.';

-- ── 2 · Bookable hours for the demo coaches ─────────────────────────────────
-- Three windows a week each, on days spread across Monday–Saturday, mornings for
-- odd-numbered coaches and afternoons for even ones, so the 1-on-1 tab has open
-- times every day. Slots that clash with a class the coach teaches are removed
-- by the app's own slot rule, not here.
insert into trainer_availability (id, trainer_id, day_of_week, start_time, end_time, slot_minutes)
select ('5eed0017-0000-4000-8000-' || lpad((c.n * 10 + w.j)::text, 12, '0'))::uuid,
       tp.profile_id,
       ((c.n + w.j * 2) % 6) + 1,
       case when c.n % 2 = 1 then time '08:00' else time '14:00' end,
       case when c.n % 2 = 1 then time '12:00' else time '18:00' end,
       60
  from generate_series(1, 12) as c(n)
  cross join (values (0), (1), (2)) as w(j)
  join trainer_profiles tp
    on tp.profile_id = ('5eed0009-0000-4000-8000-' || lpad(c.n::text, 12, '0'))::uuid
on conflict (id) do nothing;

-- ── 3 · The demo timetable, live ────────────────────────────────────────────
update class_templates
   set active = true
 where is_demo_row(id)
   and active = false;

select generate_class_instances(4);

-- Marker for scripts/probe-migrations.py.
create or replace function migration_0084_applied() returns boolean
language sql immutable as $fn$ select true $fn$;

revoke all on function migration_0084_applied() from public, anon;
grant execute on function migration_0084_applied() to authenticated;

comment on function migration_0084_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION
--   select count(*) from trainer_availability where id::text like '5eed0017%';  -- 36
--   select count(*) from class_templates where is_demo_row(id) and active;     -- 10
--   select count(*) from classes c join class_templates t on t.id = c.template_id
--    where is_demo_row(t.id) and c.scheduled_at > now();                       -- ~40
--   As a member: select count(*) from public_trainers;                         -- 13 or so
