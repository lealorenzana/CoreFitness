-- 0108 — The service becomes a product the owner can configure.
--
-- Until now the platform→gym relationship was two columns: `gyms.plan`, a
-- CHECK constraint over three hard-coded words, and `gyms.paid_until`, a date
-- typed in by hand. Nothing recorded what a plan costs, what it includes, or
-- that a gym ever paid. The website's prices lived in a TypeScript file.
--
-- One level down, the gym→member relationship has had all of that since 0049:
-- `membership_plans`, a `features` catalogue, `plan_features` per plan, and
-- `plan_allows()` — the one function both RLS and the screens call, so the
-- database and the app cannot disagree about what a plan buys.
--
-- This migration builds the same shape one level up, deliberately mirroring it:
--
--   membership_plans  →  platform_plans          what is sold
--   features          →  platform_features       what can be sold
--   plan_features     →  platform_plan_features  what this plan includes
--   plan_allows()     →  gym_plan_allows()       the single question
--   payments          →  gym_payments            that it was paid for
--
-- Nothing about any existing gym changes when this is pasted. Every feature is
-- seeded ON for every plan and every limit is seeded NULL (unlimited), because
-- what separates a cheap tier from an expensive one is a decision the owner has
-- not made yet — and inventing it here would be the same lie as inventing a
-- price (CLAUDE.md: copy is a claim). The Plans screen is where they decide;
-- until they do, the tiers honestly include the same things.

-- ============================================================================
-- 1. WHAT THE SERVICE SELLS
-- ============================================================================

create table if not exists platform_plans (
  key           text primary key
                check (key ~ '^[a-z0-9_]+$' and length(key) between 2 and 30),
  name          text not null check (length(btrim(name)) between 2 and 40),
  -- The one line under the name on the website.
  blurb         text,
  -- Pesos. NULL is not zero: NULL means "not decided", and the website says
  -- "Talk to us" rather than printing a number nobody agreed to. 0 is free.
  price_monthly numeric(10,2) check (price_monthly is null or price_monthly >= 0),
  price_yearly  numeric(10,2) check (price_yearly  is null or price_yearly  >= 0),
  -- Days a gym gets before its first payment is due. NULL = no free period.
  trial_days    int check (trial_days is null or trial_days between 1 and 365),
  -- NULL = unlimited, on both. A number here is enforced by a trigger below,
  -- so a limit on this screen is a limit in the database, not a label.
  max_members   int check (max_members is null or max_members > 0),
  max_staff     int check (max_staff  is null or max_staff  > 0),
  -- Shown on the public website. A private plan still works for a gym already
  -- on it — that is how a grandfathered price survives a price change.
  is_public     boolean not null default true,
  -- Can be given to a gym. Retiring a plan never deletes it: gyms point at it.
  is_active     boolean not null default true,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now()
);

comment on table platform_plans is
  'What Core Fitness sells to a gym (0108). Mirrors membership_plans one level up. '
  'Prices start NULL — undecided, not free.';

-- The three keys `gyms.plan` already holds. Prices are NULL on purpose: the
-- only number here that anyone has actually decided is that the trial is free.
insert into platform_plans (key, name, blurb, price_monthly, trial_days, sort_order) values
  ('trial',    'Free trial', 'Thirty days, the whole system, no card.',        0,    30, 1),
  ('standard', 'Standard',   'One gym, everything it needs to run a day.',     null, null, 2),
  ('premium',  'Premium',    'For a gym that wants the coaching side too.',    null, null, 3)
on conflict (key) do nothing;

-- `gyms.plan` stops being three words in a CHECK and starts being a row. That
-- is what lets the owner add a fourth tier without a migration.
alter table gyms drop constraint if exists gyms_plan_check;
alter table gyms drop constraint if exists gyms_plan_fkey;
alter table gyms add constraint gyms_plan_fkey
  foreign key (plan) references platform_plans(key) on update cascade;

-- ============================================================================
-- 2. WHAT CAN BE SOLD, AND WHAT EACH PLAN INCLUDES
-- ============================================================================
-- The catalogue arrives by migration only, alongside the code that honours each
-- key — exactly as `features` does for members (0049). The owner edits
-- platform_plan_features, never this.

create table if not exists platform_features (
  key         text primary key,
  label       text not null,
  description text not null,
  sort_order  int not null default 0
);

insert into platform_features (key, label, description, sort_order) values
  ('front_desk',  'The front desk',
   'Members, memberships, cash payments with a receipt number, and the audit log.', 1),
  ('checkin',     'QR check-in and the kiosk',
   'Members check themselves in from their phone, or at a kiosk screen you leave on the counter.', 2),
  ('classes',     'Classes and bookings',
   'A weekly timetable that generates itself, bookings, clash checks and a waitlist.', 3),
  ('coaching',    'Coaches',
   'Trainers with their own app, their own hours, one-to-one sessions and their own trainees.', 4),
  ('engagement',  'Points, rewards and challenges',
   'Points for turning up, badges for milestones, rewards redeemed at your desk, and challenges.', 5),
  ('progress',    'Progress and goals',
   'Measurements, photos, goals and workout tracking, with what a coach may see decided by the member.', 6),
  ('assistant',   'The in-app assistant',
   'Answers members'' questions about the gym, their membership and their bookings.', 7),
  ('push',        'Announcements and push',
   'Announcements, reminders and alerts delivered to your members'' phones.', 8),
  ('analytics',   'Analytics and retention',
   'Revenue, retention, who is slipping away, and the reports behind them.', 9)
on conflict (key) do nothing;

create table if not exists platform_plan_features (
  plan_key    text not null references platform_plans(key) on delete cascade on update cascade,
  feature_key text not null references platform_features(key) on delete cascade,
  enabled     boolean not null,
  primary key (plan_key, feature_key)
);

create index if not exists idx_platform_plan_features_plan on platform_plan_features(plan_key);

-- Every feature on, on every plan. See the header: what a cheaper tier does
-- *not* include is the owner's decision, and this file does not make it for them.
create or replace function sync_platform_plan_features() returns int
language plpgsql security definer set search_path = public as $fn$
declare n int;
begin
  insert into platform_plan_features (plan_key, feature_key, enabled)
  select p.key, f.key, true
    from platform_plans p cross join platform_features f
  on conflict (plan_key, feature_key) do nothing;
  get diagnostics n = row_count;
  return n;
end;
$fn$;
revoke all on function sync_platform_plan_features() from public, anon;
grant execute on function sync_platform_plan_features() to authenticated;

select sync_platform_plan_features();

-- A plan added later must not open with holes. Same trigger idea as 0049's.
create or replace function trg_platform_plan_seeded() returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  insert into platform_plan_features (plan_key, feature_key, enabled)
  select new.key, f.key, true from platform_features f
  on conflict (plan_key, feature_key) do nothing;
  return new;
end;
$fn$;

drop trigger if exists platform_plan_seeded on platform_plans;
create trigger platform_plan_seeded after insert on platform_plans
  for each row execute function trg_platform_plan_seeded();

-- ============================================================================
-- 3. THE ONE QUESTION: DOES THIS GYM GET THIS?
-- ============================================================================
-- `plan_allows()` one level up. Screens and rules both call this, so a locked
-- section and a refused write can never disagree.
--
-- An unknown feature, a gym on a plan that no longer exists, or a missing cell
-- all answer TRUE: a bookkeeping gap is not a reason to take a working feature
-- away from a paying gym. Turning something *off* is always a deliberate row.

create or replace function gym_plan_allows(p_gym uuid, p_feature text)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select ppf.enabled
       from gyms g
       join platform_plan_features ppf
         on ppf.plan_key = g.plan and ppf.feature_key = p_feature
      where g.id = coalesce(p_gym, current_gym_id())),
    true);
$$;
revoke all on function gym_plan_allows(uuid, text) from public, anon;
grant execute on function gym_plan_allows(uuid, text) to authenticated;

-- What this gym's plan allows, for a screen that wants to lock and explain
-- rather than hide (CLAUDE.md). Its own gym only — never another's.
create or replace function my_gym_features()
returns table (feature_key text, label text, description text, enabled boolean, sort_order int)
language sql stable security definer set search_path = public as $$
  select f.key, f.label, f.description,
         coalesce(ppf.enabled, true), f.sort_order
    from platform_features f
    left join gyms g on g.id = current_gym_id()
    left join platform_plan_features ppf
           on ppf.feature_key = f.key and ppf.plan_key = g.plan
   where current_gym_id() is not null
   order by f.sort_order;
$$;
revoke all on function my_gym_features() from public, anon;
grant execute on function my_gym_features() to authenticated;

-- ============================================================================
-- 4. LIMITS THAT ARE ACTUALLY LIMITS
-- ============================================================================
-- A number on a pricing page that nothing enforces is a lie (CLAUDE.md: a
-- control writing a flag nothing reads). This is a trigger on `gym_roles`
-- rather than a check inside add_person_to_gym(), because people arrive in a
-- gym by several roads — the front desk creating a walk-in, an admin approving
-- a self-registration, an Edge Function, the platform naming an owner — and a
-- rule that lives on the table cannot be walked around by any of them.
--
-- Seeded limits are NULL, so this changes nothing until an owner types a number.

create or replace function gym_headroom(p_gym uuid default null)
returns table (plan_key text, plan_name text,
               max_members int, members int,
               max_staff int, staff int)
language sql stable security definer set search_path = public as $$
  select g.plan, p.name,
         p.max_members,
         (select count(*)::int from gym_roles r
           where r.gym_id = g.id and r.role = 'member' and r.status = 'active'),
         p.max_staff,
         (select count(*)::int from gym_roles r
           where r.gym_id = g.id and r.role in ('admin','staff') and r.status = 'active')
    from gyms g
    left join platform_plans p on p.key = g.plan
   where g.id = coalesce(p_gym, current_gym_id());
$$;
revoke all on function gym_headroom(uuid) from public, anon;
grant execute on function gym_headroom(uuid) to authenticated;

create or replace function trg_gym_roles_plan_limits() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare
  v_cap  int;
  v_used int;
  v_name text;
begin
  -- Only the transition *into* an active seat costs anything. A member who is
  -- already active, a suspension, an archive and a role rename are all free —
  -- otherwise a gym that slipped over a lowered cap could not even archive
  -- someone to get back under it.
  if new.status is distinct from 'active' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'active' and old.role = new.role then
    return new;
  end if;

  if new.role = 'member' then
    select pp.max_members into v_cap
      from gyms g join platform_plans pp on pp.key = g.plan where g.id = new.gym_id;
    if v_cap is not null then
      select count(*) into v_used from gym_roles r
       where r.gym_id = new.gym_id and r.role = 'member' and r.status = 'active'
         and r.user_id is distinct from new.user_id;
      if v_used >= v_cap then
        select name into v_name from gyms where id = new.gym_id;
        raise exception
          '% is on a plan that allows % active members, and has %. Archive a '
          'member, or move the gym to a bigger plan.', v_name, v_cap, v_used
          using errcode = '23514';
      end if;
    end if;

  elsif new.role in ('admin', 'staff') then
    select pp.max_staff into v_cap
      from gyms g join platform_plans pp on pp.key = g.plan where g.id = new.gym_id;
    if v_cap is not null then
      select count(*) into v_used from gym_roles r
       where r.gym_id = new.gym_id and r.role in ('admin','staff') and r.status = 'active'
         and r.user_id is distinct from new.user_id;
      if v_used >= v_cap then
        select name into v_name from gyms where id = new.gym_id;
        raise exception
          '% is on a plan that allows % people behind the desk, and has %.',
          v_name, v_cap, v_used using errcode = '23514';
      end if;
    end if;

  elsif new.role = 'trainer' then
    -- A capability, not a count: a gym whose plan has no coaching side cannot
    -- have coaches. Existing trainers are untouched — this fires on the way in.
    if not gym_plan_allows(new.gym_id, 'coaching') then
      select name into v_name from gyms where id = new.gym_id;
      raise exception
        '% is on a plan without the coaching side, so it cannot have coaches.',
        v_name using errcode = '23514';
    end if;
  end if;

  return new;
end;
$fn$;

drop trigger if exists gym_roles_plan_limits on gym_roles;
create trigger gym_roles_plan_limits before insert or update on gym_roles
  for each row execute function trg_gym_roles_plan_limits();

-- ============================================================================
-- 5. THAT A GYM PAID
-- ============================================================================
-- `paid_until` was a date somebody typed. It is now the consequence of a
-- recorded payment, the same way a member's expiry follows a `payments` row
-- rather than being edited directly.

create table if not exists gym_payments (
  id           uuid primary key default gen_random_uuid(),
  gym_id       uuid not null references gyms(id) on delete cascade,
  amount       numeric(10,2) not null check (amount >= 0),
  paid_on      date not null default (now() at time zone 'Asia/Manila')::date,
  -- What the money bought. `covers_until` is what moves gyms.paid_until.
  covers_from  date,
  covers_until date not null,
  -- Cash, bank transfer, GCash — the gym's word for it, not a fixed list.
  method       text,
  -- A bank reference or receipt number, so a disputed payment can be traced.
  reference    text,
  note         text,
  plan_key     text references platform_plans(key) on update cascade,
  recorded_by  uuid references profiles(id),
  created_at   timestamptz not null default now(),
  constraint gym_payments_period check (covers_from is null or covers_until >= covers_from)
);

create index if not exists idx_gym_payments_gym on gym_payments(gym_id, paid_on desc);

alter table gym_payments enable row level security;

-- No policy for anyone. Every read below is a SECURITY DEFINER function that
-- names who may see it: the platform owner, or the gym's own admin about
-- itself. A gym can never see another gym's money.
comment on table gym_payments is
  'What a gym paid Core Fitness (0108). RLS on with no policy: readable only '
  'through platform_gym_payments() and my_gym_billing().';

create or replace function record_gym_payment(
  p_gym uuid, p_amount numeric, p_covers_until date,
  p_paid_on date default null, p_covers_from date default null,
  p_method text default null, p_reference text default null, p_note text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id   uuid;
  v_plan text;
  v_name text;
begin
  if not is_platform_admin() then
    raise exception 'Only the platform can record a gym payment.' using errcode = '42501';
  end if;
  if p_amount is null or p_amount < 0 then
    raise exception 'A payment needs an amount. Use 0 for a free period.';
  end if;
  if p_covers_until is null then
    raise exception 'Say what date this payment covers the gym until.';
  end if;

  select plan, name into v_plan, v_name from gyms where id = p_gym;
  if v_name is null then
    raise exception 'That gym does not exist.';
  end if;

  insert into gym_payments (gym_id, amount, paid_on, covers_from, covers_until,
                            method, reference, note, plan_key, recorded_by)
  values (p_gym, p_amount,
          coalesce(p_paid_on, (now() at time zone 'Asia/Manila')::date),
          p_covers_from, p_covers_until,
          nullif(btrim(p_method), ''), nullif(btrim(p_reference), ''),
          nullif(btrim(p_note), ''), v_plan, auth.uid())
  returning id into v_id;

  -- Never backwards: recording a late payment for an old period must not pull
  -- a gym's access in. greatest() ignores NULL, so a gym with no date gets one.
  update gyms
     set paid_until = greatest(coalesce(paid_until, p_covers_until), p_covers_until)
   where id = p_gym;

  perform platform_log(p_gym, 'gym.paid',
    v_name || ' paid ' || to_char(p_amount, 'FM999,999,990.00')
           || ', covered to ' || to_char(p_covers_until, 'DD Mon YYYY'),
    jsonb_build_object('amount', p_amount, 'covers_until', p_covers_until,
                       'method', p_method, 'reference', p_reference, 'payment', v_id));
  return v_id;
end;
$$;
revoke all on function record_gym_payment(uuid, numeric, date, date, date, text, text, text)
  from public, anon;
grant execute on function record_gym_payment(uuid, numeric, date, date, date, text, text, text)
  to authenticated;

create or replace function platform_gym_payments(p_gym uuid default null)
returns setof gym_payments
language sql stable security definer set search_path = public as $$
  select * from gym_payments
   where is_platform_admin() and (p_gym is null or gym_id = p_gym)
   order by paid_on desc, created_at desc;
$$;
revoke all on function platform_gym_payments(uuid) from public, anon;
grant execute on function platform_gym_payments(uuid) to authenticated;

-- Money in, by month. Sums and counts — never a gym's own members or payments.
create or replace function platform_revenue(p_months int default 12)
returns table (month date, gyms int, payments int, total numeric)
language sql stable security definer set search_path = public as $$
  select date_trunc('month', p.paid_on)::date,
         count(distinct p.gym_id)::int, count(*)::int, sum(p.amount)
    from gym_payments p
   where is_platform_admin()
     and p.paid_on >= (date_trunc('month', (now() at time zone 'Asia/Manila')::date)
                       - make_interval(months => greatest(1, least(coalesce(p_months, 12), 60)) - 1))::date
   group by 1
   order by 1 desc;
$$;
revoke all on function platform_revenue(int) from public, anon;
grant execute on function platform_revenue(int) to authenticated;

-- ============================================================================
-- 6. NOBODY SHOULD BE SURPRISED BY A LOCK
-- ============================================================================
-- A gym goes read-only seven days after `paid_until` (0099's gym_lock_reason).
-- Until now the first anyone knew of it was a gym that had stopped working.
-- Both sides can now see it coming: the platform owner in a list, and the gym's
-- own owner on their own dashboard.

create or replace function gyms_due(p_within_days int default 14)
returns table (id uuid, name text, plan text, paid_until date, days_left int,
               lock_reason text, members int)
language sql stable security definer set search_path = public as $$
  select g.id, g.name, g.plan, g.paid_until,
         (g.paid_until - (now() at time zone 'Asia/Manila')::date)::int,
         gym_lock_reason(g.id),
         (select count(*)::int from gym_roles r
           where r.gym_id = g.id and r.role = 'member' and r.status = 'active')
    from gyms g
   where is_platform_admin()
     and g.paid_until is not null
     and g.paid_until - (now() at time zone 'Asia/Manila')::date
         <= greatest(0, coalesce(p_within_days, 14))
   order by g.paid_until;
$$;
revoke all on function gyms_due(int) from public, anon;
grant execute on function gyms_due(int) to authenticated;

-- What this gym owes, and what it has paid — for the gym's own admin, about
-- their own gym. A gym reads its own money and nobody else's.
create or replace function my_gym_billing()
returns table (plan_key text, plan_name text, blurb text,
               price_monthly numeric, price_yearly numeric,
               paid_until date, days_left int, lock_reason text,
               max_members int, members int, max_staff int, staff int,
               last_paid_on date, last_amount numeric)
language sql stable security definer set search_path = public as $$
  select g.plan, pp.name, pp.blurb, pp.price_monthly, pp.price_yearly,
         g.paid_until,
         case when g.paid_until is null then null
              else (g.paid_until - (now() at time zone 'Asia/Manila')::date)::int end,
         gym_lock_reason(g.id),
         h.max_members, h.members, h.max_staff, h.staff,
         (select p.paid_on from gym_payments p where p.gym_id = g.id
           order by p.paid_on desc, p.created_at desc limit 1),
         (select p.amount  from gym_payments p where p.gym_id = g.id
           order by p.paid_on desc, p.created_at desc limit 1)
    from gyms g
    left join platform_plans pp on pp.key = g.plan
    cross join lateral gym_headroom(g.id) h
   where g.id = current_gym_id()
     and get_my_role() is not distinct from 'admin';
$$;
revoke all on function my_gym_billing() from public, anon;
grant execute on function my_gym_billing() to authenticated;

-- ============================================================================
-- 7. THE WEBSITE STOPS HARD-CODING PRICES
-- ============================================================================
-- corefitness-site/src/pricing.ts held the tiers as a TypeScript literal, so a
-- price change meant an edit and a redeploy, and the page could disagree with
-- what a gym is actually charged. This is the same list the platform owner
-- edits and the same list `gyms.plan` points at.
--
-- Granted to anon deliberately: it is a price list, and a price list that needs
-- a login is not a price list. It exposes no gym and no person.
--
-- NOT `public_plans()`: 0104 already has `public_plans(gym)`, which is a *gym's*
-- membership plans shown to someone signing up to it. Two different things one
-- name apart, distinguished only by an argument, is the kind of collision that
-- costs an afternoon — so this one says whose price list it is.

create or replace function platform_price_list()
returns table (key text, name text, blurb text,
               price_monthly numeric, price_yearly numeric, trial_days int,
               max_members int, includes text[], sort_order int)
language sql stable security definer set search_path = public as $$
  select p.key, p.name, p.blurb, p.price_monthly, p.price_yearly, p.trial_days,
         p.max_members,
         coalesce(array(
           select f.label from platform_plan_features ppf
             join platform_features f on f.key = ppf.feature_key
            where ppf.plan_key = p.key and ppf.enabled
            order by f.sort_order
         ), '{}'::text[]),
         p.sort_order
    from platform_plans p
   where p.is_public and p.is_active
   order by p.sort_order, p.name;
$$;
revoke all on function platform_price_list() from public;
grant execute on function platform_price_list() to anon, authenticated;

-- ============================================================================
-- 8. THE OWNER EDITS ALL OF IT
-- ============================================================================

alter table platform_plans enable row level security;
alter table platform_features enable row level security;
alter table platform_plan_features enable row level security;

-- Read: anyone signed in may read the catalogue — the admin app shows a gym
-- what its own plan includes, and that is the same table. Nothing here is a
-- gym's data. Writes go through the functions below, which check the platform.
drop policy if exists platform_plans_read on platform_plans;
create policy platform_plans_read on platform_plans for select
  using (auth.uid() is not null);
drop policy if exists platform_features_read on platform_features;
create policy platform_features_read on platform_features for select
  using (auth.uid() is not null);
drop policy if exists platform_plan_features_read on platform_plan_features;
create policy platform_plan_features_read on platform_plan_features for select
  using (auth.uid() is not null);

create or replace function save_platform_plan(
  p_key text, p_name text, p_blurb text default null,
  p_price_monthly numeric default null, p_price_yearly numeric default null,
  p_trial_days int default null, p_max_members int default null,
  p_max_staff int default null, p_is_public boolean default true,
  p_is_active boolean default true, p_sort int default 0
) returns text
language plpgsql security definer set search_path = public as $$
declare v_new boolean;
begin
  if not is_platform_admin() then
    raise exception 'Only the platform can change what it sells.' using errcode = '42501';
  end if;
  if p_key !~ '^[a-z0-9_]+$' or length(p_key) not between 2 and 30 then
    raise exception 'A plan key uses small letters, numbers and underscores only.';
  end if;
  if coalesce(btrim(p_name), '') = '' then
    raise exception 'The plan needs a name.';
  end if;

  v_new := not exists (select 1 from platform_plans where key = p_key);

  insert into platform_plans (key, name, blurb, price_monthly, price_yearly, trial_days,
                              max_members, max_staff, is_public, is_active, sort_order)
  values (p_key, btrim(p_name), nullif(btrim(p_blurb), ''), p_price_monthly, p_price_yearly,
          p_trial_days, p_max_members, p_max_staff,
          coalesce(p_is_public, true), coalesce(p_is_active, true), coalesce(p_sort, 0))
  on conflict (key) do update set
    name = excluded.name, blurb = excluded.blurb,
    price_monthly = excluded.price_monthly, price_yearly = excluded.price_yearly,
    trial_days = excluded.trial_days,
    max_members = excluded.max_members, max_staff = excluded.max_staff,
    is_public = excluded.is_public, is_active = excluded.is_active,
    sort_order = excluded.sort_order;

  perform platform_log(null, case when v_new then 'plan.created' else 'plan.changed' end,
    btrim(p_name) || case when v_new then ' was added to what Core Fitness sells'
                          else ' was changed' end,
    jsonb_build_object('key', p_key, 'price_monthly', p_price_monthly,
                       'max_members', p_max_members, 'max_staff', p_max_staff));
  return p_key;
end;
$$;
revoke all on function save_platform_plan(text, text, text, numeric, numeric, int, int, int, boolean, boolean, int)
  from public, anon;
grant execute on function save_platform_plan(text, text, text, numeric, numeric, int, int, int, boolean, boolean, int)
  to authenticated;

create or replace function set_platform_plan_feature(p_plan text, p_feature text, p_enabled boolean)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then
    raise exception 'Only the platform can change what a plan includes.' using errcode = '42501';
  end if;
  insert into platform_plan_features (plan_key, feature_key, enabled)
  values (p_plan, p_feature, coalesce(p_enabled, true))
  on conflict (plan_key, feature_key) do update set enabled = excluded.enabled;

  perform platform_log(null, 'plan.feature',
    (select name from platform_plans where key = p_plan) || ': '
      || (select label from platform_features where key = p_feature)
      || case when p_enabled then ' included' else ' not included' end,
    jsonb_build_object('plan', p_plan, 'feature', p_feature, 'enabled', p_enabled));
end;
$$;
revoke all on function set_platform_plan_feature(text, text, boolean) from public, anon;
grant execute on function set_platform_plan_feature(text, text, boolean) to authenticated;

-- Retiring, never deleting — the same rule as retire_plan() for a gym's own
-- plans (0062). Gyms point at these rows; deleting one would orphan a gym.
create or replace function retire_platform_plan(p_key text) returns int
language plpgsql security definer set search_path = public as $$
declare v_on int;
begin
  if not is_platform_admin() then
    raise exception 'Only the platform can retire a plan.' using errcode = '42501';
  end if;
  select count(*) into v_on from gyms where plan = p_key;
  update platform_plans set is_active = false, is_public = false where key = p_key;
  perform platform_log(null, 'plan.retired',
    coalesce((select name from platform_plans where key = p_key), p_key)
      || ' was retired; ' || v_on || ' gym(s) stay on it',
    jsonb_build_object('key', p_key, 'gyms', v_on));
  return v_on;
end;
$$;
revoke all on function retire_platform_plan(text) from public, anon;
grant execute on function retire_platform_plan(text) to authenticated;

-- ============================================================================
-- 9. THE PLATFORM'S OWN LIST GAINS WHAT IT WAS MISSING
-- ============================================================================

drop function if exists platform_gyms();
create function platform_gyms()
returns table (id uuid, name text, slug text, status text, plan text, paid_until date,
               lock_reason text, members int, staff int, created_at timestamptz,
               last_activity timestamptz, owners int, onboarded boolean,
               plan_name text, price_monthly numeric, days_left int,
               max_members int, paid_total numeric)
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
         g.onboarded_at is not null,
         pp.name, pp.price_monthly,
         case when g.paid_until is null then null
              else (g.paid_until - (now() at time zone 'Asia/Manila')::date)::int end,
         pp.max_members,
         coalesce((select sum(x.amount) from gym_payments x where x.gym_id = g.id), 0)
    from gyms g
    left join platform_plans pp on pp.key = g.plan
   where is_platform_admin()
   order by g.name;
$$;

-- `set_gym_plan` predates platform_plans and validated against nothing. It now
-- refuses a plan that does not exist, which is the whole point of the table.
create or replace function set_gym_plan(p_gym uuid, p_plan text, p_paid_until date default null)
returns void
language plpgsql security definer set search_path = public as $$
declare v_name text; v_plan text;
begin
  if not is_platform_admin() then
    raise exception 'Only the platform can change a gym plan.' using errcode = '42501';
  end if;
  select name into v_plan from platform_plans where key = p_plan and is_active;
  if v_plan is null then
    raise exception 'There is no active plan called "%".', p_plan;
  end if;
  select name into v_name from gyms where id = p_gym;

  update gyms set plan = p_plan, paid_until = coalesce(p_paid_until, paid_until) where id = p_gym;

  perform platform_log(p_gym, 'gym.plan',
    coalesce(v_name, 'A gym') || ' moved to ' || v_plan,
    jsonb_build_object('plan', p_plan, 'paid_until', p_paid_until));
end;
$$;
revoke all on function set_gym_plan(uuid, text, date) from public, anon;
grant execute on function set_gym_plan(uuid, text, date) to authenticated;

-- ---- the probe's marker ----------------------------------------------------------------

create or replace function migration_0108_applied() returns boolean
language sql immutable as $fn$ select true $fn$;
revoke all on function migration_0108_applied() from public, anon;
grant execute on function migration_0108_applied() to authenticated;
comment on function migration_0108_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0108.sql
