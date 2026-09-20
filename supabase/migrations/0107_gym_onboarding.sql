-- 0107 — A new gym's first day.
--
-- 0106 lets a gym in, but `create_gym()` stops at the gym: it copies the rules
-- (plans, point rules, reasons, badges) and deliberately does NOT copy the
-- identity — a new gym must never inherit Core Fitness's address, phone or logo
-- on its own receipts. So a freshly created gym is real but blank, and nobody
-- can sign into it at all, because making a login needs the Auth admin key that
-- only an Edge Function holds (approve-gym).
--
-- This migration adds the two things the apps need to finish that story:
--
--   1. `gyms.onboarded_at` — when the owner finished setting the gym up. NULL
--      means "never set up", and the admin app sends its owner to /admin/setup
--      instead of a dashboard full of blanks. It is a timestamp rather than a
--      flag so the platform log and this column agree on *when*.
--   2. The two reads that answer "does this gym still need doing?" —
--      `my_gym_context()` gains `onboarded`, and `platform_gyms()` gains
--      `owners` and `onboarded`, so the platform owner can see at a glance
--      which gyms have nobody in them yet.
--
-- Existing gyms must not meet a setup wizard for a gym they have run for a
-- year, so the backfill stamps every gym that has already been configured —
-- evidenced by an address or a phone number, which `seed_gym_defaults()` never
-- copies and only a human ever types.

-- ---- 1. the column --------------------------------------------------------------------

alter table gyms add column if not exists onboarded_at timestamptz;

comment on column gyms.onboarded_at is
  'When the gym owner finished first-run setup (0107). NULL = the admin app still sends them to /admin/setup.';

update gyms g
   set onboarded_at = g.created_at
 where g.onboarded_at is null
   and exists (
     select 1 from gym_settings s
      where s.gym_id = g.id
        and (coalesce(btrim(s.address), '') <> '' or coalesce(btrim(s.phone), '') <> '')
   );

-- ---- 2. "who am I, and where" now answers "and is this gym set up?" --------------------
-- Unchanged from 0104 apart from the last column; both apps read this function
-- and neither reads gyms directly.
--
-- Dropped first, not replaced: adding an OUT parameter changes the row type,
-- and `create or replace` refuses that outright ("cannot change return type of
-- existing function"). Nothing depends on it in SQL — both apps call it over
-- PostgREST — so the drop is safe between these two statements.

drop function if exists my_gym_context();
create function my_gym_context()
returns table (gym_id uuid, gym_name text, slug text, role user_role, status text,
               lock_reason text, short_name text, logo_url text, accent text, gym_count int,
               onboarded boolean)
language sql stable security definer set search_path = public as $$
  select g.id, g.name, g.slug, r.role, r.status,
         gym_lock_reason(g.id), s.short_name, s.logo_url, coalesce(s.accent, 'violet'),
         (select count(*)::int from gym_roles x where x.user_id = auth.uid() and x.status <> 'archived'),
         g.onboarded_at is not null
    from profiles p
    join gym_roles r on r.user_id = p.id and r.gym_id = p.active_gym_id
    join gyms g on g.id = r.gym_id
    left join gym_settings s on s.gym_id = g.id
   where p.id = auth.uid();
$$;

-- ---- 3. the owner finishes setting up -------------------------------------------------
-- The admin's own hand, in their own gym. Idempotent: the first stamp stands, so
-- revisiting the wizard later (Settings does the same edits) never rewrites the
-- date the gym opened.

create or replace function finish_gym_setup()
returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  v_gym uuid := acting_gym_id();
  v_when timestamptz;
begin
  if v_gym is null then
    raise exception 'No gym to set up.' using errcode = '42501';
  end if;
  if get_my_role() is distinct from 'admin' then
    raise exception 'Only the gym owner can finish setting the gym up.' using errcode = '42501';
  end if;

  update gyms
     set onboarded_at = coalesce(onboarded_at, now())
   where id = v_gym
  returning onboarded_at into v_when;

  -- Logged once, on the transition — a second call changes nothing and says nothing.
  if v_when >= now() - interval '1 minute' then
    perform platform_log(v_gym, 'gym.set_up',
      coalesce((select name from gyms where id = v_gym), 'A gym') || ' finished setting up',
      jsonb_build_object('by', auth.uid()));
  end if;
  return v_when;
end;
$$;
revoke all on function finish_gym_setup() from public, anon;
grant execute on function finish_gym_setup() to authenticated;

-- ---- 4. the platform's list says who is still waiting ---------------------------------
-- `owners` = 0 means the gym exists and nobody can sign into it: the platform
-- app shows "Invite the owner" rather than a plan button on that row.

drop function if exists platform_gyms();
create function platform_gyms()
returns table (id uuid, name text, slug text, status text, plan text, paid_until date,
               lock_reason text, members int, staff int, created_at timestamptz,
               last_activity timestamptz, owners int, onboarded boolean)
language sql stable security definer set search_path = public as $$
  select g.id, g.name, g.slug, g.status, g.plan, g.paid_until,
         gym_lock_reason(g.id),
         (select count(*)::int from gym_roles r
           where r.gym_id = g.id and r.role = 'member' and r.status = 'active'),
         (select count(*)::int from gym_roles r
           where r.gym_id = g.id and r.role in ('admin', 'staff') and r.status = 'active'),
         g.created_at,
         greatest(
           (select max(a.check_in_time) from attendance a where a.gym_id = g.id),
           (select max(p.created_at) from payments p where p.gym_id = g.id)
         ),
         (select count(*)::int from gym_roles r
           where r.gym_id = g.id and r.role = 'admin' and r.status = 'active'),
         g.onboarded_at is not null
    from gyms g
   where is_platform_admin()
   order by g.name;
$$;

-- ---- 5. inviting the owner: what the Edge Function needs -------------------------------
-- approve-gym creates the login with the service-role key, then calls
-- make_gym_owner() (0106) as the platform owner. Before it spends an account on
-- an email address, it asks this: is that person already here?
--
-- Deliberately narrow — it answers only about one address, for the platform
-- owner, and returns an id, never a row. The platform never reads member data
-- (docs/TENANCY.md), and an owner-to-be is a member of no gym yet anyway.

create or replace function platform_find_user(p_email text)
returns uuid
language sql stable security definer set search_path = public as $$
  select id from profiles
   where is_platform_admin() and lower(email) = lower(btrim(p_email))
   limit 1;
$$;
revoke all on function platform_find_user(text) from public, anon;
grant execute on function platform_find_user(text) to authenticated;

-- ---- the probe's marker ----------------------------------------------------------------

create or replace function migration_0107_applied() returns boolean
language sql immutable as $fn$ select true $fn$;
revoke all on function migration_0107_applied() from public, anon;
grant execute on function migration_0107_applied() to authenticated;
comment on function migration_0107_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0107.sql
