-- 0075 — the gym's curated list of free training resources.
--
-- 0019 and 0058 seeded twelve links. This adds twenty-five more, in the six
-- groups the gym asked for: exercise libraries, free programs, strength and
-- hypertrophy education, research, free apps, and one dataset for developers.
--
-- ---------------------------------------------------------------------------
-- What was checked, and what was left out
-- ---------------------------------------------------------------------------
-- Every URL below was requested on 2026-09-11 and returned a live page whose
-- title matched the resource. Examine.com is the exception: it refuses
-- automated requests (403/429), but it is a long-standing public site and
-- loads normally in a browser.
--
-- Four names on the gym's list are not here, on purpose:
--   * "TrainSmart Exercise Library" and "Onyx Elevate Exercise Library" — no
--     such library could be found. A guessed URL is worse than no link.
--   * "MyFitEngine" — no product by that name could be found.
--   * "Free Exercise DB + Videos + API" (317 exercises, MIT) — its site now
--     answers 410 Gone and its GitHub repository 404. The public-domain
--     Free Exercise DB (800+ exercises) stands in for it under "For developers".
-- RepDriver appears once, under exercise libraries: it was listed under both
-- libraries and apps, but it is one site and the URL is unique here.
--
-- Descriptions say only what the page itself says. Where a resource asks for
-- an email address or keeps some features for paying users, the description
-- says so. Members should know before they tap.
--
-- As in 0058, these are rows the admin edits on the Resources page, not
-- constants in the app. A dead link takes five seconds to fix there and needs
-- no deploy.
--
-- Re-runnable: 0058's unique index on lower(url) makes `on conflict do nothing`
-- skip anything already present, including a row the gym has since edited.

-- The index 0058 created. Repeated so this file stands alone if 0058's insert
-- was ever skipped; `if not exists` makes it free when it is already there.
create unique index if not exists workout_resources_url_unique
  on workout_resources (lower(url));

insert into workout_resources (title, provider, url, description, category, level, sort_order)
values
  -- ── Exercise libraries ──────────────────────────────────────────────────
  ('ACE Exercise Library', 'American Council on Exercise',
   'https://www.acefitness.org/resources/everyone/exercise-library/',
   'Step-by-step exercise instructions with photos, from a major trainer-certifying body. Search by body part or equipment.',
   'Exercise libraries', 'all_levels', 100),

  ('NASM Exercise Library', 'National Academy of Sports Medicine',
   'https://www.nasm.org/resource-center/exercise-library',
   'Exercise demonstrations and instructions from NASM, the organisation behind the CPT certificate many trainers hold.',
   'Exercise libraries', 'all_levels', 101),

  ('MuscleWiki', 'MuscleWiki',
   'https://musclewiki.com/',
   'Tap a muscle on an interactive body map to see exercises that train it, each with a short demonstration.',
   'Exercise libraries', 'all_levels', 102),

  ('ExerciseLibrary.com', 'ExerciseLibrary.com',
   'https://www.exerciselibrary.com/',
   'Step-by-step guides to individual exercises: set-up, movement and common mistakes.',
   'Exercise libraries', 'all_levels', 103),

  ('VisualBody Workout Library', 'VisualBody',
   'https://visualbody.net/workout-library/',
   'A free, ad-free web library of 100+ movements shown on a 3D anatomy model, so you can see which muscles are working.',
   'Exercise libraries', 'all_levels', 104),

  ('RepDriver', 'RepDriver',
   'https://repdriver.com/',
   'Free guided workouts and an exercise library with narrated, step-by-step instructions.',
   'Exercise libraries', 'all_levels', 105),

  -- ── Free workout programs ───────────────────────────────────────────────
  ('SBS Program Bundle', 'Stronger by Science',
   'https://www.strongerbyscience.com/program-bundle/',
   'Six full 21-week programs, including strength, hypertrophy and novice options, for 3 to 6 training days a week. Free as a Google Sheets download; they ask for an email address.',
   'Free workout programs', 'all_levels', 110),

  ('Boostcamp program library', 'Boostcamp',
   'https://www.boostcamp.app/programs',
   '11,000+ free programs from well-known coaches (5/3/1, GZCLP, push/pull/legs and more). Browse on the web and follow them in the free app.',
   'Free workout programs', 'all_levels', 111),

  ('28 Programs (squat, bench, deadlift)', 'Stronger by Science',
   'https://www.strongerbyscience.com/newsletter/',
   'Greg Nuckols'' 28 free single-lift templates by skill level and days per week. Sent as a spreadsheet when you join the free newsletter.',
   'Free workout programs', 'intermediate', 112),

  ('StrengthLog training programs', 'StrengthLog',
   'https://www.strengthlog.com/training-programs/',
   '100+ programs and workouts, from a first full-body routine to powerlifting, free to follow in the StrengthLog app.',
   'Free workout programs', 'all_levels', 113),

  ('Fitstra free programs', 'Fitstra',
   'https://fitstra.com/workout-programs/',
   'Free strength and hypertrophy programs, from a 2 to 3 day beginner plan to a 6-day split, each with core work and conditioning included.',
   'Free workout programs', 'all_levels', 114),

  ('Iron Library', 'Iron Library',
   'https://www.ironlibrary.ca/programs',
   'A searchable collection of free lifting programs you can filter by sport (powerlifting, bodybuilding, strongman) and by lift.',
   'Free workout programs', 'intermediate', 115),

  -- ── Strength & hypertrophy education ────────────────────────────────────
  ('Stronger by Science', 'Stronger by Science',
   'https://www.strongerbyscience.com/',
   'Long, evidence-based articles on building strength and muscle, written by coaches who read the research.',
   'Strength & hypertrophy education', 'all_levels', 120),

  ('NASM Resource Center', 'National Academy of Sports Medicine',
   'https://www.nasm.org/resource-center',
   'Free articles, guides and tools on training, nutrition and recovery.',
   'Strength & hypertrophy education', 'all_levels', 121),

  ('Strength training for beginners', 'StrengthLog',
   'https://www.strengthlog.com/strength-training-for-beginners/',
   'A complete beginner''s guide: how to start, how often to train, how to choose weights and how to keep progressing.',
   'Strength & hypertrophy education', 'beginner', 122),

  ('Lift Vault', 'Lift Vault',
   'https://liftvault.com/programs/',
   'A database of lifting programs as spreadsheets, organised by goal and by coach, each with a write-up of who it suits.',
   'Strength & hypertrophy education', 'intermediate', 123),

  -- ── Research-based training ─────────────────────────────────────────────
  ('Stronger by Science articles', 'Stronger by Science',
   'https://www.strongerbyscience.com/articles/',
   'The full article archive, including research reviews on training volume, frequency, rest times and more.',
   'Research-based training', 'all_levels', 130),

  ('Examine', 'Examine',
   'https://examine.com/',
   'Independent summaries of nutrition and supplement research, graded by strength of evidence. Worth reading before you buy any supplement.',
   'Research-based training', 'all_levels', 131),

  ('NSCA', 'National Strength and Conditioning Association',
   'https://www.nsca.com/',
   'The professional body behind the CSCS certification. Articles and position statements on strength and conditioning.',
   'Research-based training', 'all_levels', 132),

  ('American College of Sports Medicine', 'ACSM',
   'https://acsm.org/',
   'The organisation behind the exercise guidelines most gyms and doctors follow.',
   'Research-based training', 'all_levels', 133),

  -- ── Free workout apps ───────────────────────────────────────────────────
  ('Boostcamp app', 'Boostcamp',
   'https://www.boostcamp.app/',
   'A free workout tracker built around following programs: logging, rest timer and progress charts. A paid tier adds analytics; the core stays free.',
   'Free workout apps', 'all_levels', 140),

  ('StrengthLog app', 'StrengthLog',
   'https://www.strengthlog.com/',
   'A free, ad-free workout log with instructions for 300+ exercises. Premium is optional.',
   'Free workout apps', 'all_levels', 141),

  ('TrainSmart', 'Trainsmart',
   'https://www.trainsmart.com/',
   'A free training diary and plan app, strongest for running and endurance events. Syncs with Garmin, Polar and Strava; coaching is an optional subscription.',
   'Free workout apps', 'all_levels', 142),

  ('LiftLab (Android)', 'LiftLab',
   'https://play.google.com/store/apps/details?id=com.liftlab.app',
   'A free lifting tracker for building your own multi-week programs, with rep-range and RIR targets and progression rules.',
   'Free workout apps', 'intermediate', 143),

  -- ── For developers ──────────────────────────────────────────────────────
  ('Free Exercise DB', 'Free Exercise DB (GitHub)',
   'https://github.com/yuhonas/free-exercise-db',
   'An open, public-domain dataset of 800+ exercises in JSON with images, for anyone building their own fitness app. A developer resource, not a workout guide.',
   'For developers', 'all_levels', 150)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Marker for scripts/probe-migrations.py
-- ---------------------------------------------------------------------------
-- 0075 adds rows, not schema, and the rows are invisible to the anonymous key
-- the probe uses (0019: only signed-in users may read the library). Without
-- this, the probe could not tell a pasted 0075 from one that never ran.
create or replace function migration_0075_applied() returns boolean
language sql immutable as $fn$ select true $fn$;

revoke all on function migration_0075_applied() from public, anon;
grant execute on function migration_0075_applied() to authenticated;

comment on function migration_0075_applied() is
  'Marker for scripts/probe-migrations.py. 0075 only inserts rows the anon key '
  'cannot read. Delete this only alongside the probe entry.';

-- ============================================================================
-- VERIFICATION
-- ============================================================================
--   select category, count(*) from workout_resources
--    where sort_order >= 100 group by category order by min(sort_order);
--
-- Expect 25 rows: Exercise libraries 6, Free workout programs 6,
-- Strength & hypertrophy education 4, Research-based training 4,
-- Free workout apps 4, For developers 1.
