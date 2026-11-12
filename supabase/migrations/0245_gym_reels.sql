-- ============================================================================
-- 0245 — Reels: short videos the gym puts up for its members (owner, 2026-11-11)
-- ============================================================================
-- "i want the member to have a reels like section/page that the admin owner put
--  for them to watch even if its just links from fb reels or tiktok or instagram
--  or youtube shorts … or a admin owner can put videos for the people to see."
--
--   1. The switch: `reels`, on every plan, OFF at each gym until the owner
--      switches it on (Your app → What you run).
--   2. gym_reels: a pasted link (YouTube, TikTok, Facebook, Instagram) or a small
--      uploaded video. The owner, the front desk and coaches post; the owner
--      hides or removes any, the others only their own. Up to 10 uploads a gym.
--   3. reel_likes: a member's heart. No comments — the gym chat is for talking.
--   4. The `reels` bucket: public, 25 MB, video and cover images; only the gym's
--      own staff and coaches write into `gyms/<gym>/reels/`.
--   Every write is a definer function; neither table has a write policy.
-- Safe to paste again.
-- ============================================================================

-- ---- 1. the switch ----------------------------------------------------------------------------
insert into platform_features (key, label, description, sort_order, parent_key)
values ('reels', 'Reels',
        'Short videos for your members: paste a link from YouTube, TikTok, Facebook or Instagram, or upload your own.',
        82, null)
on conflict (key) do nothing;
update platform_features set default_on = false where key = 'reels'
   and to_regprocedure('migration_0245_applied()') is null;

-- Every plan has it (0108's sync adds the rows; this says where they start, once).
select sync_platform_plan_features();
update platform_plan_features set enabled = true
 where feature_key = 'reels' and to_regprocedure('migration_0245_applied()') is null;

-- ---- 2. the tables ----------------------------------------------------------------------------
create table if not exists gym_reels (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null default acting_gym_id() references gyms(id) on delete cascade,
  title       text not null check (length(btrim(title)) between 1 and 80),
  caption     text check (caption is null or length(caption) <= 300),
  source      text not null check (source in ('youtube', 'tiktok', 'facebook', 'instagram', 'upload')),
  url         text not null check (length(url) <= 600),
  video_path  text,           -- the file in the `reels` bucket, for an upload
  cover_path  text,           -- a cover image in the `reels` bucket, optional
  hidden      boolean not null default false,
  created_by  uuid not null references profiles(id),
  created_at  timestamptz not null default now(),
  unique (gym_id, id),
  check ((source = 'upload') = (video_path is not null))
);
create index if not exists gym_reels_feed_idx on gym_reels (gym_id, created_at desc);
create unique index if not exists gym_reels_video_path_key on gym_reels (video_path) where video_path is not null;

create table if not exists reel_likes (
  gym_id     uuid not null default acting_gym_id() references gyms(id) on delete cascade,
  reel_id    uuid not null,
  user_id    uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (reel_id, user_id),
  foreign key (gym_id, reel_id) references gym_reels (gym_id, id) on delete cascade
);

alter table gym_reels  enable row level security;
alter table reel_likes enable row level security;

-- Which platform a link is from; NULL for anything else. https only.
create or replace function reel_link_source(p_url text) returns text
language sql immutable set search_path = public as $$
  select case
    when p_url !~* '^https://[^\s]+$' then null
    when p_url ~* '^https://((www|m)\.)?youtube\.com/(shorts/|watch\?)' or p_url ~* '^https://youtu\.be/' then 'youtube'
    when p_url ~* '^https://((www|m|vm|vt)\.)?tiktok\.com/' then 'tiktok'
    when p_url ~* '^https://((www|m|web)\.)?facebook\.com/' or p_url ~* '^https://fb\.watch/' then 'facebook'
    when p_url ~* '^https://(www\.)?instagram\.com/(reel|reels|p)/' then 'instagram'
    else null end;
$$;

-- Read: people of this gym, while the switch is on. A hidden reel is seen only by
-- the owner, the desk and whoever posted it.
drop policy if exists gym_reels_read on gym_reels;
create policy gym_reels_read on gym_reels for select to authenticated
  using (storage_role_here() is not null
         and gym_module_on(gym_id, 'reels')
         and (not hidden or storage_role_here() in ('admin', 'staff') or created_by = auth.uid()));

-- reel_likes has no read policy: the feed counts the hearts; who gave them is nobody's to list.
drop policy if exists reel_likes_read on reel_likes;

do $$
declare t text;
begin
  foreach t in array array['gym_reels', 'reel_likes'] loop
    execute format('drop policy if exists tenant_select on %I', t);
    execute format('drop policy if exists tenant_insert on %I', t);
    execute format('drop policy if exists tenant_update on %I', t);
    execute format('drop policy if exists tenant_delete on %I', t);
    execute format('create policy tenant_select on %I as restrictive for select to anon, authenticated using (gym_id = current_gym_id())', t);
    execute format('create policy tenant_insert on %I as restrictive for insert to anon, authenticated with check (gym_id = current_gym_id() and gym_writable())', t);
    execute format('create policy tenant_update on %I as restrictive for update to anon, authenticated using (gym_id = current_gym_id() and gym_writable()) with check (gym_id = current_gym_id())', t);
    execute format('create policy tenant_delete on %I as restrictive for delete to anon, authenticated using (gym_id = current_gym_id() and gym_writable())', t);
  end loop;
end $$;

-- ---- 3. the writers ---------------------------------------------------------------------------

-- Who may post here: the owner, the desk, a coach — of this gym, while it is writable and the switch is on.
create or replace function may_post_reels() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(auth.uid() is not null
    and storage_role_here() in ('admin', 'staff', 'trainer')
    and gym_writable()
    and gym_module_on(current_gym_id(), 'reels'), false);
$$;
revoke all on function may_post_reels() from public, anon;
grant execute on function may_post_reels() to authenticated;

-- How many uploaded videos a gym may keep. Links are not counted.
create or replace function reel_upload_limit() returns int language sql immutable as $$ select 10 $$;
grant execute on function reel_upload_limit() to authenticated;

-- A new reel. A link: p_url is the pasted link, p_video_path NULL. An upload:
-- p_video_path is the file already in the bucket (gyms/<gym>/reels/…), p_url its public address.
create or replace function post_reel(p_title text, p_caption text, p_url text,
                                     p_video_path text default null, p_cover_path text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_gym uuid := current_gym_id();
  v_source text;
  v_prefix text;
  v_id uuid;
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
    if (select count(*) from gym_reels where gym_id = v_gym and source = 'upload') >= reel_upload_limit() then
      raise exception 'Your gym already has % uploaded videos. Remove one to add another — links are not counted.', reel_upload_limit();
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
revoke all on function post_reel(text, text, text, text, text) from public, anon;
grant execute on function post_reel(text, text, text, text, text) to authenticated;

-- May the caller change this reel? The owner any; the desk and a coach their own.
create or replace function may_manage_reel(p_reel uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(exists (
    select 1 from gym_reels r
     where r.id = p_reel and r.gym_id = current_gym_id()
       and gym_writable()
       and (storage_role_here() = 'admin'
            or (storage_role_here() in ('staff', 'trainer') and r.created_by = auth.uid()))), false);
$$;
revoke all on function may_manage_reel(uuid) from public, anon;
grant execute on function may_manage_reel(uuid) to authenticated;

create or replace function edit_reel(p_reel uuid, p_title text, p_caption text, p_hidden boolean)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not may_manage_reel(p_reel) then
    raise exception 'The owner changes any reel; the front desk and coaches change their own.' using errcode = '42501';
  end if;
  if coalesce(btrim(p_title), '') = '' or length(btrim(p_title)) > 80 then
    raise exception 'Give the reel a title (up to 80 characters).';
  end if;
  if length(coalesce(p_caption, '')) > 300 then
    raise exception 'Keep the caption to 300 characters.';
  end if;
  update gym_reels
     set title = btrim(p_title), caption = nullif(btrim(coalesce(p_caption, '')), ''), hidden = coalesce(p_hidden, hidden)
   where id = p_reel and gym_id = current_gym_id();
end;
$$;
revoke all on function edit_reel(uuid, text, text, boolean) from public, anon;
grant execute on function edit_reel(uuid, text, text, boolean) to authenticated;

-- Removes the reel and its likes; returns the files to delete from the bucket
-- (the caller does that — SQL does not reach Storage).
create or replace function remove_reel(p_reel uuid) returns text[]
language plpgsql security definer set search_path = public as $$
declare r gym_reels;
begin
  if auth.uid() is null or not may_manage_reel(p_reel) then
    raise exception 'The owner removes any reel; the front desk and coaches remove their own.' using errcode = '42501';
  end if;
  delete from gym_reels where id = p_reel and gym_id = current_gym_id() returning * into r;
  if r.id is null then raise exception 'That reel is not in this gym.'; end if;
  perform log_activity('reel.removed', 'gym_reels', r.id, null,
    'Removed the reel "' || r.title || '"', jsonb_build_object('source', r.source), r.gym_id);
  return array_remove(array[r.video_path, r.cover_path], null);
end;
$$;
revoke all on function remove_reel(uuid) from public, anon;
grant execute on function remove_reel(uuid) to authenticated;

-- A heart, on or off. Returns whether it is now on.
create or replace function toggle_reel_like(p_reel uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_gym uuid := current_gym_id();
begin
  if auth.uid() is null or storage_role_here() is null or not gym_writable()
     or not gym_module_on(v_gym, 'reels') then
    raise exception 'Reels are not on at this gym.' using errcode = '42501';
  end if;
  if not exists (select 1 from gym_reels where id = p_reel and gym_id = v_gym
                    and (not hidden or storage_role_here() in ('admin', 'staff') or created_by = auth.uid())) then
    raise exception 'That reel is not in this gym.';
  end if;
  delete from reel_likes where reel_id = p_reel and user_id = auth.uid();
  if found then return false; end if;
  insert into reel_likes (gym_id, reel_id, user_id) values (v_gym, p_reel, auth.uid());
  return true;
end;
$$;
revoke all on function toggle_reel_like(uuid) from public, anon;
grant execute on function toggle_reel_like(uuid) to authenticated;

-- The feed, newest first: what the caller may see, with the hearts counted.
create or replace function gym_reels_feed()
returns table (id uuid, title text, caption text, source text, url text, video_path text, cover_path text,
               hidden boolean, created_at timestamptz, created_by uuid, author text,
               likes int, liked boolean, mine boolean, can_manage boolean)
language sql stable security definer set search_path = public as $$
  select r.id, r.title, r.caption, r.source, r.url, r.video_path, r.cover_path, r.hidden, r.created_at, r.created_by,
         btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')),
         (select count(*)::int from reel_likes l where l.reel_id = r.id),
         exists (select 1 from reel_likes l where l.reel_id = r.id and l.user_id = auth.uid()),
         r.created_by = auth.uid(),
         may_manage_reel(r.id)
    from gym_reels r left join profiles p on p.id = r.created_by
   where r.gym_id = current_gym_id()
     and storage_role_here() is not null
     and gym_module_on(r.gym_id, 'reels')
     and (not r.hidden or storage_role_here() in ('admin', 'staff') or r.created_by = auth.uid())
   order by r.created_at desc
   limit 200;
$$;
revoke all on function gym_reels_feed() from public, anon;
grant execute on function gym_reels_feed() to authenticated;

-- ---- 4. the bucket ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('reels', 'reels', true, 26214400,
        array['video/mp4', 'video/webm', 'video/quicktime', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- gyms/<gym>/reels/<file>: this gym's owner, desk or coach, while reels are on.
create or replace function may_write_reel_file(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    media_path_gym(p_name) = current_gym_id()::text
    and split_part(p_name, '/', 3) = 'reels'
    and may_post_reels(), false);
$$;
revoke all on function may_write_reel_file(text) from public, anon;
grant execute on function may_write_reel_file(text) to authenticated;

-- Listing and removing through the API need a read rule too (the public address needs none):
-- this gym's owner, desk and coaches see the files in its reels folder.
create or replace function may_list_reel_file(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    media_path_gym(p_name) = current_gym_id()::text
    and split_part(p_name, '/', 3) = 'reels'
    and storage_role_here() in ('admin', 'staff', 'trainer'), false);
$$;
revoke all on function may_list_reel_file(text) from public, anon;
grant execute on function may_list_reel_file(text) to authenticated;

drop policy if exists reels_read on storage.objects;
create policy reels_read on storage.objects for select to authenticated
  using (bucket_id = 'reels' and public.may_list_reel_file(name));

drop policy if exists reels_insert on storage.objects;
drop policy if exists reels_delete on storage.objects;
create policy reels_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'reels' and public.may_write_reel_file(name));
-- The owner deletes any file of the gym; the others the files they put there.
create policy reels_delete on storage.objects for delete to authenticated
  using (bucket_id = 'reels' and public.may_write_reel_file(name)
         and (public.storage_role_here() = 'admin' or owner = auth.uid() or owner_id = auth.uid()::text));

-- ---- 5. tenancy -------------------------------------------------------------------------------
-- The tenancy register (0235's list, plus the two tables above).
create or replace function tenancy_gym_tables() returns text[] language sql immutable as $$
  select array['account_status_events','achievement_unlocks','achievements','activity_log',
    'ai_coach_profiles','ai_meal_guides','ai_proposals','ai_usage_days',
    'assistant_conversations','assistant_messages','attendance','body_measurements','bookings',
    'cancellation_reasons','cash_closeouts','challenge_participants','challenges','checkin_picks','class_templates',
    'class_waitlist','classes','coach_checkins','coaching_prices','coaching_standins','coachings','conversations',
    'equipment_exercises','equipment_reports','event_registrations','events','fitness_goals','freemium_trials',
    'goal_templates','guest_visits','guests','gym_equipment','gym_exercise_media','gym_goals','gym_house_rules','gym_invitations','gym_modules','gym_payment_methods','gym_photos','gym_plans',
    'gym_program_days','gym_programs','gym_settings','gym_terms_acceptances','gym_waivers','gym_workout_items','gym_workouts',
    'house_rules_acceptances','invoice_counters','member_profiles','member_share_prefs','membership_events',
    'membership_plans','membership_requests','memberships','messages',
    'notifications','payments','pending_registrations','personal_records','plan_features',
    'point_ledger','point_rules','program_enrolments','progress_photos',
    'pt_sessions','referral_codes','referrals','refund_rules','renewal_requests',
    'reward_redemptions','rewards','room_assignments','room_comments','room_leaves','room_members','room_posts',
    'room_submissions','rooms',
    'saved_resources','season_claims','season_tiers','shop_products','shop_sale_items','shop_sales',
    'squad_members','squad_weeks','squads','staff_permissions','stock_moves','streak_milestones','terms_acceptances',
    'trainer_availability','trainer_credentials','trainer_feedback','trainer_payment_methods','trainer_profiles',
    'trainer_ratings','waiver_acceptances','winback_rules','winback_sends','workout_logs','workout_plans',
    'workout_routine_exercises','workout_routine_versions','workout_routines','workout_sets',
    -- 0235: coaching house rules — each is one gym's.
    'coaching_pauses','coach_cut_settlements','coach_dues_payments',
    -- 0245: reels.
    'gym_reels','reel_likes']::text[]
$$;

create or replace function migration_0245_applied() returns boolean language sql stable as $$ select true $$;
grant execute on function migration_0245_applied() to anon, authenticated;
