-- ============================================================================
-- 0261 — More of the website, controlled from the platform (the owner, 2026-11-22)
-- ============================================================================
--
-- "Redesign the Website page … and add features if you must to fully control the
-- website app." 0241 let the platform edit seven of the site's words. This adds,
-- to the same fixed list of keys (no new table, no new function to call):
--
--   roles_title, how_title, faq_title, apply_title   four more headings
--   hidden_sections   which sections are hidden, a comma list of their ids
--                     (roles, floor, how, pricing, faq, gyms, voices)
--   apply_closed      a message; while set, it replaces the Register your gym form
--                     (pausing applications). Clearing it opens the form again.
--
-- A key with no row keeps the site's built-in behaviour, so every section shows and
-- the form is open until something is saved. The site that reads these is safe to
-- deploy before this is pasted: it simply never sees the new keys.
-- ============================================================================

create or replace function site_text_limit(p_key text) returns int language sql immutable as $$
  select case p_key
    when 'notice'          then 160
    when 'hero_eyebrow'    then 60
    when 'hero_title_1'    then 40
    when 'hero_title_2'    then 50
    when 'hero_lede'       then 320
    when 'coaches_title'   then 60
    when 'coaches_lede'    then 260
    when 'roles_title'     then 60
    when 'how_title'       then 60
    when 'faq_title'       then 60
    when 'apply_title'     then 60
    when 'hidden_sections' then 200
    when 'apply_closed'    then 300
    else null end;
$$;
revoke execute on function site_text_limit(text) from public, anon, authenticated;

create or replace function migration_0261_applied() returns boolean language sql stable as $$ select true $$;
grant execute on function migration_0261_applied() to anon, authenticated;
