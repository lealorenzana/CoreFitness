-- 0097 — Tenancy core. Core Fitness becomes a service for many gyms.
--
-- A person is global (profiles); a role is per gym (gym_roles). Each person
-- has a *current gym* (profiles.active_gym_id), set only through
-- set_active_gym(), which refuses a gym where they hold no role.
-- get_my_role() keeps its name and its meaning — "my role" — but now means
-- "my role in my current gym", so every policy and function that calls it
-- becomes gym-aware in this one change. Everything that exists today is
-- Gym #1, and everyone's current gym is Gym #1, so nothing changes on screen.
--
-- Transition: until the apps move (Part B) they still write profiles.role and
-- profiles.status. trg_mirror_profile_role copies those writes into gym_roles,
-- so an approval or a promotion made from today's admin app still takes effect.
-- The clean-up migration after Part B drops the mirror.
--
-- Spec: docs/superpowers/specs/2026-09-20-multi-tenant-saas-design.md
-- Plan: docs/superpowers/plans/2026-09-20-saas-part-a-tenancy.md (Task 2)

-- ---- gyms ------------------------------------------------------------------

create table if not exists gyms (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique
              check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 3 and 40),
  name        text not null check (length(name) between 2 and 80),
  status      text not null default 'active' check (status in ('active', 'suspended')),
  plan        text not null default 'trial' check (plan in ('trial', 'standard', 'premium')),
  paid_until  date,
  created_at  timestamptz not null default now()
);

create or replace function gym_one() returns uuid language sql immutable as
$$ select 'c0f1e55e-0000-4000-8000-000000000001'::uuid $$;
comment on function gym_one() is
  'Gym #1: the gym that existed before tenancy. Used by the backfill and the transition mirror only.';

-- Gym #1 keeps its current name. It is the platform owner's own gym, so it
-- starts on the top plan with no paid-until date (never overdue).
insert into gyms (id, slug, name, plan, paid_until)
select gym_one(), 'core-fitness',
       coalesce((select nullif(trim(gym_name), '') from gym_settings limit 1), 'Core Fitness'),
       'premium', null
on conflict (id) do nothing;

-- ---- roles per gym -----------------------------------------------------------

create table if not exists gym_roles (
  gym_id     uuid not null references gyms(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  role       user_role not null,
  status     text not null default 'pending_approval'
             check (status in ('active', 'pending_approval', 'suspended', 'archived')),
  created_at timestamptz not null default now(),
  primary key (gym_id, user_id)
);
create index if not exists gym_roles_user_idx on gym_roles (user_id);

insert into gym_roles (gym_id, user_id, role, status)
select gym_one(), p.id, p.role,
       case when p.status in ('active', 'pending_approval', 'suspended', 'archived')
            then p.status else 'active' end
from profiles p
on conflict (gym_id, user_id) do nothing;

alter table profiles add column if not exists active_gym_id uuid references gyms(id) on delete set null;
update profiles set active_gym_id = gym_one() where active_gym_id is null;
-- Transition: today's create-member/-staff/-trainer Edge Functions insert a
-- profile without a gym, and that account must work as it does now. Part B
-- passes the gym explicitly; the clean-up migration drops this default.
alter table profiles alter column active_gym_id set default gym_one();

-- ---- the platform ------------------------------------------------------------

-- The platform owner. No policy lets anyone insert here: the first row is
-- pasted by hand in the SQL editor.
create table if not exists platform_admins (
  user_id    uuid primary key references profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- "Register your gym" on the website. Anyone may apply; only the platform reads.
create table if not exists gym_applications (
  id              uuid primary key default gen_random_uuid(),
  gym_name        text not null check (length(gym_name) between 2 and 80),
  owner_name      text not null check (length(owner_name) between 2 and 80),
  email           text not null check (email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' and length(email) <= 120),
  phone           text not null check (length(phone) between 7 and 20),
  address         text check (length(address) <= 200),
  member_estimate integer check (member_estimate between 0 and 100000),
  message         text check (length(message) <= 1000),
  status          text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reason          text check (length(reason) <= 500),
  gym_id          uuid references gyms(id),
  decided_by      uuid references profiles(id),
  decided_at      timestamptz,
  created_at      timestamptz not null default now()
);

-- ---- the current gym ---------------------------------------------------------

-- The caller's current gym, and only while they still hold a role there — a
-- person removed from a gym loses it at once, whatever active_gym_id says.
create or replace function current_gym_id() returns uuid
language sql stable security definer set search_path = public as $$
  select p.active_gym_id from profiles p
  where p.id = auth.uid()
    and exists (select 1 from gym_roles r where r.user_id = p.id and r.gym_id = p.active_gym_id);
$$;

create or replace function is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (select 1 from platform_admins where user_id = auth.uid());
$$;

-- Same name, same meaning ("my role"), now in my current gym.
create or replace function get_my_role() returns user_role
language sql stable security definer set search_path = public as $$
  select r.role from gym_roles r
  join profiles p on p.id = r.user_id and p.active_gym_id = r.gym_id
  where r.user_id = auth.uid();
$$;

create or replace function set_active_gym(p_gym uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in first.';
  end if;
  if not exists (select 1 from gym_roles where user_id = auth.uid() and gym_id = p_gym
                 and status in ('active', 'pending_approval')) then
    raise exception 'You are not part of that gym.';
  end if;
  update profiles set active_gym_id = p_gym where id = auth.uid();
end;
$$;

-- The gym picker: every gym I belong to, with my role there.
create or replace function my_gyms()
returns table (gym_id uuid, name text, slug text, role user_role, status text)
language sql stable security definer set search_path = public as $$
  select g.id, g.name, g.slug, r.role, r.status
  from gym_roles r join gyms g on g.id = r.gym_id
  where r.user_id = auth.uid() and r.status <> 'archived'
  order by g.name;
$$;

-- The sign-up gym list, for anyone. Active gyms and public fields only. 0098
-- adds the branding once gym_settings is per gym.
create or replace function list_gyms(p_search text default null)
returns table (id uuid, slug text, name text)
language sql stable security definer set search_path = public as $$
  select g.id, g.slug, g.name from gyms g
  where g.status = 'active'
    and (p_search is null or g.name ilike '%' || p_search || '%' or g.slug ilike '%' || p_search || '%')
  order by g.name
  limit 50;
$$;

-- ---- transition mirror -------------------------------------------------------

create or replace function trg_mirror_profile_role() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_gym uuid := coalesce(new.active_gym_id, current_gym_id(), gym_one());
begin
  if tg_op = 'UPDATE' and new.role is not distinct from old.role
     and new.status is not distinct from old.status then
    return new;
  end if;
  insert into gym_roles (gym_id, user_id, role, status)
  values (v_gym, new.id, new.role,
          case when new.status in ('active', 'pending_approval', 'suspended', 'archived')
               then new.status else 'active' end)
  on conflict (gym_id, user_id) do update set role = excluded.role, status = excluded.status;
  return new;
end;
$$;
drop trigger if exists mirror_profile_role on profiles;
create trigger mirror_profile_role after insert or update of role, status on profiles
  for each row execute function trg_mirror_profile_role();

-- ---- rules -------------------------------------------------------------------

alter table gyms             enable row level security;
alter table gym_roles        enable row level security;
alter table platform_admins  enable row level security;
alter table gym_applications enable row level security;

-- A gym is visible to its own people. The platform app reads and changes gyms
-- through SECURITY DEFINER functions (Part C), so there is no write policy.
drop policy if exists gyms_select on gyms;
create policy gyms_select on gyms for select to authenticated
  using (exists (select 1 from gym_roles r where r.gym_id = gyms.id and r.user_id = auth.uid()));

-- My own roles everywhere, and everyone's role in my current gym. Writes go
-- through set_account_status() and the Edge Functions: nobody grants themself a role.
drop policy if exists gym_roles_select on gym_roles;
create policy gym_roles_select on gym_roles for select to authenticated
  using (user_id = auth.uid() or gym_id = current_gym_id());

drop policy if exists platform_admins_select on platform_admins;
create policy platform_admins_select on platform_admins for select to authenticated
  using (user_id = auth.uid());

drop policy if exists gym_applications_insert on gym_applications;
create policy gym_applications_insert on gym_applications for insert to anon, authenticated
  with check (status = 'pending' and gym_id is null and decided_by is null
              and decided_at is null and reason is null);
drop policy if exists gym_applications_select on gym_applications;
create policy gym_applications_select on gym_applications for select to authenticated
  using (is_platform_admin());

revoke all on function list_gyms(text) from public;
grant execute on function list_gyms(text) to anon, authenticated;
revoke all on function set_active_gym(uuid) from public, anon;
revoke all on function my_gyms() from public, anon;
grant execute on function set_active_gym(uuid), my_gyms() to authenticated;

create or replace function migration_0097_applied() returns boolean
language sql immutable as $fn$ select true $fn$;
revoke all on function migration_0097_applied() from public, anon;
grant execute on function migration_0097_applied() to authenticated;
comment on function migration_0097_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0097.sql
