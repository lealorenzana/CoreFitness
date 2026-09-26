-- 0116 — The logo a gym uploads is finally visible to its members.
--
-- 0067 gave a gym a logo. 0107's wizard asks for one on its first screen, 0112
-- put it in `my_gym_app()`, and 0114 added a second place to change it. A gym
-- owner can upload a logo from two screens, see it in a preview on both, and
-- **no member of that gym ever sees it anywhere**: `logo_url` reaches the phone
-- and not one component renders it.
--
-- That is the shape CLAUDE.md names outright — a control writing a field
-- nothing reads is a lie — and this one had four migrations behind it. The gym
-- owner's reasonable conclusion is that the upload is broken.
--
-- Two gaps, one here and one in the app:
--
--   * `my_gyms()` (0097) returns id, name, slug, role, status and nothing else,
--     so the gym picker — the one screen whose entire job is "which of these is
--     mine" — could not draw a gym's mark even if it wanted to. Fixed here.
--
--   * Today, the picker and Settings render nothing. Fixed in the app; no
--     migration can do it, which is exactly why this went unnoticed while
--     every report about it came back green.
--
-- Nothing is added to the *data*: `short_name`, `logo_url` and `accent` are
-- 0067 and 0098 columns, joined here so one call answers the picker instead of
-- one call per gym.

drop function if exists my_gyms();
create function my_gyms()
returns table (gym_id uuid, name text, slug text, role user_role, status text,
               short_name text, logo_url text, accent text)
language sql stable security definer set search_path = public as $$
  select g.id, g.name, g.slug, r.role, r.status,
         s.short_name, s.logo_url, coalesce(s.accent, 'violet')
  from gym_roles r
  join gyms g on g.id = r.gym_id
  -- Left, not inner: a gym created and never set up has no settings row, and
  -- it must still appear in its own owner's list. Dropping it there would be
  -- the "not seeing your gym at all reads as the app lost it" failure that
  -- docs/TENANCY.md already warns about for a suspended gym.
  left join gym_settings s on s.gym_id = g.id
  where r.user_id = auth.uid() and r.status <> 'archived'
  order by g.name;
$$;
revoke all on function my_gyms() from public, anon;
grant execute on function my_gyms() to authenticated;

-- ---- the probe's marker ----------------------------------------------------------------

create or replace function migration_0116_applied() returns boolean
language sql immutable as $fn$ select true $fn$;
revoke all on function migration_0116_applied() from public, anon;
grant execute on function migration_0116_applied() to authenticated;
comment on function migration_0116_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0116.sql
