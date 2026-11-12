-- ============================================================================
-- 0247 — Storage is part of the plan; a reel's cover from its own link (owner, 2026-11-12)
-- ============================================================================
-- "we should also include in the plan how much storage they can use in each plan
--  for uploading … make it good marketable, fix the plan for real world use."
-- "it should auto use the picture of the link when showing thumbnail."
--
--   1. platform_plans.storage_mb: what a gym on that plan may keep in uploads —
--      reel videos and covers, chat photos, and the gym's own pictures (logo,
--      events, equipment). NULL = no limit. Starts at: trial 500 MB, Starter 2 GB,
--      Growth 10 GB, Pro 50 GB — the platform changes them on Plans.
--   2. The limit holds: a new reel video or chat photo is refused while the gym is
--      at its limit (the file rules ask gym_storage_full()), and post_reel() refuses
--      the video that crossed it. 0245's "10 uploaded videos" count is gone: the
--      storage is the limit now. Links use none.
--   3. my_gym_storage(): used and allowed, for the gym's own screens.
--   4. set_reel_cover(): the cover (and the full address a share link leads to)
--      that the reel-preview function fetched from the link's own page.
-- Safe to paste again.
-- ============================================================================

-- ---- 1. the plan's storage --------------------------------------------------------------------
alter table platform_plans add column if not exists storage_mb int check (storage_mb is null or storage_mb > 0);
comment on column platform_plans.storage_mb is
  '0247: megabytes of uploads a gym on this plan may keep (reel videos, chat photos, its own pictures). NULL = no limit.';

-- Where each plan starts. Only the first time: the platform owns the numbers from then on.
do $$
begin
  if to_regprocedure('migration_0247_applied()') is null then
    update platform_plans set storage_mb = case key
      when 'trial' then 500 when 'starter' then 2048 when 'growth' then 10240 when 'pro' then 51200
      when 'standard' then 2048 when 'premium' then 10240 else storage_mb end;
  end if;
end $$;

-- The platform sets a plan's storage (NULL = no limit).
create or replace function set_platform_plan_storage(p_plan text, p_mb int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not is_platform_admin() then
    raise exception 'Only Core Fitness sets what a plan includes.' using errcode = '42501';
  end if;
  if p_mb is not null and (p_mb < 100 or p_mb > 1048576) then
    raise exception 'Storage is between 100 MB and 1 TB, or empty for no limit.';
  end if;
  update platform_plans set storage_mb = p_mb where key = p_plan;
  if not found then raise exception 'That plan does not exist.'; end if;
end;
$$;
revoke all on function set_platform_plan_storage(text, int) from public, anon;
grant execute on function set_platform_plan_storage(text, int) to authenticated;

-- For the website's price list and the platform's Plans page: each plan's storage. Public, like the prices.
create or replace function platform_plan_storage()
returns table (plan_key text, storage_mb int)
language sql stable security definer set search_path = public as $$
  select p.key, p.storage_mb from platform_plans p;
$$;
grant execute on function platform_plan_storage() to anon, authenticated;

-- ---- 2. what a gym uses, and may ---------------------------------------------------------------
-- Every file under gyms/<gym>/ in the buckets a gym fills. Sizes are Storage's own record.
create or replace function gym_storage_used(p_gym uuid) returns bigint
language sql stable security definer set search_path = public as $$
  select coalesce(sum(nullif(o.metadata->>'size', '')::bigint), 0)::bigint
    from storage.objects o
   where o.bucket_id in ('reels', 'chat', 'media')
     and o.name like 'gyms/' || p_gym::text || '/%';
$$;
revoke all on function gym_storage_used(uuid) from public, anon, authenticated;

create or replace function gym_storage(p_gym uuid)
returns table (plan_name text, limit_bytes bigint, used_bytes bigint)
language sql stable security definer set search_path = public as $$
  select p.name, p.storage_mb::bigint * 1048576, gym_storage_used(g.id)
    from gyms g left join platform_plans p on p.key = g.plan
   where g.id = p_gym;
$$;
revoke all on function gym_storage(uuid) from public, anon, authenticated;

create or replace function gym_storage_full(p_gym uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select s.limit_bytes is not null and s.used_bytes >= s.limit_bytes from gym_storage(p_gym) s), false);
$$;
revoke all on function gym_storage_full(uuid) from public, anon, authenticated;

-- The gym's own screens: the owner, the desk and coaches (the people who upload).
create or replace function my_gym_storage()
returns table (plan_name text, limit_bytes bigint, used_bytes bigint)
language sql stable security definer set search_path = public as $$
  select s.plan_name, s.limit_bytes, s.used_bytes from gym_storage(current_gym_id()) s
   where auth.uid() is not null and storage_role_here() in ('admin', 'staff', 'trainer');
$$;
revoke all on function my_gym_storage() from public, anon;
grant execute on function my_gym_storage() to authenticated;

-- The platform's view: every gym's use against its plan.
create or replace function platform_gym_storage()
returns table (gym_id uuid, gym_name text, plan_name text, limit_bytes bigint, used_bytes bigint)
language sql stable security definer set search_path = public as $$
  select g.id, g.name, p.name, p.storage_mb::bigint * 1048576, gym_storage_used(g.id)
    from gyms g left join platform_plans p on p.key = g.plan
   where is_platform_admin()
   order by 5 desc;
$$;
revoke all on function platform_gym_storage() from public, anon;
grant execute on function platform_gym_storage() to authenticated;

-- ---- 3. the limit holds --------------------------------------------------------------------------
-- 0245's and 0246's file rules, plus: not while the gym is at its plan's storage.
create or replace function may_write_reel_file(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    media_path_gym(p_name) = current_gym_id()::text
    and split_part(p_name, '/', 3) = 'reels'
    and may_post_reels()
    and not gym_storage_full(current_gym_id()), false);
$$;

create or replace function may_write_chat_file(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(media_path_gym(p_name) = current_gym_id()::text
    and split_part(p_name, '/', 3) = 'chat'
    and split_part(p_name, '/', 4) = auth.uid()::text
    and gym_chat_post_block() is null
    and not gym_storage_full(current_gym_id()), false);
$$;

-- 0245's post_reel, with the storage in place of the count of ten.
create or replace function post_reel(p_title text, p_caption text, p_url text,
                                     p_video_path text default null, p_cover_path text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_gym uuid := current_gym_id();
  v_source text;
  v_prefix text;
  v_id uuid;
  v_store record;
begin
  if not may_post_reels() then
    raise exception 'Only the gym''s owner, front desk and coaches post reels.' using errcode = '42501';
  end if;
  if coalesce(btrim(p_title), '') = '' or length(btrim(p_title)) > 80 then
    raise exception 'Give the reel a title (up to 80 characters).';
  end if;
  if length(coalesce(p_caption, '')) > 300 then
    raise exception 'Keep the caption to 300 characters.';
  end if;
  v_prefix := 'gyms/' || v_gym || '/reels/';
  if p_cover_path is not null and (left(p_cover_path, length(v_prefix)) <> v_prefix or p_cover_path ~ '\.\.') then
    raise exception 'That cover is not in this gym''s folder.';
  end if;

  if p_video_path is not null then
    if left(p_video_path, length(v_prefix)) <> v_prefix or p_video_path ~ '\.\.' then
      raise exception 'That video is not in this gym''s folder.';
    end if;
    if coalesce(p_url, '') !~ '^https://' or position(p_video_path in p_url) = 0 then
      raise exception 'The video''s address does not match the uploaded file.';
    end if;
    -- 0247: what a gym may keep is its plan's storage, not a count of videos. The file is
    -- already in the bucket, so "used" includes it; over the line, the reel is refused and
    -- the app removes the file again.
    select * into v_store from gym_storage(v_gym);
    if v_store.limit_bytes is not null and v_store.used_bytes > v_store.limit_bytes then
      raise exception 'Your gym''s storage is full (% of % used on %). Remove a video you no longer need, or move to a plan with more storage — links use none.',
        pg_size_pretty(v_store.used_bytes), pg_size_pretty(v_store.limit_bytes), coalesce(v_store.plan_name, 'your plan');
    end if;
    v_source := 'upload';
  else
    v_source := reel_link_source(btrim(coalesce(p_url, '')));
    if v_source is null then
      raise exception 'Paste a link from YouTube, TikTok, Facebook or Instagram (it starts with https://).';
    end if;
  end if;

  insert into gym_reels (gym_id, title, caption, source, url, video_path, cover_path, created_by)
  values (v_gym, btrim(p_title), nullif(btrim(coalesce(p_caption, '')), ''), v_source, btrim(p_url),
          p_video_path, p_cover_path, auth.uid())
  returning id into v_id;

  perform log_activity('reel.posted', 'gym_reels', v_id, null,
    'Posted the reel "' || btrim(p_title) || '"', jsonb_build_object('source', v_source), v_gym);
  return v_id;
end;
$$;

comment on function reel_upload_limit() is
  'Superseded by 0247: a gym''s uploads are limited by its plan''s storage (my_gym_storage), not a count. Kept so an older app build still loads.';

-- ---- 4. a cover from the link's own page ---------------------------------------------------------
-- The reel-preview function fetched the picture a link shows when shared and put it
-- in the gym's reels folder; this attaches it. p_url, when given, is the full address
-- a share link leads to (same site), so the video can play inside the app.
-- Returns the cover it replaced, for the caller to delete.
create or replace function set_reel_cover(p_reel uuid, p_cover_path text, p_url text default null) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_gym uuid := current_gym_id();
  r gym_reels;
  v_prefix text;
begin
  if auth.uid() is null or not may_manage_reel(p_reel) then
    raise exception 'The owner changes any reel; the front desk and coaches change their own.' using errcode = '42501';
  end if;
  select * into r from gym_reels where id = p_reel and gym_id = v_gym;
  v_prefix := 'gyms/' || v_gym || '/reels/';
  if p_cover_path is not null and (left(p_cover_path, length(v_prefix)) <> v_prefix or p_cover_path ~ '\.\.') then
    raise exception 'That cover is not in this gym''s folder.';
  end if;
  if p_url is not null then
    if r.source = 'upload' or reel_link_source(btrim(p_url)) is distinct from r.source or length(p_url) > 600 then
      raise exception 'That address is not the same site as the reel''s link.';
    end if;
  end if;
  update gym_reels set cover_path = coalesce(p_cover_path, cover_path), url = coalesce(btrim(p_url), url)
   where id = p_reel and gym_id = v_gym;
  return case when p_cover_path is not null and r.cover_path is distinct from p_cover_path then r.cover_path end;
end;
$$;
revoke all on function set_reel_cover(uuid, text, text) from public, anon;
grant execute on function set_reel_cover(uuid, text, text) to authenticated;

create or replace function migration_0247_applied() returns boolean language sql stable as $$ select true $$;
grant execute on function migration_0247_applied() to anon, authenticated;
