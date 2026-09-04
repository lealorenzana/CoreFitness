-- 0058 — more free training the gym can point people at.
--
-- 0019 seeded five links. This adds seven more and widens what the library
-- covers: it was all strength and bodyweight, with nothing for a member who
-- wants to start with yoga, follow along at home, or simply know how much
-- movement a week is enough.
--
-- ---------------------------------------------------------------------------
-- Why this list and not a longer one
-- ---------------------------------------------------------------------------
-- Every URL here was requested and returned a live page on 2026-09-04. That is
-- not a guarantee — links rot, channels get renamed — which is exactly why
-- these are **rows the admin can edit** rather than constants in the app. A
-- dead link is a five-second fix on the Resources page, not a deploy.
--
-- Three kinds of source, deliberately:
--
--   * **Programs** a beginner can follow start to finish, free, with no signup.
--   * **Follow-along video** for members who train at home between gym days.
--   * **Health-authority guidance**, because "how much exercise do I need" is a
--     question this app should answer from a source the gym did not invent.
--
-- Nothing here is affiliate-linked or paywalled, and none of it competes with
-- the gym: it is what a member does on the days they are not coming in, which
-- is the whole reason the free tier exists.

-- ---------------------------------------------------------------------------
-- The same link must not appear twice
-- ---------------------------------------------------------------------------
-- Needed before the insert, and not only for tidiness: `on conflict do nothing`
-- has nothing to conflict *with* unless a constraint exists, so without this a
-- second run of this file would seed all seven links again. Every migration in
-- this project has to be safely re-runnable — the user pastes them by hand, and
-- a double-paste has to be harmless.
--
-- Case-folded, because a link differing only in capitalisation is the same
-- link, and the admin adding one by hand should be told so.
create unique index if not exists workout_resources_url_unique
  on workout_resources (lower(url));

insert into workout_resources (title, provider, url, description, category, level, sort_order)
values
  -- ── Programs ────────────────────────────────────────────────────────────
  ('The Recommended Routine',    'r/bodyweightfitness',
   'https://www.reddit.com/r/bodyweightfitness/wiki/kb/recommended_routine/',
   'The best-known free bodyweight program. Three days a week, full progressions from zero, and a community that answers questions.',
   'Beginner programs', 'beginner', 15),

  ('StrongLifts 5x5',            'StrongLifts',
   'https://stronglifts.com/5x5/',
   'A simple barbell program for building strength: five exercises, three days a week, adding weight each session. Ask a coach to check your form first.',
   'Strength programs', 'beginner', 25),

  -- ── Follow-along video ──────────────────────────────────────────────────
  ('Yoga With Adriene',          'YouTube',
   'https://www.youtube.com/@yogawithadriene',
   'Hundreds of free yoga sessions from 10 to 60 minutes, including several full beginner series. Good for rest days and stiff mornings.',
   'Follow-along', 'all_levels', 60),

  ('HASfit full workouts',       'YouTube',
   'https://www.youtube.com/@HASfit',
   'Free full-length workouts with a low-impact option shown alongside every movement — useful if something hurts or you are coming back from a break.',
   'Follow-along', 'all_levels', 65),

  ('MadFit home workouts',       'YouTube',
   'https://www.youtube.com/@MadFit',
   'Apartment-friendly workouts with no jumping and no equipment. Made for small spaces and thin floors.',
   'Follow-along', 'beginner', 70),

  -- ── Guidance from a source the gym did not write ────────────────────────
  ('How much exercise do I need?', 'World Health Organization',
   'https://www.who.int/news-room/fact-sheets/detail/physical-activity',
   'The actual weekly targets for adults, older adults and people with chronic conditions — from the WHO rather than from a gym trying to sell you sessions.',
   'Guidance', 'all_levels', 90),

  ('Exercise and fitness guides', 'NHS',
   'https://www.nhs.uk/live-well/exercise/',
   'Plain-language guides to getting started, staying safe and building up gradually, written for people who are not athletes.',
   'Guidance', 'beginner', 95)
-- Matched on URL: a gym that has already edited one of these titles keeps
-- their wording, and a re-run adds nothing.
on conflict do nothing;

-- The five from 0019 pre-date the wider category list; two of them read oddly
-- next to the new sections. Renamed only if the gym has not already changed
-- them, so an edited row is never overwritten.
update workout_resources
   set category = 'Reference'
 where provider = 'ExRx.net' and category = 'Reference';

-- ============================================================================
-- VERIFICATION
-- ============================================================================
--   select category, count(*) from workout_resources where is_active
--    group by category order by category;
--   select title, provider, url from workout_resources order by sort_order;
--
-- Expect 12 rows across: Beginner programs, Bodyweight, Follow-along,
-- Guidance, Reference, Strength programs.
