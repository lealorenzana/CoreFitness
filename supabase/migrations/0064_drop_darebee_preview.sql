-- 0064 — clear the Darebee preview path, which points at a file that is not shipped.
--
-- 0061 seeded `/resource-previews/darebee.jpeg` along with the others. That
-- image was then dropped from both apps before release: the capture was
-- dominated by one of Darebee's copyrighted workout posters, watermarked with
-- their own name, and 0019 is explicit that this library **links out rather
-- than republishing** other people's work. A thumbnail of somebody else's
-- routine is exactly what that rule exists to prevent.
--
-- 0061 has been corrected so a fresh database never sets it. This file is for
-- the databases that already ran the original — the row still holds a path to a
-- file neither app serves.
--
-- ---------------------------------------------------------------------------
-- Nothing is visibly broken, and it is still wrong
-- ---------------------------------------------------------------------------
-- Both apps handle a 404 on a preview by falling back to the host tile, so a
-- member sees "darebee.com" rather than a broken-image glyph. The cost is one
-- wasted request per render and a row that claims to have a picture it does
-- not. A column that lies quietly is the kind of thing this codebase keeps
-- finding six months later, so it is corrected now rather than left because the
-- fallback happens to cover it.
--
-- Matched on the path, not the URL: if the gym has since pointed Darebee at a
-- preview of their own, that is a real file and must survive.

update workout_resources
   set image_url = null
 where image_url = '/resource-previews/darebee.jpeg';

-- ============================================================================
-- VERIFICATION — expect 9 with a preview, 3 without
-- ============================================================================
--   select provider, title, image_url is not null as has_preview
--     from workout_resources
--    order by has_preview desc, provider;
--
-- The three without are Darebee, r/bodyweightfitness (bot check) and the NHS
-- (cookie wall). Every remaining path must resolve to a file that exists in
-- both apps' public/resource-previews/.
