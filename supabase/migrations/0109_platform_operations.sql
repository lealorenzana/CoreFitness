-- 0109 — Running the service, not just watching it.
--
-- 0106 gave the platform owner a list of gyms and two levers: suspend, and
-- change the plan. Everything else a service actually needs doing was a trip to
-- the SQL editor, or impossible:
--
--   * a gym could not be renamed, and its link name was fixed at creation
--   * there was no way to see who owns a gym, or to reach them
--   * a gym owner who lost their password could not be helped at all (that one
--     needs the Auth admin key, so it is the reset-gym-password Edge Function
--     rather than anything in here — it asks platform_gym_people() below who
--     may be reset, so the two cannot disagree)
--   * a crash you had already fixed stayed on the list for ever
--   * there were no service-wide numbers — only per-gym counts
--   * a second platform admin meant hand-writing an INSERT
--
-- The line this migration does not cross is the one in docs/TENANCY.md: the
-- platform is the *processor* of a gym's data, not its controller (RA 10173).
-- `platform_gym_people()` therefore returns a gym's admins and staff — the
-- platform's own counterparties, the people it invoices and supports — and
-- never its members, coaches or their data. The isolation harness asserts that.

-- ============================================================================
-- 1. A GYM'S NAME AND ITS LINK
-- ============================================================================
-- The name lives in two places by design (0098's trg_gym_settings_name keeps
-- `gyms.name` in step with `gym_settings.gym_name`), so this writes the
-- settings row and lets that trigger do its half — rather than writing both and
-- inventing a second source of truth.
--
-- Changing a slug breaks every /join/<slug> link already printed on a poster,
-- so it is deliberately a separate argument the caller must pass again.

create or replace function platform_rename_gym(p_gym uuid, p_name text, p_slug text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare v_old_name text; v_old_slug text;
begin
  if not is_platform_admin() then
    raise exception 'Only the platform can rename a gym.' using errcode = '42501';
  end if;
  select name, slug into v_old_name, v_old_slug from gyms where id = p_gym;
  if v_old_name is null then
    raise exception 'That gym does not exist.';
  end if;
  if coalesce(btrim(p_name), '') = '' or length(btrim(p_name)) not between 2 and 80 then
    raise exception 'A gym name is between 2 and 80 characters.';
  end if;

  perform act_as_gym(p_gym);
  update gym_settings set gym_name = btrim(p_name) where gym_id = p_gym;
  -- A gym with no settings row yet (created, never set up) still gets renamed.
  update gyms set name = btrim(p_name) where id = p_gym;

  if p_slug is not null and btrim(p_slug) <> v_old_slug then
    if btrim(p_slug) !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(btrim(p_slug)) not between 3 and 40 then
      raise exception 'A link name uses small letters, numbers and dashes only.';
    end if;
    if exists (select 1 from gyms where slug = btrim(p_slug) and id <> p_gym) then
      raise exception 'Another gym already uses the link name "%".', btrim(p_slug);
    end if;
    update gyms set slug = btrim(p_slug) where id = p_gym;
    perform platform_log(p_gym, 'gym.renamed',
      v_old_name || ' is now ' || btrim(p_name) || ', at /join/' || btrim(p_slug)
        || ' (was /join/' || v_old_slug || ' — old links stop working)',
      jsonb_build_object('from', v_old_name, 'to', btrim(p_name),
                         'from_slug', v_old_slug, 'to_slug', btrim(p_slug)));
  else
    perform platform_log(p_gym, 'gym.renamed',
      v_old_name || ' is now ' || btrim(p_name),
      jsonb_build_object('from', v_old_name, 'to', btrim(p_name)));
  end if;
  perform act_as_gym(null);
end;
$$;
revoke all on function platform_rename_gym(uuid, text, text) from public, anon;
grant execute on function platform_rename_gym(uuid, text, text) to authenticated;

-- ============================================================================
-- 2. WHO RUNS A GYM
-- ============================================================================
-- Admins and staff only, and nothing but a name, an email and a role. These are
-- the people the platform bills and supports; a gym's members are its own
-- business and never appear here (docs/TENANCY.md). Asserted in the harness.

create or replace function platform_gym_people(p_gym uuid)
returns table (user_id uuid, first_name text, last_name text, email text,
               role text, status text, is_owner boolean)
language sql stable security definer set search_path = public as $$
  select p.id, p.first_name, p.last_name, p.email, r.role::text, r.status,
         r.role = 'admin'
    from gym_roles r
    join profiles p on p.id = r.user_id
   where is_platform_admin()
     and r.gym_id = p_gym
     -- The whole point of the filter. A member or a coach is not the
     -- platform's to look at, and this is the only place it could leak.
     and r.role in ('admin', 'staff')
   order by (r.role = 'admin') desc, p.first_name, p.last_name;
$$;
revoke all on function platform_gym_people(uuid) from public, anon;
grant execute on function platform_gym_people(uuid) to authenticated;

-- One gym's story, for a detail panel: counts, money and dates — never rows.
create or replace function platform_gym_detail(p_gym uuid)
returns table (id uuid, name text, slug text, status text, plan text, plan_name text,
               paid_until date, days_left int, lock_reason text,
               created_at timestamptz, onboarded_at timestamptz,
               members int, staff int, owners int, trainers int,
               classes int, checkins_30d int, payments_30d int,
               paid_total numeric, last_paid_on date,
               address text, phone text, email text)
language sql stable security definer set search_path = public as $$
  select g.id, g.name, g.slug, g.status, g.plan, pp.name,
         g.paid_until,
         case when g.paid_until is null then null
              else (g.paid_until - (now() at time zone 'Asia/Manila')::date)::int end,
         gym_lock_reason(g.id),
         g.created_at, g.onboarded_at,
         (select count(*)::int from gym_roles r where r.gym_id = g.id and r.role = 'member'  and r.status = 'active'),
         (select count(*)::int from gym_roles r where r.gym_id = g.id and r.role = 'staff'   and r.status = 'active'),
         (select count(*)::int from gym_roles r where r.gym_id = g.id and r.role = 'admin'   and r.status = 'active'),
         (select count(*)::int from gym_roles r where r.gym_id = g.id and r.role = 'trainer' and r.status = 'active'),
         (select count(*)::int from classes c where c.gym_id = g.id),
         (select count(*)::int from attendance a where a.gym_id = g.id
           and a.check_in_time > now() - interval '30 days'),
         (select count(*)::int from payments x where x.gym_id = g.id
           and x.created_at > now() - interval '30 days'),
         coalesce((select sum(x.amount) from gym_payments x where x.gym_id = g.id), 0),
         (select x.paid_on from gym_payments x where x.gym_id = g.id
           order by x.paid_on desc limit 1),
         -- The gym's own contact details, which it typed in at setup. This is
         -- how the platform reaches a gym it needs to talk to.
         s.address, s.phone, s.email
    from gyms g
    left join platform_plans pp on pp.key = g.plan
    left join gym_settings s on s.gym_id = g.id
   where is_platform_admin() and g.id = p_gym;
$$;
revoke all on function platform_gym_detail(uuid) from public, anon;
grant execute on function platform_gym_detail(uuid) to authenticated;

-- ============================================================================
-- 3. CRASHES YOU HAVE ALREADY DEALT WITH
-- ============================================================================
-- A list that only grows stops being read. Resolving is per *message*, not per
-- row: fifty copies of one broken screen are one problem, and fixing it should
-- clear all fifty — including the ones that arrive in the minutes before the
-- fix is deployed.

alter table client_errors add column if not exists resolved_at timestamptz;
alter table client_errors add column if not exists resolved_by uuid references profiles(id);

create index if not exists idx_client_errors_unresolved
  on client_errors(created_at desc) where resolved_at is null;

create or replace function resolve_crashes(p_app text, p_message text)
returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not is_platform_admin() then
    raise exception 'Only the platform can clear a crash report.' using errcode = '42501';
  end if;
  update client_errors
     set resolved_at = now(), resolved_by = auth.uid()
   where app = p_app and message = p_message and resolved_at is null;
  get diagnostics n = row_count;
  perform platform_log(null, 'crash.resolved',
    'Marked ' || n || ' report(s) handled: ' || left(coalesce(p_message, ''), 120),
    jsonb_build_object('app', p_app, 'message', p_message, 'rows', n));
  return n;
end;
$$;
revoke all on function resolve_crashes(text, text) from public, anon;
grant execute on function resolve_crashes(text, text) to authenticated;

-- Replaces 0106's version: it gains the stack and honours `resolved_at`.
-- Unresolved by default, because that is the list worth looking at.
drop function if exists platform_crash_reports(int);
create function platform_crash_reports(p_days int default 14, p_include_resolved boolean default false)
returns table (id uuid, gym_id uuid, gym_name text, app text, route text, message text,
               stack text, build text, created_at timestamptz, resolved_at timestamptz)
language sql stable security definer set search_path = public as $$
  select e.id, e.gym_id, g.name, e.app, e.route, e.message, e.stack, e.build,
         e.created_at, e.resolved_at
    from client_errors e
    left join gyms g on g.id = e.gym_id
   where is_platform_admin()
     and e.created_at > now() - make_interval(days => greatest(1, least(coalesce(p_days, 14), 90)))
     and (coalesce(p_include_resolved, false) or e.resolved_at is null)
   order by e.created_at desc
   limit 500;
$$;
revoke all on function platform_crash_reports(int, boolean) from public, anon;
grant execute on function platform_crash_reports(int, boolean) to authenticated;

-- ============================================================================
-- 4. THE SERVICE, IN NUMBERS
-- ============================================================================
-- Counts and sums across every gym — the one legitimate cross-gym read, and the
-- reason it is legitimate is that it resolves to numbers. No gym is named, no
-- member is counted twice, and nothing here identifies a person.

create or replace function platform_overview()
returns table (gyms int, gyms_live int, gyms_suspended int, gyms_locked int,
               gyms_unclaimed int, gyms_unset_up int,
               members int, staff int, trainers int,
               checkins_30d int, new_gyms_30d int,
               applications_waiting int, crashes_open int,
               revenue_this_month numeric, revenue_all_time numeric,
               overdue_gyms int)
language sql stable security definer set search_path = public as $$
  select
    (select count(*)::int from gyms),
    (select count(*)::int from gyms where status = 'active' and gym_lock_reason(id) is null),
    (select count(*)::int from gyms where status = 'suspended'),
    (select count(*)::int from gyms where gym_lock_reason(id) is not null),
    -- A gym nobody can sign into, and a gym whose owner has not set it up:
    -- the two states that mean "created, but not really open yet" (0107).
    (select count(*)::int from gyms g where not exists (
       select 1 from gym_roles r where r.gym_id = g.id and r.role = 'admin' and r.status = 'active')),
    (select count(*)::int from gyms where onboarded_at is null),
    (select count(*)::int from gym_roles where role = 'member'  and status = 'active'),
    (select count(*)::int from gym_roles where role in ('admin','staff') and status = 'active'),
    (select count(*)::int from gym_roles where role = 'trainer' and status = 'active'),
    (select count(*)::int from attendance where check_in_time > now() - interval '30 days'),
    (select count(*)::int from gyms where created_at > now() - interval '30 days'),
    (select count(*)::int from gym_applications where status = 'pending'),
    (select count(*)::int from client_errors where resolved_at is null
       and created_at > now() - interval '14 days'),
    (select coalesce(sum(amount), 0) from gym_payments
      where paid_on >= date_trunc('month', (now() at time zone 'Asia/Manila')::date)),
    (select coalesce(sum(amount), 0) from gym_payments),
    (select count(*)::int from gyms
      where paid_until is not null
        and paid_until < (now() at time zone 'Asia/Manila')::date)
  where is_platform_admin();
$$;
revoke all on function platform_overview() from public, anon;
grant execute on function platform_overview() to authenticated;

-- ============================================================================
-- 5. WHO ELSE IS THE PLATFORM
-- ============================================================================
-- Adding the first row of platform_admins is, and stays, a deliberate manual
-- INSERT in the SQL editor — there is no bootstrap function, because a function
-- that can make someone a platform admin without already being one is the only
-- back door this schema could have. Adding the *second* is a different act, made
-- by someone who already holds the keys, and it is logged.

create or replace function list_platform_admins()
returns table (user_id uuid, first_name text, last_name text, email text, is_me boolean)
language sql stable security definer set search_path = public as $$
  select p.id, p.first_name, p.last_name, p.email, p.id = auth.uid()
    from platform_admins a join profiles p on p.id = a.user_id
   where is_platform_admin()
   order by p.first_name, p.last_name;
$$;
revoke all on function list_platform_admins() from public, anon;
grant execute on function list_platform_admins() to authenticated;

create or replace function add_platform_admin(p_email text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_name text;
begin
  if not is_platform_admin() then
    raise exception 'Only the platform can add a platform admin.' using errcode = '42501';
  end if;
  select id, trim(first_name || ' ' || last_name) into v_id, v_name
    from profiles where lower(email) = lower(btrim(p_email)) limit 1;
  if v_id is null then
    raise exception 'Nobody signed in to Core Fitness uses the address "%". They need an account first.',
      btrim(p_email);
  end if;
  insert into platform_admins (user_id) values (v_id) on conflict do nothing;
  perform platform_log(null, 'platform.admin_added',
    coalesce(nullif(v_name, ''), btrim(p_email)) || ' can now run the platform',
    jsonb_build_object('user', v_id, 'email', btrim(p_email)));
  return v_id;
end;
$$;
revoke all on function add_platform_admin(text) from public, anon;
grant execute on function add_platform_admin(text) to authenticated;

create or replace function remove_platform_admin(p_user uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_left int; v_name text;
begin
  if not is_platform_admin() then
    raise exception 'Only the platform can remove a platform admin.' using errcode = '42501';
  end if;
  if p_user = auth.uid() then
    raise exception 'You cannot remove yourself. Ask another platform admin to do it.';
  end if;
  select count(*) into v_left from platform_admins where user_id <> p_user;
  if v_left = 0 then
    -- Nobody could ever run the platform again, and there is no bootstrap
    -- function to undo it. This is the one door that must not close.
    raise exception 'That is the last platform admin. Add another before removing this one.';
  end if;
  select trim(first_name || ' ' || last_name) into v_name from profiles where id = p_user;
  delete from platform_admins where user_id = p_user;
  perform platform_log(null, 'platform.admin_removed',
    coalesce(nullif(v_name, ''), 'Someone') || ' can no longer run the platform',
    jsonb_build_object('user', p_user));
end;
$$;
revoke all on function remove_platform_admin(uuid) from public, anon;
grant execute on function remove_platform_admin(uuid) to authenticated;

-- ---- the probe's marker ----------------------------------------------------------------

create or replace function migration_0109_applied() returns boolean
language sql immutable as $fn$ select true $fn$;
revoke all on function migration_0109_applied() from public, anon;
grant execute on function migration_0109_applied() to authenticated;
comment on function migration_0109_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0109.sql
