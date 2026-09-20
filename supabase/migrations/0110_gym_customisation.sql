-- 0110 — A gym's app is the gym's, not Core Fitness's.
--
-- Tenancy separated the *data* (0097–0105) and the platform learned to sell
-- (0108). What was still shared was the thing members actually look at: every
-- gym's app called its points "CORE Points", offered a Coaches tab to a gym
-- with no coaches, and told a member of any gym in the country to "Visit Core
-- Fitness Mamburao to pay".
--
-- This migration gives a gym owner three things they could not have before:
--
--   1. Their own words   — what their points are called, what greets a member.
--   2. Their own shape   — which parts of the system their gym actually runs.
--   3. Their own door    — how a member joins: found in a list, by a link, by a
--                          code on a poster, or not at all.
--
-- ---- THE THREE LAYERS --------------------------------------------------------------
--
-- After this there are three separate questions behind any feature, and they
-- are deliberately not merged, because the honest answer on screen differs:
--
--   platform → gym    gym_plan_allows()   0108   "your plan does not include it"
--   gym → itself      gym_module_on()     here   the gym does not do this
--   gym → member      plan_allows()       0049   "your membership does not include it"
--
-- The first two mean a member can never have it, however much they pay, so the
-- app HIDES it — a lock that will never open is an advertisement for something
-- that does not exist. The third means they could upgrade, so the app LOCKS AND
-- EXPLAINS, which is 0049's rule and stays exactly as it was.
--
-- `gym_module_on()` folds the first two together, because a gym cannot choose
-- to run something its plan does not include, and a member never needs to know
-- which of the two it was.

-- ============================================================================
-- 1. THE GYM'S OWN WORDS
-- ============================================================================

alter table gym_settings add column if not exists points_name text;
alter table gym_settings add column if not exists points_name_short text;
alter table gym_settings add column if not exists welcome_message text;

comment on column gym_settings.points_name is
  'What this gym calls its points, e.g. "CORE Points" (0110). NULL falls back to "Points" — '
  'the app never prints another gym''s word for them.';

-- Gym #1 keeps the name its members already know. Every other gym starts with
-- the plain word and renames it if they want to — a new gym inheriting "CORE
-- Points" would be exactly the bug this migration exists to fix.
update gym_settings
   set points_name = coalesce(points_name, 'CORE Points'),
       points_name_short = coalesce(points_name_short, 'points')
 where gym_id = gym_one();

-- `seed_gym_defaults()` copies a gym's *rules*, never its identity (0098). The
-- points name is identity: it is on screen, in the member's own language.
-- Nothing to do here — the column simply stays NULL for a new gym, and
-- `gym_words()` below answers "Points".

create or replace function gym_words(p_gym uuid default null)
returns table (points_name text, points_name_short text, welcome_message text)
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(btrim(s.points_name), ''), 'Points'),
         coalesce(nullif(btrim(s.points_name_short), ''),
                  lower(coalesce(nullif(btrim(s.points_name), ''), 'points'))),
         nullif(btrim(s.welcome_message), '')
    from gym_settings s
   where s.gym_id = coalesce(p_gym, current_gym_id());
$$;
revoke all on function gym_words(uuid) from public, anon;
grant execute on function gym_words(uuid) to authenticated;

-- ============================================================================
-- 2. THE GYM'S OWN SHAPE
-- ============================================================================
-- Same keys as `platform_features` (0108), on purpose: the platform decides
-- what a gym *may* run, the gym decides what it *does* run, and one vocabulary
-- covers both. A gym with no coaches turns 'coaching' off and the Coaches tab
-- stops existing — for its members, its desk and its own owner.

create table if not exists gym_modules (
  gym_id      uuid not null references gyms(id) on delete cascade,
  feature_key text not null references platform_features(key) on delete cascade,
  enabled     boolean not null default true,
  changed_at  timestamptz not null default now(),
  changed_by  uuid references profiles(id),
  primary key (gym_id, feature_key)
);

create index if not exists idx_gym_modules_gym on gym_modules(gym_id);

alter table gym_modules enable row level security;

-- It is one gym's table, so it joins the tenancy layer rather than inventing
-- its own rule: `tenancy_gym_tables()` is the list 0099's four RESTRICTIVE
-- policies are applied from, and the isolation harness fails any table that is
-- in neither that list nor the deliberately-global one.
create or replace function tenancy_gym_tables() returns text[] language sql immutable as $$
  select array['account_status_events','achievement_unlocks','achievements','activity_log',
    'assistant_conversations','assistant_messages','attendance','body_measurements','bookings',
    'cancellation_reasons','cash_closeouts','challenge_participants','challenges','class_templates',
    'class_waitlist','classes','event_registrations','events','fitness_goals','freemium_trials',
    'goal_templates','gym_modules','gym_plans','gym_settings','invoice_counters','member_profiles',
    'member_share_prefs','membership_events','membership_plans','memberships','notifications',
    'payments','pending_registrations','plan_features','point_ledger','point_rules','pt_sessions',
    'refund_rules','renewal_requests','reward_redemptions','rewards','saved_resources',
    'trainer_availability','trainer_credentials','trainer_feedback','trainer_profiles',
    'trainer_ratings','workout_logs','workout_plans','workout_routine_exercises','workout_routines',
    'workout_sets']::text[]
$$;

do $$
begin
  execute 'drop policy if exists tenant_select on gym_modules';
  execute 'drop policy if exists tenant_insert on gym_modules';
  execute 'drop policy if exists tenant_update on gym_modules';
  execute 'drop policy if exists tenant_delete on gym_modules';
  execute 'create policy tenant_select on gym_modules as restrictive for select to anon, authenticated
             using (gym_id = current_gym_id())';
  execute 'create policy tenant_insert on gym_modules as restrictive for insert to anon, authenticated
             with check (gym_id = current_gym_id() and gym_writable())';
  execute 'create policy tenant_update on gym_modules as restrictive for update to anon, authenticated
             using (gym_id = current_gym_id() and gym_writable())
             with check (gym_id = current_gym_id())';
  execute 'create policy tenant_delete on gym_modules as restrictive for delete to anon, authenticated
             using (gym_id = current_gym_id() and gym_writable())';
end $$;

-- Readable by anyone signed in: every screen in both apps asks what to draw.
-- The restrictive layer above narrows that to their own gym, so this permissive
-- policy does not repeat the condition — one place decides which gym, and it is
-- the same place for all fifty tables.
drop policy if exists gym_modules_read on gym_modules;
create policy gym_modules_read on gym_modules for select
  using (auth.uid() is not null);

-- No insert, update or delete policy for anybody. `set_gym_module()` below is
-- the only writer, and it checks the role *and* the plan — a row written around
-- it could switch on something the gym's plan does not include.

-- A gym with no rows behaves exactly as it did: `gym_module_on()` reads a
-- missing row as ON, so this migration turns nothing off for anybody.
create or replace function gym_module_on(p_gym uuid, p_feature text)
returns boolean
language sql stable security definer set search_path = public as $$
  select
    -- The gym's plan first: a gym cannot run what it has not been sold.
    gym_plan_allows(coalesce(p_gym, current_gym_id()), p_feature)
    and coalesce(
      (select m.enabled from gym_modules m
        where m.gym_id = coalesce(p_gym, current_gym_id()) and m.feature_key = p_feature),
      true);
$$;
revoke all on function gym_module_on(uuid, text) from public, anon;
grant execute on function gym_module_on(uuid, text) to authenticated;

-- What to draw, and — for the owner's own settings screen — why. Three states:
--   'on'        the gym runs it
--   'off'       the gym has turned it off; the owner can turn it back on
--   'not_sold'  the gym's Core Fitness plan does not include it; only the
--               platform can change that, so the screen says so and does not
--               offer a switch that would do nothing.
create or replace function my_gym_modules()
returns table (feature_key text, label text, description text,
               state text, enabled boolean, sort_order int)
language sql stable security definer set search_path = public as $$
  select f.key, f.label, f.description,
         case when not gym_plan_allows(current_gym_id(), f.key) then 'not_sold'
              when coalesce(m.enabled, true) then 'on'
              else 'off' end,
         gym_module_on(current_gym_id(), f.key),
         f.sort_order
    from platform_features f
    left join gym_modules m on m.feature_key = f.key and m.gym_id = current_gym_id()
   where current_gym_id() is not null
   order by f.sort_order;
$$;
revoke all on function my_gym_modules() from public, anon;
grant execute on function my_gym_modules() to authenticated;

create or replace function set_gym_module(p_feature text, p_enabled boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_gym uuid := acting_gym_id();
  v_label text;
begin
  if v_gym is null then
    raise exception 'No gym to change.' using errcode = '42501';
  end if;
  if get_my_role() is distinct from 'admin' then
    raise exception 'Only the gym owner can change what the gym runs.' using errcode = '42501';
  end if;
  select label into v_label from platform_features where key = p_feature;
  if v_label is null then
    raise exception 'There is no part of the system called "%".', p_feature;
  end if;
  -- Turning something ON that the plan does not include would be a switch that
  -- reads back as off — a control writing a flag nothing honours (CLAUDE.md).
  if p_enabled and not gym_plan_allows(v_gym, p_feature) then
    raise exception 'Your Core Fitness plan does not include %. Ask us to move you to a plan that does.',
      v_label using errcode = '42501';
  end if;

  insert into gym_modules (gym_id, feature_key, enabled, changed_at, changed_by)
  values (v_gym, p_feature, coalesce(p_enabled, true), now(), auth.uid())
  on conflict (gym_id, feature_key) do update
    set enabled = excluded.enabled, changed_at = now(), changed_by = auth.uid();

  perform log_activity('gym.module', 'gym_settings', null, null,
    v_label || case when p_enabled then ' switched on' else ' switched off' end,
    jsonb_build_object('feature', p_feature, 'enabled', p_enabled), v_gym);
end;
$$;
revoke all on function set_gym_module(text, boolean) from public, anon;
grant execute on function set_gym_module(text, boolean) to authenticated;

-- ============================================================================
-- 3. THE GYM'S OWN DOOR
-- ============================================================================
-- Until now every active gym was listed to every member of every gym, and
-- anyone signed in could ask to join any of them. That is right for a gym that
-- wants walk-ins and wrong for one that does not, and it was never the gym's
-- choice. Three policies, and the gym picks:
--
--   'open'        listed in the app's gym list; anyone may ask to join
--   'code'        not listed; joinable with the gym's link or its join code
--   'closed'      not listed and not joinable; the front desk creates accounts
--
-- 'open' is the default, because that is exactly what every gym does today and
-- a migration must not quietly change how anybody's members sign up.

alter table gym_settings add column if not exists join_policy text not null default 'open'
  check (join_policy in ('open', 'code', 'closed'));

-- A short code a gym can print on a poster or read down a phone. Not a secret —
-- it is a convenience over typing a slug — but unguessable enough that a gym on
-- 'code' is not found by trying.
alter table gym_settings add column if not exists join_code text;

create unique index if not exists idx_gym_settings_join_code
  on gym_settings(upper(join_code)) where join_code is not null;

create or replace function new_join_code() returns text
language sql volatile as $$
  -- No look-alike characters: a code is read out loud and typed by hand.
  select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789',
                           (floor(random() * 31) + 1)::int, 1), '')
    from generate_series(1, 6);
$$;

create or replace function set_join_policy(p_policy text, p_new_code boolean default false)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_gym  uuid := acting_gym_id();
  v_code text;
  v_try  int := 0;
begin
  if v_gym is null then
    raise exception 'No gym to change.' using errcode = '42501';
  end if;
  if get_my_role() is distinct from 'admin' then
    raise exception 'Only the gym owner can change how members join.' using errcode = '42501';
  end if;
  if p_policy not in ('open', 'code', 'closed') then
    raise exception 'Unknown joining rule: %', p_policy;
  end if;

  select join_code into v_code from gym_settings where gym_id = v_gym;

  -- A gym on 'code' must have one, and asking for a new one replaces it —
  -- which is how a gym whose code got out takes it back.
  if p_new_code or (p_policy = 'code' and v_code is null) then
    loop
      v_try := v_try + 1;
      v_code := new_join_code();
      exit when not exists (select 1 from gym_settings where upper(join_code) = upper(v_code));
      if v_try > 20 then
        raise exception 'Could not find an unused join code. Try again.';
      end if;
    end loop;
  end if;

  perform act_as_gym(v_gym);
  update gym_settings set join_policy = p_policy, join_code = v_code where gym_id = v_gym;

  perform log_activity('gym.join_policy', 'gym_settings', null, null,
    case p_policy
      when 'open'   then 'Anyone can find this gym and ask to join'
      when 'code'   then 'Only people with the link or the join code can ask to join'
      else               'Nobody can ask to join; the desk creates every account'
    end,
    jsonb_build_object('policy', p_policy, 'code_changed', p_new_code), v_gym);
  return v_code;
end;
$$;
revoke all on function set_join_policy(text, boolean) from public, anon;
grant execute on function set_join_policy(text, boolean) to authenticated;

-- Listed gyms only. A gym on 'code' or 'closed' is not browsable — that is the
-- whole point of choosing it — but it is still reachable by its own link,
-- which `gym_by_slug()` below serves.
drop function if exists list_gyms(text);
create function list_gyms(p_search text default null)
returns table (id uuid, slug text, name text, short_name text, logo_url text, accent text)
language sql stable security definer set search_path = public as $$
  select g.id, g.slug, g.name, s.short_name, s.logo_url, s.accent
  from gyms g left join gym_settings s on s.gym_id = g.id
  where g.status = 'active'
    and coalesce(s.join_policy, 'open') = 'open'
    and (p_search is null or g.name ilike '%' || p_search || '%' or g.slug ilike '%' || p_search || '%')
  order by g.name
  limit 50;
$$;
grant execute on function list_gyms(text) to anon, authenticated;

-- One gym, by its link or its code. Answers for a gym that is not listed —
-- that is what the link and the code are for — but never for a 'closed' one,
-- and never for a suspended one.
create or replace function gym_by_slug(p_slug text)
returns table (id uuid, slug text, name text, short_name text, logo_url text,
               accent text, join_policy text)
language sql stable security definer set search_path = public as $$
  select g.id, g.slug, g.name, s.short_name, s.logo_url, coalesce(s.accent, 'violet'),
         coalesce(s.join_policy, 'open')
  from gyms g left join gym_settings s on s.gym_id = g.id
  where g.status = 'active' and lower(g.slug) = lower(btrim(p_slug));
$$;
grant execute on function gym_by_slug(text) to anon, authenticated;

create or replace function gym_by_code(p_code text)
returns table (id uuid, slug text, name text, short_name text, logo_url text, accent text)
language sql stable security definer set search_path = public as $$
  select g.id, g.slug, g.name, s.short_name, s.logo_url, coalesce(s.accent, 'violet')
  from gyms g join gym_settings s on s.gym_id = g.id
  where g.status = 'active'
    and s.join_policy <> 'closed'
    and s.join_code is not null
    and upper(s.join_code) = upper(btrim(p_code));
$$;
grant execute on function gym_by_code(text) to anon, authenticated;

-- `request_to_join` gains the policy. Everything else about it is 0100's.
create or replace function request_to_join(p_gym uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me     uuid := auth.uid();
  p        profiles;
  v_policy text;
  v_name   text;
begin
  if v_me is null then
    raise exception 'Sign in first.';
  end if;
  select g.name, coalesce(s.join_policy, 'open') into v_name, v_policy
    from gyms g left join gym_settings s on s.gym_id = g.id
   where g.id = p_gym and g.status = 'active';
  if v_name is null then
    raise exception 'That gym is not taking sign-ups right now.';
  end if;
  if v_policy = 'closed' then
    raise exception '% creates its members'' accounts at the front desk. Visit the gym and they will set you up.',
      v_name using errcode = '42501';
  end if;
  if exists (select 1 from gym_roles where gym_id = p_gym and user_id = v_me) then
    raise exception 'You have already joined or asked to join that gym.';
  end if;
  select * into p from profiles where id = v_me;
  perform act_as_gym(p_gym);

  insert into gym_roles (gym_id, user_id, role, status)
  values (p_gym, v_me, 'member', 'pending_approval');
  insert into member_profiles (gym_id, profile_id, qr_code)
  values (p_gym, v_me, v_me::text)
  on conflict (gym_id, profile_id) do nothing;
  insert into pending_registrations (gym_id, first_name, last_name, email, phone, auth_user_id)
  values (p_gym, p.first_name, p.last_name, p.email, p.phone, v_me)
  on conflict (gym_id, email) do nothing;

  perform notify_once(r.user_id, 'system', 'New member request',
           coalesce(nullif(trim(p.first_name || ' ' || p.last_name), ''), 'Someone')
             || ' asked to join the gym.',
           '/members', 'join:' || p_gym || ':' || v_me)
    from gym_roles r
   where r.gym_id = p_gym and r.role in ('admin', 'staff') and r.status = 'active';

  perform act_as_gym(null);
end;
$$;
revoke all on function request_to_join(uuid) from public, anon;
grant execute on function request_to_join(uuid) to authenticated;

-- ============================================================================
-- 4. ONE CALL FOR THE MEMBER APP
-- ============================================================================
-- The phone app needs brand, words and shape on every launch. Three round trips
-- on a Philippine mobile connection is three chances to be slow, so it is one.

create or replace function my_gym_app()
returns table (gym_id uuid, gym_name text, slug text, short_name text, logo_url text,
               accent text, points_name text, points_name_short text,
               welcome_message text, join_policy text, join_code text,
               modules jsonb)
language sql stable security definer set search_path = public as $$
  select g.id, g.name, g.slug, s.short_name, s.logo_url, coalesce(s.accent, 'violet'),
         w.points_name, w.points_name_short, w.welcome_message,
         coalesce(s.join_policy, 'open'),
         -- The code is the gym's to hand out, so only its own desk sees it.
         case when get_my_role() in ('admin', 'staff') then s.join_code end,
         coalesce((
           select jsonb_object_agg(f.key, gym_module_on(g.id, f.key))
             from platform_features f
         ), '{}'::jsonb)
    from gyms g
    left join gym_settings s on s.gym_id = g.id
    cross join lateral gym_words(g.id) w
   where g.id = current_gym_id();
$$;
revoke all on function my_gym_app() from public, anon;
grant execute on function my_gym_app() to authenticated;

-- The owner's own edits to their words. Identity, so admin only.
create or replace function save_gym_words(
  p_points_name text, p_points_short text default null, p_welcome text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare v_gym uuid := acting_gym_id();
begin
  if v_gym is null then
    raise exception 'No gym to change.' using errcode = '42501';
  end if;
  if get_my_role() is distinct from 'admin' then
    raise exception 'Only the gym owner can change what things are called.' using errcode = '42501';
  end if;
  if length(coalesce(btrim(p_points_name), '')) > 30
     or length(coalesce(btrim(p_points_short), '')) > 30 then
    raise exception 'A name for your points is 30 characters or fewer.';
  end if;
  if length(coalesce(btrim(p_welcome), '')) > 280 then
    raise exception 'The welcome line is 280 characters or fewer.';
  end if;

  perform act_as_gym(v_gym);
  update gym_settings
     set points_name       = nullif(btrim(p_points_name), ''),
         points_name_short = nullif(btrim(p_points_short), ''),
         welcome_message   = nullif(btrim(p_welcome), '')
   where gym_id = v_gym;
end;
$$;
revoke all on function save_gym_words(text, text, text) from public, anon;
grant execute on function save_gym_words(text, text, text) to authenticated;

-- ---- the probe's marker ----------------------------------------------------------------

create or replace function migration_0110_applied() returns boolean
language sql immutable as $fn$ select true $fn$;
revoke all on function migration_0110_applied() from public, anon;
grant execute on function migration_0110_applied() to authenticated;
comment on function migration_0110_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0110.sql
