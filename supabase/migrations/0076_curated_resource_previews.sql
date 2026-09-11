-- 0076 — pictures for the resources 0075 added.
--
-- 0075 put twenty-five links in the library with no image, so they drew the
-- monogram tile while 0061's older links showed a picture of the page they go
-- to. This gives twenty-two of them the same treatment.
--
-- ---------------------------------------------------------------------------
-- How the pictures were made
-- ---------------------------------------------------------------------------
-- Exactly as 0061's were. Each is a screenshot of the top of the linked page
-- as it first loaded, in a 1200x400 frame, scaled to 900x300 JPEG and checked
-- into both apps at public/resource-previews/. The column holds the path.
-- scripts/resource-previews-capture.js and -process.py redo it.
--
-- Every capture was looked at before it was kept. Four pages opened with a
-- strip above the page itself (a sale bar on NASM's two, an email sign-up bar
-- on StrengthLog's two); those four frames start just below the strip. Nothing
-- was clicked on any page.
--
-- ---------------------------------------------------------------------------
-- Three have no picture, on purpose
-- ---------------------------------------------------------------------------
-- Both Boostcamp pages open under a cookie-consent dialog covering most of the
-- frame, and Lift Vault's under an ad overlay. Getting past either means
-- accepting cookies or dismissing an ad on the gym's behalf. Without that, the
-- capture is a picture of the banner, not of the resource. 0061 made the same
-- call for Reddit and the NHS: a wrong picture is worse than no picture. Their
-- image_url stays NULL and the apps draw the monogram tile.
--
-- ---------------------------------------------------------------------------
-- An edited row is never overwritten
-- ---------------------------------------------------------------------------
-- Matched on URL, and only where image_url is still NULL, so a picture the gym
-- has already set by hand is kept. Re-runnable: a second run finds nothing
-- NULL to fill.

update workout_resources r
   set image_url = v.path
  from (values
    ('https://www.acefitness.org/resources/everyone/exercise-library/', '/resource-previews/ace.jpeg'),
    ('https://www.nasm.org/resource-center/exercise-library',          '/resource-previews/nasm-library.jpeg'),
    ('https://musclewiki.com/',                                         '/resource-previews/musclewiki.jpeg'),
    ('https://www.exerciselibrary.com/',                                '/resource-previews/exerciselibrary.jpeg'),
    ('https://visualbody.net/workout-library/',                         '/resource-previews/visualbody.jpeg'),
    ('https://repdriver.com/',                                          '/resource-previews/repdriver.jpeg'),
    ('https://www.strongerbyscience.com/program-bundle/',               '/resource-previews/sbs-bundle.jpeg'),
    ('https://www.strongerbyscience.com/newsletter/',                   '/resource-previews/sbs-newsletter.jpeg'),
    ('https://www.strengthlog.com/training-programs/',                  '/resource-previews/strengthlog-programs.jpeg'),
    ('https://fitstra.com/workout-programs/',                           '/resource-previews/fitstra.jpeg'),
    ('https://www.ironlibrary.ca/programs',                             '/resource-previews/ironlibrary.jpeg'),
    ('https://www.strongerbyscience.com/',                              '/resource-previews/sbs-home.jpeg'),
    ('https://www.nasm.org/resource-center',                            '/resource-previews/nasm-resources.jpeg'),
    ('https://www.strengthlog.com/strength-training-for-beginners/',    '/resource-previews/strengthlog-beginners.jpeg'),
    ('https://www.strongerbyscience.com/articles/',                     '/resource-previews/sbs-articles.jpeg'),
    ('https://examine.com/',                                            '/resource-previews/examine.jpeg'),
    ('https://www.nsca.com/',                                           '/resource-previews/nsca.jpeg'),
    ('https://acsm.org/',                                               '/resource-previews/acsm.jpeg'),
    ('https://www.strengthlog.com/',                                    '/resource-previews/strengthlog-app.jpeg'),
    ('https://www.trainsmart.com/',                                     '/resource-previews/trainsmart.jpeg'),
    ('https://play.google.com/store/apps/details?id=com.liftlab.app',   '/resource-previews/liftlab.jpeg'),
    ('https://github.com/yuhonas/free-exercise-db',                     '/resource-previews/free-exercise-db.jpeg')
  ) as v(url, path)
 where lower(r.url) = lower(v.url)
   and r.image_url is null;

-- Marker for scripts/probe-migrations.py: an UPDATE leaves no schema trace,
-- and the rows are invisible to the anon key the probe uses.
create or replace function migration_0076_applied() returns boolean
language sql immutable as $fn$ select true $fn$;

revoke all on function migration_0076_applied() from public, anon;
grant execute on function migration_0076_applied() to authenticated;

comment on function migration_0076_applied() is
  'Marker for scripts/probe-migrations.py. 0076 only updates rows the anon key '
  'cannot read. Delete this only alongside the probe entry.';

-- ============================================================================
-- VERIFICATION
-- ============================================================================
--   select category, count(*) filter (where image_url is not null) as with_picture,
--          count(*) as total
--     from workout_resources where sort_order >= 100
--    group by category order by min(sort_order);
--
-- Expect 22 of 25 with a picture. The three without are the two Boostcamp
-- links and Lift Vault.
