-- 0040 — a real activity list.
--
-- 0018 seeded `gym_settings.activity_options` with five entries:
--
--     Strength · Cardio · Group Class · Personal Training · Other
--
-- That was enough to prove the mechanism and far too thin to use. A member who
-- did Zumba, or boxing, or forty minutes on a bike, has no honest answer on
-- the "What did you do?" step and lands on "Other" — and an attendance table
-- where a third of the rows say "Other" cannot answer the question the gym
-- actually has, which is *which* activities fill the building and when.
--
-- Nothing about the architecture changes. `activity_options` is still the
-- gym's own list, still edited in admin Settings, still the single source for
-- both the front desk's check-in tagging and the member app's workout log.
-- This only replaces a placeholder default with a usable one.
--
-- ## The five originals are kept verbatim
--
-- `attendance.activity` and `workout_logs.activity` are plain text holding
-- whatever was chosen at the time. Renaming "Group Class" to "Group Classes"
-- would orphan every row already recorded against the old string — they would
-- not error, they would simply stop matching the list and quietly become
-- unaggregatable. So the originals keep their exact spelling and the new
-- entries are added around them.
--
-- ## A customised list is never overwritten
--
-- The UPDATE below fires **only** where the column still holds 0018's exact
-- five-item default. If the gym has already curated its own list, that is a
-- deliberate decision by a real person and this migration leaves it alone.
-- Re-running this file is therefore safe and idempotent.
--
-- ## Curation is expected
--
-- This is a broad list, deliberately. A gym with no bikes should delete
-- "Stationary Bike"; one that runs no classes should delete the class block.
-- Removing an option is one click in Settings → Activities, and it does not
-- touch history: rows already tagged with a removed activity keep their value.

-- ── 1. The default, for any gym_settings row created from here on ───────────
alter table gym_settings
  alter column activity_options set default array[
    -- Strength
    'Strength', 'Free Weights', 'Weight Machines', 'Bodyweight',
    -- Cardio
    'Cardio', 'Treadmill', 'Stationary Bike', 'Elliptical', 'Rowing', 'Jump Rope',
    -- Conditioning
    'HIIT', 'Circuit Training', 'Functional Training', 'Core & Abs',
    -- Classes
    'Group Class', 'Zumba', 'Aerobics', 'Yoga', 'Pilates', 'Spinning', 'Dance',
    -- Combat
    'Boxing', 'Muay Thai', 'Martial Arts',
    -- Everything else
    'Stretching & Mobility', 'Sports', 'Personal Training', 'Other'
  ];

-- ── 2. Existing rows, but only the ones still untouched ─────────────────────
update gym_settings
set activity_options = array[
  'Strength', 'Free Weights', 'Weight Machines', 'Bodyweight',
  'Cardio', 'Treadmill', 'Stationary Bike', 'Elliptical', 'Rowing', 'Jump Rope',
  'HIIT', 'Circuit Training', 'Functional Training', 'Core & Abs',
  'Group Class', 'Zumba', 'Aerobics', 'Yoga', 'Pilates', 'Spinning', 'Dance',
  'Boxing', 'Muay Thai', 'Martial Arts',
  'Stretching & Mobility', 'Sports', 'Personal Training', 'Other'
]
where activity_options
  = array['Strength', 'Cardio', 'Group Class', 'Personal Training', 'Other']::text[];

-- ── 3. VERIFY ───────────────────────────────────────────────────────────────
-- Expect: option_count 28, and originals_kept true. If option_count is still 5
-- the row had already been customised and was correctly left alone — check it
-- in Settings rather than re-running this.
--
-- `activities_in_use_missing_from_list` should normally be empty. A non-empty
-- result is not an error: it lists activities real check-ins were tagged with
-- that are no longer offered, which is exactly what happens after someone
-- retires an option. History keeps its value either way.
select
  cardinality(activity_options) as option_count,
  activity_options @> array['Strength', 'Cardio', 'Group Class',
                            'Personal Training', 'Other']::text[] as originals_kept,
  (
    select coalesce(array_agg(distinct a.activity), array[]::text[])
    from attendance a
    where a.activity is not null
      and not (a.activity = any (gym_settings.activity_options))
  ) as activities_in_use_missing_from_list
from gym_settings;
