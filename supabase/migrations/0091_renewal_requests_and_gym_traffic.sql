-- 0091 — "I'm coming to renew", and how busy the gym is.
--
-- ## 1. Renewal requests
--
-- The Plans screen ended in an instruction ("go to the desk with ₱1,500") and
-- nothing else: the desk had no idea anyone was coming, and a member who meant
-- to renew on Friday forgot by Friday. A request is **intent, never money** —
-- the gym is cash-only and only the person who took the cash can record a
-- payment (payments has no member INSERT policy, and must not). So:
--
--   * a member asks for one plan (`request_renewal`) — one open request each;
--   * the front desk sees it in a queue (admin → Payments) and is notified;
--   * it closes **itself** when a completed payment lands on that member's
--     membership while it is on the requested plan (trigger below) — the desk
--     records the payment exactly as before and does nothing extra;
--   * the member may withdraw it; the desk may decline it with a reason.
--
-- The rules a request checks are the rules the desk would apply: an active
-- plan, and the one-per-member Freemium trial (0041's `freemium_trials`).
--
-- ## 2. Gym traffic
--
-- Admin's Dashboard heatmap bucketed 30 days of check-ins in the browser. A
-- member deciding when to go wants the same answer, but may not read other
-- members' attendance rows. `gym_traffic()` returns counts only — weekday ×
-- time band — to anyone signed in, and the Dashboard now calls it too, so the
-- two apps cannot bucket traffic two different ways.

-- ════════════════════════════════════════════════════════════════════════
-- 1. RENEWAL REQUESTS
-- ════════════════════════════════════════════════════════════════════════
create table if not exists renewal_requests (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references member_profiles(profile_id) on delete cascade,
  plan_id     uuid not null references membership_plans(id),
  note        text check (note is null or char_length(note) <= 280),
  status      text not null default 'open' check (status in ('open', 'fulfilled', 'withdrawn', 'declined')),
  created_at  timestamptz not null default now(),
  closed_at   timestamptz,
  closed_by   uuid references profiles(id),
  close_note  text check (close_note is null or char_length(close_note) <= 280)
);

-- One open request per member: a unique constraint, not a hope.
create unique index if not exists renewal_requests_one_open
  on renewal_requests (member_id) where status = 'open';
create index if not exists idx_renewal_requests_open
  on renewal_requests (created_at) where status = 'open';

alter table renewal_requests enable row level security;

drop policy if exists renewal_requests_select_self on renewal_requests;
create policy renewal_requests_select_self on renewal_requests
  for select using (member_id = auth.uid());

drop policy if exists renewal_requests_select_desk on renewal_requests;
create policy renewal_requests_select_desk on renewal_requests
  for select using (is_front_desk());

-- No INSERT/UPDATE/DELETE policy for anyone: every write goes through the
-- functions below, which check the rules the table cannot.
grant select on renewal_requests to authenticated;

create or replace function request_renewal(p_plan uuid, p_note text default null)
returns uuid
language plpgsql security definer set search_path = public as $fn$
declare
  v_me   uuid := auth.uid();
  v_plan record;
  v_id   uuid;
begin
  if v_me is null then raise exception 'Sign in first.'; end if;
  if not exists (select 1 from member_profiles where profile_id = v_me) then
    raise exception 'Only members can ask to renew.';
  end if;

  select id, name, tier, is_active into v_plan from membership_plans where id = p_plan;
  if v_plan.id is null or not v_plan.is_active then
    raise exception 'That plan is not offered any more.';
  end if;
  if v_plan.tier = 'freemium' and exists (select 1 from freemium_trials where member_id = v_me) then
    raise exception 'The free trial is one per member, and yours has been used.';
  end if;

  -- Asking again replaces the earlier ask rather than failing on the index:
  -- a member who changes their mind should not have to withdraw first.
  update renewal_requests
     set status = 'withdrawn', closed_at = now(), closed_by = v_me, close_note = 'Replaced by a new request'
   where member_id = v_me and status = 'open';

  insert into renewal_requests (member_id, plan_id, note)
  values (v_me, p_plan, nullif(btrim(p_note), ''))
  returning id into v_id;

  -- The desk hears about it. One row per staff account, deduped per request.
  perform notify_once(p.id, 'system', 'Renewal request',
           coalesce((select first_name || ' ' || last_name from profiles where id = v_me), 'A member')
             || ' is coming to the desk for ' || v_plan.name || '.',
           '/payments', 'renewal:' || v_id)
    from profiles p
   where p.role in ('admin', 'staff') and p.status = 'active';

  return v_id;
end;
$fn$;

create or replace function withdraw_renewal_request()
returns void
language plpgsql security definer set search_path = public as $fn$
declare n int;
begin
  update renewal_requests
     set status = 'withdrawn', closed_at = now(), closed_by = auth.uid()
   where member_id = auth.uid() and status = 'open';
  get diagnostics n = row_count;
  if n = 0 then raise exception 'You have no open request to withdraw.'; end if;
end;
$fn$;

-- The desk turns one down (wrong plan, member asked in person, …) with a reason
-- the member reads. Fulfilment is never done by hand — see the trigger.
create or replace function decline_renewal_request(p_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public as $fn$
declare r record;
begin
  if auth.uid() is not null and not is_front_desk() then
    raise exception 'Only the front desk can decline a request.';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Say why — the member reads it.';
  end if;
  update renewal_requests
     set status = 'declined', closed_at = now(), closed_by = auth.uid(), close_note = btrim(p_reason)
   where id = p_id and status = 'open'
  returning member_id into r;
  if r.member_id is null then raise exception 'That request is not open.'; end if;
  perform notify_once(r.member_id, 'system', 'Renewal request closed', btrim(p_reason),
                      '/member/renew', 'renewal-declined:' || p_id);
end;
$fn$;

-- Closes the member's open request when the desk records a completed payment
-- on a membership that is on the requested plan. "Change plan, then record the
-- payment" (CLAUDE.md) is exactly the order that satisfies it.
create or replace function trg_fulfil_renewal_request() returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  if new.status = 'completed' and new.membership_id is not null
     and (tg_op = 'INSERT' or old.status is distinct from 'completed') then
    update renewal_requests rr
       set status = 'fulfilled', closed_at = now(), closed_by = new.recorded_by
      from memberships ms
     where ms.id = new.membership_id
       and rr.member_id = new.member_id
       and rr.status = 'open'
       and rr.plan_id = ms.plan_id;
  end if;
  return new;
end;
$fn$;

drop trigger if exists fulfil_renewal_request on payments;
create trigger fulfil_renewal_request after insert or update of status on payments
  for each row execute function trg_fulfil_renewal_request();

revoke all on function request_renewal(uuid, text), withdraw_renewal_request(),
  decline_renewal_request(uuid, text) from public, anon;
grant execute on function request_renewal(uuid, text), withdraw_renewal_request(),
  decline_renewal_request(uuid, text) to authenticated;

-- ════════════════════════════════════════════════════════════════════════
-- 1b. WHAT A PAYMENT BOUGHT — a snapshot on the receipt
-- ════════════════════════════════════════════════════════════════════════
-- A payment row said how much and when, never for what: both receipts (admin
-- and member) printed the membership's plan *today*, which is wrong for every
-- payment made before a plan change. The plan is now copied onto the payment
-- as it is written. Older rows stay NULL — backfilling them from today's plan
-- would be the same guess — and the screens say "current plan" for those.
alter table payments add column if not exists plan_id uuid references membership_plans(id);
alter table payments add column if not exists plan_name text;

create or replace function trg_payment_plan_snapshot() returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  if new.membership_id is not null and new.plan_id is null then
    select ms.plan_id, mp.name into new.plan_id, new.plan_name
      from memberships ms join membership_plans mp on mp.id = ms.plan_id
     where ms.id = new.membership_id;
  end if;
  return new;
end;
$fn$;

drop trigger if exists payment_plan_snapshot on payments;
create trigger payment_plan_snapshot before insert on payments
  for each row execute function trg_payment_plan_snapshot();

-- ════════════════════════════════════════════════════════════════════════
-- 2. GYM TRAFFIC — counts only, the Dashboard's buckets
-- ════════════════════════════════════════════════════════════════════════
-- dow: 0 = Sunday. band: the Dashboard's six labels. `weeks` is how many of
-- each weekday fell in the window, so a screen can say "about N" per day.
create or replace function gym_traffic(p_days int default 30)
returns table (dow int, band text, visits int, weeks int)
language sql stable security definer set search_path = public as $fn$
  with w as (
    select (now() at time zone 'Asia/Manila')::date as today,
           greatest(7, least(coalesce(p_days, 30), 180)) as days
  ),
  hits as (
    select extract(dow from (a.check_in_time at time zone 'Asia/Manila'))::int as dow,
           extract(hour from (a.check_in_time at time zone 'Asia/Manila'))::int as h
      from attendance a, w
     where auth.uid() is not null
       and (a.check_in_time at time zone 'Asia/Manila')::date > w.today - w.days
       and (a.check_in_time at time zone 'Asia/Manila')::date <= w.today
  ),
  banded as (
    select dow, case when h < 8 then '6am' when h < 11 then '9am' when h < 14 then '12pm'
                     when h < 17 then '3pm' when h < 20 then '6pm' else '9pm' end as band
      from hits
  ),
  days as (
    select extract(dow from d)::int as dow, count(*)::int as n
      from w, generate_series(w.today - w.days + 1, w.today, interval '1 day') d
     group by 1
  )
  select b.dow, b.band, count(*)::int, coalesce(max(days.n), 0)
    from banded b left join days on days.dow = b.dow
   group by b.dow, b.band
$fn$;

revoke all on function gym_traffic(int) from public, anon;
grant execute on function gym_traffic(int) to authenticated;

-- Marker for scripts/probe-migrations.py.
create or replace function migration_0091_applied() returns boolean
language sql immutable as $fn$ select true $fn$;
revoke all on function migration_0091_applied() from public, anon;
grant execute on function migration_0091_applied() to authenticated;

-- VERIFICATION
--   as a member:  select request_renewal('<plan id>');           -- a uuid; staff get a notification
--                 select * from renewal_requests;                -- your own only
--                 select withdraw_renewal_request();
--   as the desk:  select * from renewal_requests where status = 'open';
--                 record a completed payment on that member's membership → the request is 'fulfilled'
--   anyone:       select * from gym_traffic(30);                 -- counts, no names
