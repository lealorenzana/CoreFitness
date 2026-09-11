-- 0077 — a picture for the two Boostcamp links.
--
-- 0076 left them on the monogram tile because both pages open under a cookie-
-- consent dialog, and a screenshot of that dialog is not a picture of the
-- site. There is an honest alternative that needs no clicking: the page's own
-- og:image, the picture Boostcamp publishes for exactly this purpose, which
-- every chat app and search result shows when a Boostcamp link is shared.
-- Both pages declare the same one, their logo:
--   https://s3.boostcamp.app/images/www/home/Boostcamp_Logo.png
-- scripts/resource-previews-process.py centres it on a 900x300 card to match
-- the rest, in both apps at public/resource-previews/boostcamp.jpeg.
--
-- Lift Vault stays on the monogram. Its page is covered by an overlay and a
-- third-party ad from the first frame, and it publishes no og:image, so no
-- honest picture of it exists.
--
-- Only rows whose image_url is still NULL are touched, so a picture the gym set
-- by hand is kept, and a re-run changes nothing.

update workout_resources
   set image_url = '/resource-previews/boostcamp.jpeg'
 where lower(url) in ('https://www.boostcamp.app/programs', 'https://www.boostcamp.app/')
   and image_url is null;

-- Marker for scripts/probe-migrations.py (an UPDATE leaves no schema trace).
create or replace function migration_0077_applied() returns boolean
language sql immutable as $fn$ select true $fn$;

revoke all on function migration_0077_applied() from public, anon;
grant execute on function migration_0077_applied() to authenticated;

comment on function migration_0077_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION
--   select title, image_url from workout_resources where provider = 'Boostcamp';
-- Expect both rows on /resource-previews/boostcamp.jpeg.
