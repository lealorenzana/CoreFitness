-- 0114 — A gym names its own things, and owns its own address.
--
-- Two gaps, both found by using the system rather than reading it.
--
-- ---- 1. THE OWNER COULD NOT REACH HALF OF WHAT THEY HAD SET ---------------------------
--
-- 0112 gave a gym two colour roles. `save_gym_look()` writes both. But the only
-- screen that ever called it with the second one was the **setup wizard**, and
-- a gym leaves that screen once and never returns. So a gym that picked Rose
-- during onboarding and later wanted its buttons to match had no way to say so:
-- the column existed, the function existed, and nothing in the running app
-- could reach it.
--
-- That is fixed in the admin app, not here — but it is the reason this
-- migration exists, because the same shape shows up twice more:
--
--   * `gym_settings.tagline` (0067) is written by Settings and read by nothing.
--   * `gyms.slug` is the gym's public address — /join/<slug> — and only a
--     **platform admin** could change it. A gym that was created as
--     "core-fitness" and later renamed "G Fitness" therefore hands its members
--     a link that says somebody else's name. That is not a cosmetic problem:
--     the link is printed on posters.
--
-- So: `set_gym_slug()` lets the owner move their own front door, with the same
-- validation the platform's rename already applies, and the same warning — old
-- links stop working, which is a fact about the world, not a setting.
--
-- ---- 2. EVERY GYM CALLED ITS PEOPLE THE SAME THINGS -----------------------------------
--
-- 0110 let a gym rename its points and nothing else. But "Coaches" is a choice:
-- a boxing gym has trainers, a CrossFit box has coaches, a studio has
-- instructors. A gym selling a class calls it a class; one selling an hour with
-- a coach calls it a session.
--
-- `gym_settings.vocabulary` is a small jsonb of exactly six nouns. Not a free
-- map: the allowed keys are checked by a constraint, so a typo in the client
-- becomes an error rather than a word that silently never appears. Not separate
-- columns either — six columns that all mean "a word" would be six migrations
-- the next time somebody wants a seventh.
--
-- **Blank means the default, and the default is the English word.** A gym that
-- never touches this reads exactly as it does today, which is the rule every
-- customisation here follows: a feature nobody configured must not change.

-- ---- 1. the words ---------------------------------------------------------------------

-- Immutable, so it can sit in a CHECK — a subquery cannot. The key set lives
-- here rather than in the application, because the application is not what the
-- database trusts.
create or replace function gym_vocabulary_keys_ok(p jsonb) returns boolean
language sql immutable as $$
  select p is null or (
    jsonb_typeof(p) = 'object'
    and not exists (
      select 1 from jsonb_object_keys(p) k
       where k not in ('member', 'members', 'trainer', 'trainers', 'class', 'classes')
    )
    -- Every value a short string. A number or an object here would reach a
    -- screen as "[object Object]" and nobody would know why.
    and not exists (
      select 1 from jsonb_each(p) e
       where jsonb_typeof(e.value) <> 'string' or length(e.value #>> '{}') not between 1 and 30
    )
  );
$$;

alter table gym_settings add column if not exists vocabulary jsonb;
alter table gym_settings drop constraint if exists gym_settings_vocabulary_check;
alter table gym_settings add constraint gym_settings_vocabulary_check
  check (gym_vocabulary_keys_ok(vocabulary));

comment on column gym_settings.vocabulary is
  'What this gym calls its people and its sessions (0114). Only the six keys in '
  'gym_vocabulary_keys_ok() are allowed; a missing key means the English word.';

-- The defaults, in one place, so the apps never carry their own copy.
create or replace function gym_vocabulary_defaults() returns jsonb
language sql immutable as $$
  select jsonb_build_object(
    'member',   'member',   'members',  'members',
    'trainer',  'coach',    'trainers', 'coaches',
    'class',    'class',    'classes',  'classes'
  );
$$;

-- Always all six keys, so a caller never has to know which were overridden.
create or replace function gym_vocabulary(p_gym uuid default null) returns jsonb
language sql stable security definer set search_path = public as $$
  select gym_vocabulary_defaults() || coalesce(
    (select s.vocabulary from gym_settings s
      where s.gym_id = coalesce(p_gym, current_gym_id())),
    '{}'::jsonb);
$$;
revoke all on function gym_vocabulary(uuid) from public;
grant execute on function gym_vocabulary(uuid) to anon, authenticated;

-- Admin only, like every other piece of identity. A word that matches the
-- default is stored as nothing, so "reset it" and "never set it" are the same
-- row rather than two states that drift.
create or replace function save_gym_vocabulary(p_words jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_gym   uuid := acting_gym_id();
  v_clean jsonb := '{}'::jsonb;
  v_def   jsonb := gym_vocabulary_defaults();
  v_key   text;
  v_val   text;
begin
  if v_gym is null then
    raise exception 'No gym to change.' using errcode = '42501';
  end if;
  if get_my_role() is distinct from 'admin' then
    raise exception 'Only the gym owner can change what things are called.'
      using errcode = '42501';
  end if;
  if p_words is null or jsonb_typeof(p_words) <> 'object' then
    raise exception 'Expected an object of words.';
  end if;

  for v_key in select k from jsonb_object_keys(p_words) k loop
    if not v_def ? v_key then
      raise exception 'There is no word called "%" to change.', v_key;
    end if;
    -- `->>` would happily turn the number 123 into the string '123', and a gym
    -- whose coaches are called "123" would have no idea where that came from.
    -- A word is a string or it is a mistake.
    if jsonb_typeof(p_words -> v_key) not in ('string', 'null') then
      raise exception 'The word for "%" has to be text.', v_key;
    end if;
    v_val := btrim(coalesce(p_words ->> v_key, ''));
    if length(v_val) > 30 then
      raise exception 'Each word is 30 characters or fewer; "%" is longer.', v_key;
    end if;
    -- Blank, or the default typed back in, both mean "not set".
    if v_val <> '' and lower(v_val) is distinct from lower(v_def ->> v_key) then
      v_clean := v_clean || jsonb_build_object(v_key, v_val);
    end if;
  end loop;

  perform act_as_gym(v_gym);
  update gym_settings set vocabulary = nullif(v_clean, '{}'::jsonb) where gym_id = v_gym;

  perform log_activity('gym.vocabulary', 'gym_settings', null, null,
    case when v_clean = '{}'::jsonb
      then 'Reset to the standard words'
      else 'Renamed ' || (select string_agg(k, ', ' order by k) from jsonb_object_keys(v_clean) k)
    end,
    v_clean, v_gym);

  return gym_vocabulary(v_gym);
end;
$$;
revoke all on function save_gym_vocabulary(jsonb) from public, anon;
grant execute on function save_gym_vocabulary(jsonb) to authenticated;

-- ---- 2. the address -------------------------------------------------------------------
--
-- Deliberately the *same* rules as `platform_rename_gym()`: lowercase letters,
-- digits and single dashes, 3–40 characters, unique across every gym. Two
-- different rule sets for one column is how a link that works in one screen
-- becomes a 404 from another.
--
-- `gym_writable()` is consulted through `act_as_gym` + the restrictive policies
-- on `gyms`… except `gyms` is not a tenant table, so this checks the lock
-- itself. A suspended gym cannot move its door, and neither can a support
-- session: 0113 makes `gym_writable()` false while Core Fitness is looking, and
-- this function honours it explicitly rather than hoping a policy will.

create or replace function set_gym_slug(p_slug text) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_gym  uuid := acting_gym_id();
  v_old  text;
  v_new  text := lower(btrim(coalesce(p_slug, '')));
begin
  if v_gym is null then
    raise exception 'No gym to change.' using errcode = '42501';
  end if;
  if get_my_role() is distinct from 'admin' then
    raise exception 'Only the gym owner can change your link.' using errcode = '42501';
  end if;
  if not gym_writable(v_gym) then
    raise exception 'Your gym cannot be changed right now: %',
      coalesce(gym_lock_reason(v_gym), 'Core Fitness is looking at it')
      using errcode = '42501';
  end if;

  select slug into v_old from gyms where id = v_gym;
  if v_new = v_old then
    return v_old;
  end if;
  if v_new !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(v_new) not between 3 and 40 then
    raise exception 'A link uses small letters, numbers and dashes only, 3 to 40 characters.';
  end if;
  if exists (select 1 from gyms where slug = v_new and id <> v_gym) then
    raise exception 'Another gym already uses "%". Try something else.', v_new;
  end if;

  update gyms set slug = v_new where id = v_gym;

  perform log_activity('gym.slug', 'gyms', v_gym, null,
    'Your link is now /join/' || v_new || ' — every /join/' || v_old
      || ' link already shared has stopped working',
    jsonb_build_object('from', v_old, 'to', v_new), v_gym);
  -- The platform hears about it too: a support conversation that starts "your
  -- link is broken" is answered by this line.
  perform platform_log(v_gym, 'gym.slug',
    'moved from /join/' || v_old || ' to /join/' || v_new,
    jsonb_build_object('from', v_old, 'to', v_new));

  return v_new;
end;
$$;
revoke all on function set_gym_slug(text) from public, anon;
grant execute on function set_gym_slug(text) to authenticated;

-- ---- 3. the apps read both ------------------------------------------------------------
--
-- Dropped first, every time: an extra OUT column changes the row type and
-- `create or replace` refuses it. Both apps reach these over PostgREST, so
-- nothing in SQL depends on them between the drop and the create.

drop function if exists my_gym_app();
create function my_gym_app()
returns table (gym_id uuid, gym_name text, slug text, short_name text, logo_url text,
               accent text, accent_action text, points_name text, points_name_short text,
               welcome_message text, tagline text, vocabulary jsonb,
               join_policy text, join_code text, modules jsonb)
language sql stable security definer set search_path = public as $$
  select g.id, g.name, g.slug, s.short_name, s.logo_url,
         coalesce(s.accent, 'violet'), s.accent_action,
         w.points_name, w.points_name_short, w.welcome_message,
         nullif(btrim(coalesce(s.tagline, '')), ''),
         gym_vocabulary(g.id),
         coalesce(s.join_policy, 'open'),
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

-- The two public reads gain the tagline, so the screen where somebody picks a
-- gym can say what that gym is rather than only what it is called.

drop function if exists gym_by_slug(text);
create function gym_by_slug(p_slug text)
returns table (id uuid, slug text, name text, short_name text, logo_url text,
               accent text, accent_action text, tagline text, join_policy text)
language sql stable security definer set search_path = public as $$
  select g.id, g.slug, g.name, s.short_name, s.logo_url, coalesce(s.accent, 'violet'),
         s.accent_action, nullif(btrim(coalesce(s.tagline, '')), ''),
         coalesce(s.join_policy, 'open')
  from gyms g left join gym_settings s on s.gym_id = g.id
  where g.status = 'active' and lower(g.slug) = lower(btrim(p_slug));
$$;
grant execute on function gym_by_slug(text) to anon, authenticated;

drop function if exists list_gyms(text);
create function list_gyms(p_search text default null)
returns table (id uuid, slug text, name text, short_name text, logo_url text,
               accent text, accent_action text, tagline text)
language sql stable security definer set search_path = public as $$
  select g.id, g.slug, g.name, s.short_name, s.logo_url,
         coalesce(s.accent, 'violet'), s.accent_action,
         nullif(btrim(coalesce(s.tagline, '')), '')
  from gyms g left join gym_settings s on s.gym_id = g.id
  where g.status = 'active'
    and coalesce(s.join_policy, 'open') = 'open'
    and (p_search is null or g.name ilike '%' || p_search || '%' or g.slug ilike '%' || p_search || '%')
  order by g.name
  limit 50;
$$;
grant execute on function list_gyms(text) to anon, authenticated;

-- ---- the probe's marker ----------------------------------------------------------------

create or replace function migration_0114_applied() returns boolean
language sql immutable as $fn$ select true $fn$;
revoke all on function migration_0114_applied() from public, anon;
grant execute on function migration_0114_applied() to authenticated;
comment on function migration_0114_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0114.sql
