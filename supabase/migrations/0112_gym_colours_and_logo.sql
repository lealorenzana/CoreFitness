-- 0112 — A gym's colour, all the way through.
--
-- 0098 gave a gym one accent, and it replaced violet only. Amber stayed
-- everywhere, because the design note said that role is about meaning rather
-- than brand: violet is "where you are", amber is "what you can do next".
--
-- That reasoning was right about the *roles* and wrong about the *colours*. A
-- gym that picks Rose still gets an amber Book button, so its app is red and
-- yellow rather than theirs — and the owner reads that as the setting not
-- working. The roles are what make the screen legible; which two colours fill
-- them is the gym's business.
--
-- So a gym now picks both:
--
--   accent         where you are / what you have   (was the only one)
--   accent_action  what you can do next            (was always amber)
--
-- `accent_action` defaults to NULL, which means amber — so no existing gym's
-- app changes on paste. A gym that wants an all-red app sets both to a red.
--
-- ---- WHY NOT A COLOUR PICKER ---------------------------------------------------------
--
-- The obvious "more customisation" is a hex field. It is the wrong one here:
-- the member app's type floor is 12px, so a brand colour used as text must
-- clear 4.5:1 on the Nocturne ground, and violet 600 is 3.5:1 — which is why
-- every ramp has a separate 300 step for text. An arbitrary hex would let a gym
-- make its own members' app unreadable, and nothing would catch it.
--
-- So the list grows instead: fourteen curated ramps, each with a text step
-- proven by `node scripts/accent-contrast.mjs` in CI. More choice, and none of
-- it can produce a screen nobody can read.

-- ---- 1. both roles -------------------------------------------------------------------

-- The six new ramps, and `accent_action` beside the original.
alter table gym_settings drop constraint if exists gym_settings_accent_check;
alter table gym_settings add constraint gym_settings_accent_check
  check (accent in ('violet', 'indigo', 'blue', 'sky', 'cyan', 'teal', 'emerald',
                    'lime', 'amber', 'orange', 'red', 'rose', 'fuchsia', 'slate'));

alter table gym_settings add column if not exists accent_action text
  check (accent_action is null or accent_action in
         ('violet', 'indigo', 'blue', 'sky', 'cyan', 'teal', 'emerald',
          'lime', 'amber', 'orange', 'red', 'rose', 'fuchsia', 'slate'));

comment on column gym_settings.accent_action is
  'The colour of "what you can do next" — book, renew, save, send (0112). '
  'NULL means amber, which is what every gym had before this column existed.';

-- ---- 2. the apps read both ------------------------------------------------------------
-- `my_gym_app()` is the phone's one call at launch; `my_gym_context()` is every
-- gate in both apps. Both gain the second colour and the logo, so a shell can
-- paint itself without a second round trip.

-- Dropped first: an extra OUT column changes the row type, which
-- `create or replace` refuses. Both apps call it over PostgREST, so nothing in
-- SQL depends on it between these two statements.
drop function if exists my_gym_app();
create function my_gym_app()
returns table (gym_id uuid, gym_name text, slug text, short_name text, logo_url text,
               accent text, accent_action text, points_name text, points_name_short text,
               welcome_message text, join_policy text, join_code text,
               modules jsonb)
language sql stable security definer set search_path = public as $$
  select g.id, g.name, g.slug, s.short_name, s.logo_url,
         coalesce(s.accent, 'violet'), s.accent_action,
         w.points_name, w.points_name_short, w.welcome_message,
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

drop function if exists my_gym_context();
create function my_gym_context()
returns table (gym_id uuid, gym_name text, slug text, role user_role, status text,
               lock_reason text, short_name text, logo_url text, accent text, gym_count int,
               onboarded boolean, onboarding_step text, gym_state text, accent_action text)
language sql stable security definer set search_path = public as $$
  select g.id, g.name, g.slug, r.role, r.status,
         gym_lock_reason(g.id), s.short_name, s.logo_url, coalesce(s.accent, 'violet'),
         (select count(*)::int from gym_roles x where x.user_id = auth.uid() and x.status <> 'archived'),
         g.onboarded_at is not null,
         g.onboarding_step,
         gym_state(g.id),
         s.accent_action
    from profiles p
    join gym_roles r on r.user_id = p.id and r.gym_id = p.active_gym_id
    join gyms g on g.id = r.gym_id
    left join gym_settings s on s.gym_id = g.id
   where p.id = auth.uid();
$$;

-- ---- 3. the gym a member is about to join, in its own colours --------------------------
-- `gym_by_slug` and `list_gyms` are read before anybody signs in, so the sign-up
-- screen can wear the gym's colours and name rather than the platform's. Both
-- were already public; both gain the second colour and the gym's own name.

drop function if exists gym_by_slug(text);
create function gym_by_slug(p_slug text)
returns table (id uuid, slug text, name text, short_name text, logo_url text,
               accent text, accent_action text, join_policy text)
language sql stable security definer set search_path = public as $$
  select g.id, g.slug, g.name, s.short_name, s.logo_url, coalesce(s.accent, 'violet'),
         s.accent_action, coalesce(s.join_policy, 'open')
  from gyms g left join gym_settings s on s.gym_id = g.id
  where g.status = 'active' and lower(g.slug) = lower(btrim(p_slug));
$$;
grant execute on function gym_by_slug(text) to anon, authenticated;

drop function if exists list_gyms(text);
create function list_gyms(p_search text default null)
returns table (id uuid, slug text, name text, short_name text, logo_url text,
               accent text, accent_action text)
language sql stable security definer set search_path = public as $$
  select g.id, g.slug, g.name, s.short_name, s.logo_url,
         coalesce(s.accent, 'violet'), s.accent_action
  from gyms g left join gym_settings s on s.gym_id = g.id
  where g.status = 'active'
    and coalesce(s.join_policy, 'open') = 'open'
    and (p_search is null or g.name ilike '%' || p_search || '%' or g.slug ilike '%' || p_search || '%')
  order by g.name
  limit 50;
$$;
grant execute on function list_gyms(text) to anon, authenticated;

-- ---- 4. the owner saves them -----------------------------------------------------------
-- Branding is identity, so admin only — the same rule as the gym's name and its
-- words. `updateGymSettings` already writes `accent` through RLS; this exists so
-- the pair is written together and validated in one place.

create or replace function save_gym_look(
  p_accent text, p_accent_action text default null, p_logo_url text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare v_gym uuid := acting_gym_id();
begin
  if v_gym is null then
    raise exception 'No gym to change.' using errcode = '42501';
  end if;
  if get_my_role() is distinct from 'admin' then
    raise exception 'Only the gym owner can change how the app looks.' using errcode = '42501';
  end if;

  perform act_as_gym(v_gym);
  update gym_settings
     set accent        = coalesce(nullif(btrim(p_accent), ''), accent),
         accent_action = nullif(btrim(p_accent_action), ''),
         -- A logo is cleared by passing the empty string, and left alone by
         -- passing NULL — otherwise saving a colour would wipe the logo.
         logo_url      = case when p_logo_url is null then logo_url
                              else nullif(btrim(p_logo_url), '') end
   where gym_id = v_gym;
end;
$$;
revoke all on function save_gym_look(text, text, text) from public, anon;
grant execute on function save_gym_look(text, text, text) to authenticated;

-- ---- the probe's marker ----------------------------------------------------------------

create or replace function migration_0112_applied() returns boolean
language sql immutable as $fn$ select true $fn$;
revoke all on function migration_0112_applied() from public, anon;
grant execute on function migration_0112_applied() to authenticated;
comment on function migration_0112_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0112.sql
