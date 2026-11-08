-- ============================================================================
-- 0241 — The website's words, edited from the platform (the owner, 2026-11-08)
-- ============================================================================
--
-- "The super admin can also control the website, right? There should be a page
-- for managing the website." Prices, the listed gyms, testimonials and the gym
-- documents already come from the database; the site's own words were written in
-- code. The owner chose: one Website page that gathers those controls AND edits the
-- words of the top of the page, the coaches band, and an optional notice line.
--
-- `site_texts` holds only what was changed: a key with no row shows the site's
-- built-in words, so saving nothing changes nothing, and clearing a key goes back.
-- The keys are a fixed list (a typo cannot create a word nobody shows). Anyone may
-- read them — they are the public website — and only a platform admin may write.
-- ============================================================================

create table if not exists site_texts (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id) on delete set null
);
alter table site_texts enable row level security;
-- No policies: read through site_texts(), written through save_site_text().

-- The editable keys and the longest each may be.
create or replace function site_text_limit(p_key text) returns int language sql immutable as $$
  select case p_key
    when 'notice'        then 160
    when 'hero_eyebrow'  then 60
    when 'hero_title_1'  then 40
    when 'hero_title_2'  then 50
    when 'hero_lede'     then 320
    when 'coaches_title' then 60
    when 'coaches_lede'  then 260
    else null end;
$$;
revoke execute on function site_text_limit(text) from public, anon, authenticated;

-- The public read: { key: value } of what was changed.
create or replace function site_texts() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from site_texts;
$$;
revoke execute on function site_texts() from public;
grant execute on function site_texts() to anon, authenticated;

-- Save one key; an empty value goes back to the built-in words.
create or replace function save_site_text(p_key text, p_value text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v text := btrim(coalesce(p_value, ''));
  lim int := site_text_limit(p_key);
begin
  if not is_platform_admin() then raise exception 'Only Core Fitness can change the website.'; end if;
  if lim is null then raise exception 'The website has no text called %.', p_key; end if;
  if length(v) > lim then raise exception 'Keep it under % characters.', lim; end if;
  if v = '' then
    delete from site_texts where key = p_key;
    perform platform_log(null, 'site_text', 'Put the website''s ' || replace(p_key, '_', ' ') || ' back to the built-in words', jsonb_build_object('key', p_key));
  else
    insert into site_texts (key, value, updated_at, updated_by) values (p_key, v, now(), auth.uid())
      on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = auth.uid();
    perform platform_log(null, 'site_text', 'Changed the website''s ' || replace(p_key, '_', ' '), jsonb_build_object('key', p_key, 'value', v));
  end if;
end;
$$;
revoke execute on function save_site_text(text, text) from public, anon;
grant execute on function save_site_text(text, text) to authenticated;

-- For the platform's page: when each was last changed, and by whom.
create or replace function site_texts_detail()
returns table (key text, value text, updated_at timestamptz, updated_by text)
language sql stable security definer set search_path = public as $$
  select s.key, s.value, s.updated_at,
         coalesce(nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''), p.email)
    from site_texts s left join profiles p on p.id = s.updated_by
   where is_platform_admin();
$$;
revoke execute on function site_texts_detail() from public, anon;
grant execute on function site_texts_detail() to authenticated;

create or replace function migration_0241_applied() returns boolean language sql stable as $$ select true $$;
grant execute on function migration_0241_applied() to anon, authenticated;
