-- 0024 — plans that genuinely do not expire.
--
-- 0004 seeded Free Access with `duration_days = 3650`. Nothing about the free
-- tier is meant to run out in 2036; ten years was shorthand for "forever",
-- written into a column that had no way to say so. The member app then did the
-- only thing it could with that number and rendered **3647 days remaining** in
-- the largest type on the home screen.
--
-- So the column learns to say it. `duration_days = NULL` means the plan does
-- not expire.
--
-- ---------------------------------------------------------------------------
-- Why `memberships` needs a flag and not just a NULL expiry
-- ---------------------------------------------------------------------------
-- `memberships.expiry_date` has been nullable since 0001, and NULL there
-- already means something: **not activated yet**. A registration creates a
-- `pending` row with no start and no expiry, and `membership_is_usable()`
-- correctly refuses it. If NULL also meant "never expires", every pending
-- registration would become a lifetime membership the moment this ran.
--
-- `never_expires` is therefore explicit. A usable membership is one that is
-- active/cancelled AND (never expires OR has a future expiry date) — the two
-- NULL cases stay distinguishable.
--
-- ---------------------------------------------------------------------------
-- Signature changes
-- ---------------------------------------------------------------------------
-- `membership_is_usable` gains a third argument and `current_membership_of`
-- gains a returned column, so both are dropped and recreated (PostgreSQL will
-- not `create or replace` a change of return type). The only callers are the
-- two entitlement triggers from 0017, recreated below in the same script.

-- ============ PLANS ============
alter table membership_plans alter column duration_days drop not null;

alter table membership_plans drop constraint if exists membership_plans_duration_positive;
alter table membership_plans
  add constraint membership_plans_duration_positive
    check (duration_days is null or duration_days > 0) not valid;

comment on column membership_plans.duration_days is
  'Days a payment buys. NULL = the plan does not expire (free/lifetime tiers).';

-- ============ MEMBERSHIPS ============
alter table memberships
  add column if not exists never_expires boolean not null default false;

comment on column memberships.never_expires is
  'Set when activated on a plan with duration_days IS NULL. Distinguishes a '
  'lifetime membership (expiry_date NULL, never_expires true) from one that '
  'has not been activated yet (expiry_date NULL, never_expires false).';

-- ============ ACCESS ============
drop function if exists membership_is_usable(membership_status, date);

-- `cancelled` deliberately does NOT get the lifetime exemption.
--
-- Cancelling means "stop renewing, but honour the days already paid for" (0017).
-- On a non-expiring plan there are no paid-for days to honour — nobody bought a
-- term — so treating cancelled+lifetime as usable would make Cancel a button
-- that does nothing, with no way to stop a free member at all. Cancelling a
-- lifetime membership therefore ends access at once, and the admin dialog says
-- so before you press it.
create function membership_is_usable(
  m_status membership_status,
  m_expiry date,
  m_never_expires boolean
)
returns boolean language sql immutable as $$
  select case m_status
    when 'active' then
      m_never_expires
        or (m_expiry is not null and m_expiry >= (now() at time zone 'Asia/Manila')::date)
    when 'cancelled' then
      m_expiry is not null and m_expiry >= (now() at time zone 'Asia/Manila')::date
    else false
  end;
$$;

drop function if exists current_membership_of(uuid);

create function current_membership_of(p_member uuid)
returns table (status membership_status, expiry_date date, plan_id uuid, never_expires boolean)
language sql stable security definer set search_path = public as $$
  select m.status, m.expiry_date, m.plan_id, m.never_expires
  from memberships m
  where m.member_id = p_member
  order by m.created_at desc
  limit 1;
$$;

-- ============ ENFORCEMENT (unchanged apart from the extra argument) ============
create or replace function enforce_class_booking_entitlement() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  m record;
  p record;
  used int;
  slot_week date;
begin
  select * into m from current_membership_of(new.member_id);
  if m is null then
    raise exception 'You need an active membership to book a class.';
  end if;
  if not membership_is_usable(m.status, m.expiry_date, m.never_expires) then
    raise exception 'Your membership is not active. Please renew at the front desk.';
  end if;

  select * into p from membership_plans where id = m.plan_id;
  if p is null or not p.can_book_classes then
    raise exception 'Your plan does not include class booking. Upgrade at the front desk.';
  end if;

  if p.class_bookings_per_week is not null then
    select date_trunc('week', (c.scheduled_at at time zone 'Asia/Manila'))::date
      into slot_week
      from classes c where c.id = new.class_id;

    select count(*) into used
      from bookings b
      join classes c on c.id = b.class_id
     where b.member_id = new.member_id
       and b.status in ('pending', 'approved')
       and date_trunc('week', (c.scheduled_at at time zone 'Asia/Manila'))::date = slot_week;

    if used >= p.class_bookings_per_week then
      raise exception 'Your plan allows % class(es) per week. You have already booked that week.',
        p.class_bookings_per_week;
    end if;
  end if;

  return new;
end;
$$;

create or replace function enforce_pt_entitlement() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  m record;
  p record;
  used int;
  slot_month date;
begin
  if is_front_desk() then
    return new;
  end if;

  select * into m from current_membership_of(new.member_id);
  if m is null or not membership_is_usable(m.status, m.expiry_date, m.never_expires) then
    raise exception 'Your membership is not active. Please renew at the front desk.';
  end if;

  select * into p from membership_plans where id = m.plan_id;
  if p is null or not p.can_book_pt then
    raise exception 'Your plan does not include personal training. Upgrade at the front desk.';
  end if;

  if p.pt_sessions_per_month is not null then
    slot_month := date_trunc('month', (new.starts_at at time zone 'Asia/Manila'))::date;

    select count(*) into used
      from pt_sessions s
     where s.member_id = new.member_id
       and s.status in ('pending', 'approved')
       and date_trunc('month', (s.starts_at at time zone 'Asia/Manila'))::date = slot_month;

    if used >= p.pt_sessions_per_month then
      raise exception 'Your plan allows % personal training session(s) per month.',
        p.pt_sessions_per_month;
    end if;
  end if;

  return new;
end;
$$;

-- ============ BACKFILL ============
-- Any plan already carrying a decade or more was using the number as a stand-in
-- for "forever" — that is the only reason a gym in Mamburao would sell a
-- 3650-day membership. Matched on the duration rather than on the name
-- 'Free Access', so a plan that has since been renamed is still caught.
update membership_plans set duration_days = null where duration_days >= 3650;

-- Memberships already sold on those plans become lifetime rather than keeping a
-- 2036 date nothing means. Their status is untouched: a pending row stays
-- pending, and `never_expires` alone grants nothing.
update memberships m
   set never_expires = true,
       expiry_date = null
  from membership_plans p
 where p.id = m.plan_id
   and p.duration_days is null;
