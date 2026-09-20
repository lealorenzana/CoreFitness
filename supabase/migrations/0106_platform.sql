-- 0106 — The platform owner's side (SaaS Part C).
--
-- The super admin runs the service: they approve the gyms that apply, suspend
-- one that stops paying, and see how each is doing. They are **not** a gym
-- admin with extra powers — under the Data Privacy Act each gym is the
-- controller of its members' data and Core Fitness is the processor, so this
-- migration gives the platform *counts and status*, never a way to read a
-- member's rows (docs/TENANCY.md).
--
-- Everything here refuses anyone who is not in platform_admins (0097), whose
-- only row is pasted by hand.
--
-- Plan: docs/superpowers/plans/2026-09-20-saas-part-c-platform.md

-- Every platform decision, kept: who suspended which gym and why, when a plan
-- changed, when a gym was let in. The gym's own activity_log is the gym's.
create table if not exists platform_events (
  id         bigint generated always as identity primary key,
  gym_id     uuid references gyms(id) on delete set null,
  action     text not null,
  summary    text not null,
  detail     jsonb,
  actor_id   uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists platform_events_gym_idx on platform_events (gym_id, created_at desc);
alter table platform_events enable row level security;
drop policy if exists platform_events_select on platform_events;
create policy platform_events_select on platform_events for select to authenticated
  using (is_platform_admin());
-- No write policy: only the SECURITY DEFINER functions below write here.

create or replace function platform_log(p_gym uuid, p_action text, p_summary text, p_detail jsonb default null)
returns void language sql security definer set search_path = public as $$
  insert into platform_events (gym_id, action, summary, detail, actor_id)
  values (p_gym, p_action, p_summary, p_detail, auth.uid());
$$;
revoke all on function platform_log(uuid, text, text, jsonb) from public, anon, authenticated;

-- ---- an account with no gym --------------------------------------------------------
-- The platform owner is nobody's member. 0098's profile logger files its line in
-- the account's gym, and there is not one, so creating that account failed on
-- activity_log's NOT NULL. No gym, no gym activity line.

create or replace function log_profile_activity() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_name text := coalesce(nullif(trim(new.first_name || ' ' || new.last_name), ''), new.email);
  v_gym  uuid := case when tg_op = 'INSERT' then coalesce(new.active_gym_id, acting_gym_id())
                      else coalesce(acting_gym_id(), new.active_gym_id) end;
begin
  -- An account that belongs to no gym — the platform owner (0106) — has no gym
  -- activity log to be written to. Creating it must not fail for the want of
  -- one, so there is simply no line.
  if v_gym is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'INSERT' then
    perform log_activity(
      case when new.status = 'pending_approval' then 'member.registered' else 'account.created' end,
      'profile', new.id,
      case when new.role = 'member' then new.id end,
      case when new.status = 'pending_approval'
           then v_name || ' registered and is awaiting approval'
           else v_name || ' was added as ' || new.role::text end,
      jsonb_build_object('role', new.role, 'status', new.status, 'email', new.email),
      v_gym);
    return new;
  end if;

  if new.status is distinct from old.status then
    perform log_activity(
      case
        when old.status = 'pending_approval' and new.status = 'active' then 'member.approved'
        when new.status = 'suspended' then 'member.suspended'
        when new.status = 'archived'  then 'member.archived'
        when old.status in ('suspended','archived') and new.status = 'active' then 'member.reinstated'
        else 'account.status_changed'
      end,
      'profile', new.id,
      case when new.role = 'member' then new.id end,
      v_name || ' — ' || old.status::text || ' → ' || new.status::text,
      jsonb_build_object('from', old.status, 'to', new.status, 'role', new.role),
      v_gym);
  end if;

  -- Rare and significant: someone gained or lost desk access.
  if new.role is distinct from old.role then
    perform log_activity('account.role_changed', 'profile', new.id, null,
      v_name || ' changed from ' || old.role::text || ' to ' || new.role::text,
      jsonb_build_object('from', old.role, 'to', new.role),
      v_gym);
  end if;
  return new;
end;
$$;



-- ---- the gyms, as the platform sees them -------------------------------------------

create or replace function platform_gyms()
returns table (id uuid, name text, slug text, status text, plan text, paid_until date,
               lock_reason text, members int, staff int, created_at timestamptz,
               last_activity timestamptz)
language sql stable security definer set search_path = public as $$
  select g.id, g.name, g.slug, g.status, g.plan, g.paid_until,
         gym_lock_reason(g.id),
         (select count(*)::int from gym_roles r
           where r.gym_id = g.id and r.role = 'member' and r.status = 'active'),
         (select count(*)::int from gym_roles r
           where r.gym_id = g.id and r.role in ('admin', 'staff') and r.status = 'active'),
         g.created_at,
         -- The gym is alive if anyone checked in or paid; a gym with no
         -- activity at all reads NULL, which is the honest answer.
         greatest(
           (select max(a.check_in_time) from attendance a where a.gym_id = g.id),
           (select max(p.created_at) from payments p where p.gym_id = g.id)
         )
    from gyms g
   where is_platform_admin()
   order by g.name;
$$;

create or replace function platform_applications(p_status text default null)
returns setof gym_applications
language sql stable security definer set search_path = public as $$
  select * from gym_applications
   where is_platform_admin()
     and (p_status is null or status = p_status)
   order by created_at desc;
$$;

-- ---- letting a gym in ----------------------------------------------------------------
-- Creating the gym is SQL; inviting its owner needs the Auth admin API, so the
-- approve-gym Edge Function does that half and calls make_gym_owner() after.

create or replace function create_gym(p_name text, p_slug text, p_application uuid default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_gym uuid;
begin
  if not is_platform_admin() then
    raise exception 'Only the platform can create a gym.' using errcode = '42501';
  end if;
  if coalesce(btrim(p_name), '') = '' then
    raise exception 'The gym needs a name.';
  end if;
  if p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(p_slug) not between 3 and 40 then
    raise exception 'The link name can use small letters, numbers and dashes only.';
  end if;
  if exists (select 1 from gyms where slug = p_slug) then
    raise exception 'Another gym already uses the link name "%".', p_slug;
  end if;

  insert into gyms (name, slug, status, plan) values (btrim(p_name), p_slug, 'active', 'trial')
  returning id into v_gym;

  -- Its own plans, point rules, reasons, goal templates, badges and settings,
  -- copied from Gym #1 so the gym opens working rather than empty (0098).
  perform seed_gym_defaults(v_gym);

  if p_application is not null then
    update gym_applications
       set status = 'approved', gym_id = v_gym, decided_by = auth.uid(), decided_at = now()
     where id = p_application and status = 'pending';
  end if;

  perform platform_log(v_gym, 'gym.created', btrim(p_name) || ' was let in',
                       jsonb_build_object('slug', p_slug, 'application', p_application));
  return v_gym;
end;
$$;
revoke all on function create_gym(text, text, uuid) from public, anon;
grant execute on function create_gym(text, text, uuid) to authenticated;

-- The owner of a new gym. Separate from add_person_to_gym() (0104), which acts
-- as a gym's own admin — there is no admin yet at this point.
create or replace function make_gym_owner(p_gym uuid, p_user uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then
    raise exception 'Only the platform can name a gym owner.' using errcode = '42501';
  end if;
  insert into gym_roles (gym_id, user_id, role, status)
  values (p_gym, p_user, 'admin', 'active')
  on conflict (gym_id, user_id) do update set role = 'admin', status = 'active';
  update profiles set active_gym_id = p_gym where id = p_user and active_gym_id is null;
  perform platform_log(p_gym, 'gym.owner_set',
    coalesce((select trim(first_name || ' ' || last_name) from profiles where id = p_user), 'Someone')
      || ' owns ' || coalesce((select name from gyms where id = p_gym), 'the gym'),
    jsonb_build_object('user', p_user));
end;
$$;
revoke all on function make_gym_owner(uuid, uuid) from public, anon;
grant execute on function make_gym_owner(uuid, uuid) to authenticated;

create or replace function reject_application(p_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  if not is_platform_admin() then
    raise exception 'Only the platform can answer an application.' using errcode = '42501';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Say why — the applicant is told.';
  end if;
  update gym_applications
     set status = 'rejected', reason = btrim(p_reason), decided_by = auth.uid(), decided_at = now()
   where id = p_id and status = 'pending'
  returning gym_name into v_name;
  if v_name is null then
    raise exception 'That application has already been answered.';
  end if;
  perform platform_log(null, 'application.rejected', v_name || ' was turned down',
                       jsonb_build_object('reason', btrim(p_reason)));
end;
$$;
revoke all on function reject_application(uuid, text) from public, anon;
grant execute on function reject_application(uuid, text) to authenticated;

-- ---- running the service -----------------------------------------------------------------

create or replace function set_gym_status(p_gym uuid, p_status text, p_reason text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  if not is_platform_admin() then
    raise exception 'Only the platform can suspend or reactivate a gym.' using errcode = '42501';
  end if;
  if p_status not in ('active', 'suspended') then
    raise exception 'A gym is active or suspended.';
  end if;
  -- Suspending stops a gym trading; it is never done without a sentence saying
  -- why, exactly as a member suspension is not (0069).
  if p_status = 'suspended' and coalesce(btrim(p_reason), '') = '' then
    raise exception 'A reason is required to suspend a gym.';
  end if;
  update gyms set status = p_status where id = p_gym returning name into v_name;
  if v_name is null then
    raise exception 'No such gym.';
  end if;
  perform platform_log(p_gym, 'gym.' || p_status,
    v_name || (case when p_status = 'suspended' then ' was suspended' else ' is active again' end),
    jsonb_build_object('reason', nullif(btrim(p_reason), '')));
end;
$$;
revoke all on function set_gym_status(uuid, text, text) from public, anon;
grant execute on function set_gym_status(uuid, text, text) to authenticated;

create or replace function set_gym_plan(p_gym uuid, p_plan text, p_paid_until date)
returns void
language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  if not is_platform_admin() then
    raise exception 'Only the platform can change a gym''s plan.' using errcode = '42501';
  end if;
  if p_plan not in ('trial', 'standard', 'premium') then
    raise exception 'Unknown plan: %', p_plan;
  end if;
  update gyms set plan = p_plan, paid_until = p_paid_until where id = p_gym returning name into v_name;
  if v_name is null then
    raise exception 'No such gym.';
  end if;
  perform platform_log(p_gym, 'gym.plan',
    v_name || ' is on ' || p_plan || coalesce(', paid to ' || p_paid_until::text, ', with no paid-until date'),
    jsonb_build_object('plan', p_plan, 'paid_until', p_paid_until));
end;
$$;
revoke all on function set_gym_plan(uuid, text, date) from public, anon;
grant execute on function set_gym_plan(uuid, text, date) to authenticated;

-- Crash reports across every gym — the platform's own job (0095 files them).
create or replace function platform_crash_reports(p_days int default 14)
returns table (id uuid, gym_id uuid, gym_name text, app text, route text, message text,
               build text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select e.id, e.gym_id, g.name, e.app, e.route, e.message, e.build, e.created_at
    from client_errors e
    left join gyms g on g.id = e.gym_id
   where is_platform_admin()
     and e.created_at > now() - make_interval(days => greatest(1, least(coalesce(p_days, 14), 90)))
   order by e.created_at desc
   limit 500;
$$;

create or replace function platform_events_recent(p_limit int default 100)
returns setof platform_events
language sql stable security definer set search_path = public as $$
  select * from platform_events
   where is_platform_admin()
   order by created_at desc
   limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;

create or replace function migration_0106_applied() returns boolean
language sql immutable as $fn$ select true $fn$;
revoke all on function migration_0106_applied() from public, anon;
grant execute on function migration_0106_applied() to authenticated;
comment on function migration_0106_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0106.sql
