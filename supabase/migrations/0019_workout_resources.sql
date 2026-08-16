-- 0019 — "Integrate free workout websites" (panel feedback).
--
-- A curated library of free, external training resources, maintained by the gym.
--
-- Deliberately **links out** rather than copying routines into this database.
-- The workouts on these sites belong to the people who wrote them; reproducing
-- them here would be republishing someone else's work, and it would go stale the
-- moment they revised it. Linking sends the member to the source, credits it,
-- and costs the gym nothing to keep accurate.
--
-- This also replaces the member Workouts screen, which listed four invented
-- routines ("HIIT Cardio Blast · 400 kcal") whose calorie figures were typed by
-- hand and whose "Start Workout" button navigated to the progress page without
-- starting anything.

create table if not exists workout_resources (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  -- Who made it. Shown next to the title so the member knows where a link goes
  -- before tapping it — an unattributed external link is a trust problem.
  provider text not null,
  url text not null,
  description text,
  /** Free-form so a gym can group these however it thinks: 'Bodyweight',
      'Mobility', 'Nutrition', 'Beginner programs'. */
  category text,
  level class_level not null default 'all_levels',
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references profiles(id)
);

create index if not exists idx_workout_resources_active
  on workout_resources(is_active, sort_order);

alter table workout_resources enable row level security;

-- Any signed-in user can read the library; only the front desk curates it.
-- Members must not be able to add links — an app that lets one member push a
-- URL to every other member is a phishing vector, not a feature.
drop policy if exists workout_resources_select_authenticated on workout_resources;
create policy workout_resources_select_authenticated on workout_resources for select
  using (auth.uid() is not null);

drop policy if exists workout_resources_write_frontdesk on workout_resources;
create policy workout_resources_write_frontdesk on workout_resources for all
  using (is_front_desk()) with check (is_front_desk());

-- ============ STARTING LIBRARY ============
-- Well-known resources that publish training material free of charge. These are
-- a starting point, not an endorsement: the gym should open each one, confirm
-- it still fits, and edit or remove it from the admin Resources page. External
-- sites change their terms without telling anyone.
insert into workout_resources (title, provider, url, description, category, level, sort_order)
values
  ('Bodyweight workouts',       'Darebee',
   'https://darebee.com/workouts.html',
   'Illustrated workouts you can do with no equipment. No account needed.',
   'Bodyweight', 'all_levels', 10),

  ('Full-length workout videos', 'FitnessBlender',
   'https://www.fitnessblender.com/videos',
   'Filterable library of free follow-along videos by length, difficulty and equipment.',
   'Follow-along', 'all_levels', 20),

  ('Beginner bodyweight workout', 'Nerd Fitness',
   'https://www.nerdfitness.com/blog/beginner-body-weight-workout-burn-fat-build-muscle/',
   'A gentle first routine with form guidance, aimed at people starting out.',
   'Beginner programs', 'beginner', 30),

  ('Progression-based calisthenics', 'Hybrid Calisthenics',
   'https://www.hybridcalisthenics.com/routine',
   'Step-by-step progressions that scale from very easy to very hard.',
   'Bodyweight', 'all_levels', 40),

  ('Exercise directory',         'ExRx.net',
   'https://exrx.net/Lists/Directory',
   'Reference library of exercises by muscle group, with form notes.',
   'Reference', 'all_levels', 50)
on conflict do nothing;
