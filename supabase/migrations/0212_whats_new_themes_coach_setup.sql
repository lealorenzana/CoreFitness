-- ============================================================================
-- 0212 — What's new, a gym's saved colour themes, and a coach's first steps
-- ============================================================================
-- 1. WHAT'S NEW. When the apps change, the people using them were not told.
--    app_releases holds short notes for one app each — admin (owner and desk),
--    member, trainer — written by the platform. Each person sees the newest
--    one they have not seen, once: app_release_reads records that, in the
--    database (never one browser's storage, so a second phone does not replay
--    it). A note older than the account is never shown — a new member is not
--    told what changed before they arrived.
-- 2. SAVED THEMES. A gym that bought its own colour codes (0191's ₱499 unlock)
--    can keep up to eight named colour pairs and switch between them.
--    Saving needs the unlock — checked here, not only on the screen.
-- 3. A COACH'S FIRST STEPS. Coaches had no onboarding: an invitation landed
--    them on the hub with nothing set. trainer_profiles.onboarded_at marks the
--    walkthrough done; my_coach_setup() reads what is really set (photo, bio,
--    weekly hours, how this gym approves 1-on-1s, coach check-in), so each step
--    ticks from data, not from a tap.
-- ============================================================================

-- ---- 1. what's new --------------------------------------------------------------------------------------
create table if not exists app_releases (
  id           uuid primary key default gen_random_uuid(),
  app          text not null check (app in ('admin', 'member', 'trainer')),
  title        text not null check (char_length(btrim(title)) between 3 and 80),
  items        text[] not null check (cardinality(items) between 1 and 8),
  published_at timestamptz not null default now(),
  created_by   uuid references profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists app_releases_app_published on app_releases (app, published_at desc);
alter table app_releases enable row level security;
drop policy if exists app_releases_read on app_releases;
create policy app_releases_read on app_releases for select to authenticated using (published_at <= now());

create table if not exists app_release_reads (
  user_id    uuid not null references profiles(id) on delete cascade,
  release_id uuid not null references app_releases(id) on delete cascade,
  seen_at    timestamptz not null default now(),
  primary key (user_id, release_id)
);
alter table app_release_reads enable row level security;
drop policy if exists app_release_reads_own on app_release_reads;
create policy app_release_reads_own on app_release_reads for select to authenticated using (user_id = auth.uid());
-- No INSERT policy: seen is written by mark_release_seen() alone.

create or replace function my_whats_new(p_app text) returns jsonb
language sql stable security definer set search_path = public as $$
  select to_jsonb(r) from (
    select a.id, a.app, a.title, a.items, a.published_at
      from app_releases a
     where a.app = p_app and a.published_at <= now()
       and auth.uid() is not null
       and a.published_at >= coalesce((select p.created_at from profiles p where p.id = auth.uid()), now())
       and not exists (select 1 from app_release_reads x where x.user_id = auth.uid() and x.release_id = a.id)
     order by a.published_at desc
     limit 1) r;
$$;
revoke all on function my_whats_new(text) from public, anon;
grant execute on function my_whats_new(text) to authenticated;

create or replace function mark_release_seen(p_id uuid) returns void
language sql security definer set search_path = public as $$
  insert into app_release_reads (user_id, release_id)
  select auth.uid(), p_id where auth.uid() is not null and exists (select 1 from app_releases where id = p_id)
  on conflict do nothing;
$$;
revoke all on function mark_release_seen(uuid) from public, anon;
grant execute on function mark_release_seen(uuid) to authenticated;

-- The platform writes them.
create or replace function platform_save_release(p_id uuid, p_app text, p_title text, p_items text[]) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_items text[];
begin
  if not is_platform_admin() then raise exception 'Only Core Fitness writes release notes.' using errcode = '42501'; end if;
  select coalesce(array_agg(btrim(x)), '{}') into v_items from unnest(p_items) x where btrim(x) <> '';
  if exists (select 1 from unnest(v_items) x where char_length(x) > 200) then raise exception 'Each line is up to 200 characters.'; end if;
  if p_id is null then
    insert into app_releases (app, title, items, created_by) values (p_app, btrim(p_title), v_items, auth.uid()) returning id into v_id;
  else
    update app_releases set app = p_app, title = btrim(p_title), items = v_items where id = p_id returning id into v_id;
    if v_id is null then raise exception 'That release note is gone.'; end if;
  end if;
  return v_id;
end;
$$;
revoke all on function platform_save_release(uuid, text, text, text[]) from public, anon;
grant execute on function platform_save_release(uuid, text, text, text[]) to authenticated;

create or replace function platform_delete_release(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'Only Core Fitness removes release notes.' using errcode = '42501'; end if;
  delete from app_releases where id = p_id;
  if not found then raise exception 'That release note is already gone.'; end if;
end;
$$;
revoke all on function platform_delete_release(uuid) from public, anon;
grant execute on function platform_delete_release(uuid) to authenticated;

create or replace function platform_releases() returns table (id uuid, app text, title text, items text[], published_at timestamptz, seen bigint)
language sql stable security definer set search_path = public as $$
  select a.id, a.app, a.title, a.items, a.published_at, (select count(*) from app_release_reads r where r.release_id = a.id)
    from app_releases a where is_platform_admin() order by a.published_at desc limit 60;
$$;
revoke all on function platform_releases() from public, anon;
grant execute on function platform_releases() to authenticated;

-- The first notes: what changed this week, for each app.
insert into app_releases (app, title, items) values
  ('admin', 'What''s new in your dashboard', array[
    'Your app has a Lobby TV tab: design the screen on your gym''s wall — theme, background photo, panels and a headline.',
    'Check-ins keep working when the internet drops: the kiosk and the desk save scans and record them when it is back.',
    'Notifications now show who each announcement went to, and who opened it.',
    'Rewards shows what members are saving for and what is running low, on every tab.',
    'Your app → AI coach starts with your credits: what your plan gives, your limit and what is left.',
    'Settings, Your plan and Help (questions, ideas and rating Core Fitness) are rebuilt.']),
  ('member', 'What''s new in the app', array[
    'Alerts now reach your phone straight away, even when the app is closed.',
    'Badges can earn you points — and some are secret until you unlock them.',
    'Your gym''s own colours, words and logo are throughout the app.']),
  ('trainer', 'What''s new for coaches', array[
    'A short setup walks you through your photo, your hours and how bookings reach you.',
    'Alerts now reach your phone straight away, even when the app is closed.',
    'Each workout in a program opens straight into its editor.']);

-- ---- 2. saved themes ------------------------------------------------------------------------------------
alter table gym_settings add column if not exists saved_themes jsonb not null default '[]'::jsonb;
comment on column gym_settings.saved_themes is '0212: up to eight named colour pairs [{name, accent, action}], for a gym with the custom-colours unlock.';

create or replace function trg_saved_themes() returns trigger
language plpgsql as $$
declare t jsonb; c text;
begin
  if jsonb_typeof(new.saved_themes) <> 'array' then raise exception 'Saved themes are a list.'; end if;
  if jsonb_array_length(new.saved_themes) > 8 then raise exception 'Up to eight saved themes.'; end if;
  for t in select value from jsonb_array_elements(new.saved_themes) loop
    if jsonb_typeof(t) <> 'object' or char_length(btrim(coalesce(t->>'name', ''))) not between 1 and 30 then
      raise exception 'Each saved theme has a name of up to 30 characters.';
    end if;
    foreach c in array array[t->>'accent', t->>'action'] loop
      if c is null or not (c ~ '^#[0-9A-Fa-f]{6}$' or c in ('violet', 'indigo', 'blue', 'sky', 'cyan', 'teal', 'emerald',
                                                         'lime', 'amber', 'orange', 'red', 'rose', 'fuchsia', 'slate')) then
        raise exception 'A saved theme''s colours are presets or colour codes like #1F8A70.';
      end if;
    end loop;
  end loop;
  return new;
end;
$$;
drop trigger if exists trg_saved_themes on gym_settings;
create trigger trg_saved_themes before insert or update of saved_themes on gym_settings
  for each row execute function trg_saved_themes();
revoke all on function trg_saved_themes() from public, anon, authenticated;

create or replace function save_gym_themes(p_themes jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if storage_role_here() is distinct from 'admin' or not gym_writable() then
    raise exception 'Only the gym owner saves themes.' using errcode = '42501';
  end if;
  if not gym_has_custom_colours(current_gym_id()) then
    raise exception 'Saving your own themes comes with your own colours — unlock them on Your app → Look.' using errcode = '42501';
  end if;
  update gym_settings set saved_themes = coalesce(p_themes, '[]'::jsonb), updated_at = now(), updated_by = auth.uid()
   where gym_id = current_gym_id();
  if not found then raise exception 'This gym has no settings row to save themes to.'; end if;
end;
$$;
revoke all on function save_gym_themes(jsonb) from public, anon;
grant execute on function save_gym_themes(jsonb) to authenticated;

create or replace function my_gym_themes() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when storage_role_here() = 'admin' then jsonb_build_object(
    'unlocked', gym_has_custom_colours(current_gym_id()),
    'themes', coalesce((select s.saved_themes from gym_settings s where s.gym_id = current_gym_id()), '[]'::jsonb)) end;
$$;
revoke all on function my_gym_themes() from public, anon;
grant execute on function my_gym_themes() to authenticated;

-- ---- 3. a coach's first steps -----------------------------------------------------------------------------
alter table trainer_profiles add column if not exists onboarded_at timestamptz;

create or replace function my_coach_setup() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when t.profile_id is null then null else jsonb_build_object(
    'onboarded', t.onboarded_at is not null,
    'photo', (select p.photo_url is not null from profiles p where p.id = auth.uid()),
    'bio', coalesce(btrim(t.bio), '') <> '' and coalesce(btrim(t.specialization), '') <> '',
    'hours', (select count(*) from trainer_availability a where a.trainer_id = auth.uid() and a.gym_id = t.gym_id),
    'pt_approval', (select s.pt_booking_approval from gym_settings s where s.gym_id = t.gym_id),
    'coach_checkin', coalesce((select s.coach_checkin_on from gym_settings s where s.gym_id = t.gym_id), false)) end
    from (select null) x
    left join trainer_profiles t on t.profile_id = auth.uid() and t.gym_id = current_gym_id();
$$;
revoke all on function my_coach_setup() from public, anon;
grant execute on function my_coach_setup() to authenticated;

create or replace function finish_coach_setup() returns void
language plpgsql security definer set search_path = public as $$
begin
  update trainer_profiles set onboarded_at = coalesce(onboarded_at, now())
   where profile_id = auth.uid() and gym_id = current_gym_id();
  if not found then raise exception 'Only a coach of this gym has a setup to finish.' using errcode = '42501'; end if;
end;
$$;
revoke all on function finish_coach_setup() from public, anon;
grant execute on function finish_coach_setup() to authenticated;

-- Coaches already working here are not sent back through it.
update trainer_profiles set onboarded_at = now()
 where onboarded_at is null
   and exists (select 1 from trainer_availability a where a.trainer_id = trainer_profiles.profile_id and a.gym_id = trainer_profiles.gym_id);

create or replace function migration_0212_applied() returns boolean language sql stable as $$ select true $$;
grant execute on function migration_0212_applied() to anon, authenticated;
