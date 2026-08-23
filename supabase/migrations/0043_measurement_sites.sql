-- 0043 — the rest of the tape-measure sites.
--
-- 0020 stored six circumferences: chest, waist, hips, arms, thighs (plus weight,
-- height and body fat). The member app surfaced **four** of them — `hips_cm` has
-- been written as a literal `null` by `addBodyProgress` since the day it was
-- added, so the column exists, is queried, and has never held a value.
--
-- The body map is being redrawn as a real anatomy chart with front and back
-- views, and that raises the obvious problem: a chart with fifteen muscle groups
-- and four readings is mostly grey. So this adds the four remaining sites a tape
-- measure can actually produce.
--
-- ## Why these four and not "biceps", "triceps", "lats", "core"
--
-- Those are muscles, not measurements. **A tape measure produces a
-- circumference**, and a circumference goes all the way around: the reading
-- around your upper arm covers the biceps *and* the triceps, and the one around
-- your chest covers the pectorals *and* the lats. There is no honest way to
-- store a "triceps" number separately from an "arms" number, and inventing the
-- distinction would put two figures on screen that a member has no way to
-- measure apart.
--
-- The map handles this by lighting the front and the back muscle from the *same*
-- reading, and saying so. That is true, and it teaches the member something
-- about what they are measuring rather than flattering the chart.
--
-- ## Ranges
--
-- `not valid`, like every other check in this schema, so the constraint applies
-- to new writes without forcing a scan of existing rows. The bounds are typo
-- catches, not medical opinion — a neck is not 4 cm and not 90 cm, and someone
-- entering their weight into the neck field should be stopped.

alter table body_measurements
  add column if not exists neck_cm      numeric(5,2),
  add column if not exists shoulders_cm numeric(5,2),
  add column if not exists forearm_cm   numeric(5,2),
  add column if not exists calf_cm      numeric(5,2);

comment on column body_measurements.neck_cm is
  'Around the neck, below the Adams apple.';
comment on column body_measurements.shoulders_cm is
  'Around the widest point of the shoulders, arms relaxed. The one site here '
  'that is awkward to measure alone - it is optional like every other.';
comment on column body_measurements.forearm_cm is
  'Widest point of the forearm, arm relaxed.';
comment on column body_measurements.calf_cm is
  'Widest point of the calf, standing.';

alter table body_measurements drop constraint if exists body_measurements_sites_sane;
alter table body_measurements
  add constraint body_measurements_sites_sane check (
        (neck_cm      is null or (neck_cm      between 20 and 80))
    and (shoulders_cm is null or (shoulders_cm between 60 and 200))
    and (forearm_cm   is null or (forearm_cm   between 10 and 80))
    and (calf_cm      is null or (calf_cm      between 15 and 90))
  ) not valid;

-- No policy work. `body_measurements` carries a single
-- `for all using (member_id = auth.uid()) with check (member_id = auth.uid())`
-- policy generated in 0020, written without a column list, so it covers columns
-- added afterwards. Noted so nobody goes looking for a policy that was never
-- needed.
--
-- No backfill either, and deliberately: a measurement nobody took has no value,
-- and NULL is exactly how this table already says "not measured". Filling these
-- with a derived guess is the failure mode the whole Progress hub is built to
-- avoid.
