-- 0017 — what a plan actually includes, plus freeze and cancel.
--
-- `plan_tier` ('free'/'freemium'/'premium') and the 'frozen'/'cancelled'
-- membership statuses have existed since 0001 but nothing has ever read them.
-- 0004 seeded three plans whose *descriptions* promise concrete limits ("1 group
-- class per week", "Trainer booking priority") that no code enforces.
--
-- Rather than hardcoding those limits against the tier names, the entitlements
-- become **columns the admin edits per plan**. A gym that wants unlimited
-- classes on its cheapest plan, or PT on none of them, configures that instead
-- of needing a code change. The tier stays as a label for the badge and for
-- grouping; it is no longer a hidden rulebook.

-- ============ WHAT A PLAN INCLUDES ============
alter table membership_plans
  add column if not exists can_book_classes boolean not null default true,
  add column if not exists can_book_pt boolean not null default true,
  -- NULL means unlimited. 0 would mean "allowed, but never" — which is a
  -- contradiction, so the boolean above carries the on/off and these carry
  -- the ceiling.
  add column if not exists class_bookings_per_week int,
  add column if not exists pt_sessions_per_month int;

alter table membership_plans
  add constraint membership_plans_class_quota_positive
    check (class_bookings_per_week is null or class_bookings_per_week > 0) not valid;
alter table membership_plans
  add constraint membership_plans_pt_quota_positive
    check (pt_sessions_per_month is null or pt_sessions_per_month > 0) not valid;

-- Backfill the three seeded plans to match what their descriptions already
-- promise members, so the text and the behaviour agree from day one.
update membership_plans set can_book_classes = false, can_book_pt = false
  where name = 'Free Access';
update membership_plans set can_book_classes = true, class_bookings_per_week = 1, can_book_pt = false
  where name = 'Freemium Trial';
update membership_plans set can_book_classes = true, can_book_pt = true,
                            class_bookings_per_week = null, pt_sessions_per_month = null
  where name = 'Premium';

-- ============ FREEZE ============
-- Freezing suspends access without burning the days already paid for. On
-- unfreeze, `expiry_date` moves out by however long the freeze lasted, which is
-- only computable if we remember when it started.
alter table memberships
  add column if not exists frozen_at date;

-- ============ ACCESS ============
-- One definition of "may this member use the gym right now", used by the
-- booking triggers below so the phone app and the database can never disagree.
--
--   active    — yes, until expiry
--   cancelled — yes, until expiry. They paid cash up front and there is no
--               refund mechanism; cancelling stops the renewal, not the days
--               already bought.
--   frozen    — no. That is the entire point of a freeze.
--   expired / pending — no.
create or replace function membership_is_usable(m_status membership_status, m_expiry date)
returns boolean language sql immutable as $$
  select m_status in ('active', 'cancelled')
     and m_expiry is not null
     and m_expiry >= (now() at time zone 'Asia/Manila')::date;
$$;

-- The member's live membership row, newest first — the same "newest wins" rule
-- the app follows, so a renewal never gets judged against a stale row.
create or replace function current_membership_of(p_member uuid)
returns table (status membership_status, expiry_date date, plan_id uuid)
language sql stable security definer set search_path = public as $$
  select m.status, m.expiry_date, m.plan_id
  from memberships m
  where m.member_id = p_member
  order by m.created_at desc
  limit 1;
$$;

-- ============ ENFORCEMENT ============
-- Client-side checks are for explaining *why* a button is disabled. They are
-- not the boundary — anyone can call PostgREST directly. These triggers are.

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
  if not membership_is_usable(m.status, m.expiry_date) then
    raise exception 'Your membership is not active. Please renew at the front desk.';
  end if;

  select * into p from membership_plans where id = m.plan_id;
  if p is null or not p.can_book_classes then
    raise exception 'Your plan does not include class booking. Upgrade at the front desk.';
  end if;

  if p.class_bookings_per_week is not null then
    -- Count against the week the *class* falls in, not the week it was booked.
    -- Otherwise a member books four weeks of Mondays in one sitting and blows
    -- the quota for a week they haven't reached yet.
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

drop trigger if exists trg_enforce_class_booking_entitlement on bookings;
create trigger trg_enforce_class_booking_entitlement
before insert on bookings
for each row execute function enforce_class_booking_entitlement();

create or replace function enforce_pt_entitlement() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  m record;
  p record;
  used int;
  slot_month date;
begin
  -- The front desk can book a member in regardless — they are making a judgment
  -- call in person, often having just taken payment for it. The quota exists to
  -- stop self-service overreach, not to overrule staff.
  if is_front_desk() then
    return new;
  end if;

  select * into m from current_membership_of(new.member_id);
  if m is null or not membership_is_usable(m.status, m.expiry_date) then
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

drop trigger if exists trg_enforce_pt_entitlement on pt_sessions;
create trigger trg_enforce_pt_entitlement
before insert on pt_sessions
for each row execute function enforce_pt_entitlement();

-- ============ MEMBERS READ THEIR OWN ENTITLEMENTS ============
-- `membership_plans` is already selectable by any authenticated user, so the
-- phone app can read these columns to explain a disabled button. No new policy
-- needed — noted here so the next person doesn't go looking for one.
