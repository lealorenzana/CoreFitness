-- 0061 — a picture for each workout resource.
--
-- The library (0019, extended by 0058) is twelve links in a list. A list of
-- twelve blue links all styled identically is the least browsable thing a
-- phone can show: nothing distinguishes "a YouTube yoga channel" from "a WHO
-- fact sheet" until you have read both titles. Every link that goes anywhere
-- else on this phone — a shared post, a message, a search result — arrives with
-- a picture, and this one looked broken by comparison.
--
-- So each resource gets a preview image: a screenshot of the top of the page it
-- links to, the same artefact any link unfurl produces.
--
-- ---------------------------------------------------------------------------
-- Where the files live, and why not Storage
-- ---------------------------------------------------------------------------
-- `image_url` holds a path, not a picture. The images are static files checked
-- into **both** apps at `public/resource-previews/`, so the column stores
-- `/resource-previews/darebee.jpeg` and each app serves its own copy.
--
-- The two alternatives were worse:
--
--   * **A data: URI in the column** would put ~30KB of base64 into every row of
--     every query that reads this table, on a phone, over provincial mobile
--     data — to render a thumbnail.
--   * **Supabase Storage** would work, but it is a bucket, a policy and an
--     upload step for twelve files that change roughly never, on a free tier
--     whose storage quota is better spent on trainer credentials (0054).
--
-- A path also means a missing file degrades to the fallback tile below rather
-- than to a broken row.
--
-- ---------------------------------------------------------------------------
-- Two resources deliberately have no image
-- ---------------------------------------------------------------------------
-- The r/bodyweightfitness wiki answers with Reddit's "Prove your humanity"
-- check, and the NHS page opens behind a cookie consent dialog that covers the
-- whole page. Neither was clicked through: a screenshot of a CAPTCHA or a
-- cookie banner is not a picture of the resource, and shipping one would be
-- exactly the "plausible invention" this codebase keeps ruling out.
--
-- Their `image_url` stays NULL and both apps draw a generated monogram tile
-- instead — the provider's initials on a colour derived from its own name. It
-- reads as "no preview", not as a different website. A wrong picture is worse
-- than no picture.

alter table workout_resources
  add column if not exists image_url text;

comment on column workout_resources.image_url is
  'Path to a preview screenshot under each app''s public/resource-previews/, '
  'e.g. /resource-previews/darebee.jpeg. NULL is normal and means the apps '
  'draw a monogram tile — never substitute another image.';

-- Matched on lower(url), the same key 0058's unique index uses, so a link
-- whose casing differs still finds its picture.
--
-- **Only fills an empty cell.** Re-pasting this file will not overwrite a path
-- the gym has since set on the admin Resources screen, which is the same shape
-- as 0060 guarding the trial length on its old value.
update workout_resources r
   set image_url = v.path
  from (values
    ('https://darebee.com/workouts.html',
     '/resource-previews/darebee.jpeg'),
    ('https://www.fitnessblender.com/videos',
     '/resource-previews/fitnessblender.jpeg'),
    ('https://www.nerdfitness.com/blog/beginner-body-weight-workout-burn-fat-build-muscle/',
     '/resource-previews/nerdfitness.jpeg'),
    ('https://www.hybridcalisthenics.com/routine',
     '/resource-previews/hybridcalisthenics.jpeg'),
    ('https://exrx.net/Lists/Directory',
     '/resource-previews/exrx.jpeg'),
    ('https://stronglifts.com/5x5/',
     '/resource-previews/stronglifts.jpeg'),
    ('https://www.youtube.com/@yogawithadriene',
     '/resource-previews/yogawithadriene.jpeg'),
    ('https://www.youtube.com/@HASfit',
     '/resource-previews/hasfit.jpeg'),
    ('https://www.youtube.com/@MadFit',
     '/resource-previews/madfit.jpeg'),
    ('https://www.who.int/news-room/fact-sheets/detail/physical-activity',
     '/resource-previews/who.jpeg')
  ) as v(url, path)
 where lower(r.url) = lower(v.url)
   and r.image_url is null;

-- ============================================================================
-- VERIFICATION — expect 10 with a path, 2 without (Reddit and NHS)
-- ============================================================================
--   select provider, image_url is not null as has_preview
--     from workout_resources
--    order by has_preview desc, provider;
--
-- If a row you expected to have one does not, check its URL matches the list
-- above character for character — this joins on the link, not the title.
