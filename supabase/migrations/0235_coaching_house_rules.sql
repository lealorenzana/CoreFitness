-- 0235 — Coaching house rules: pause, the gym's cut, coach dues (2026-11-06).
--
-- A real coach told a real client: "the gym membership can freeze, coaching has
-- no pause" — and that coaches pay the gym a membership and 5% of what members
-- pay them. Those are a gym's own rules; until now no gym could set them, the
-- member was never told before freezing, and nothing recorded either payment.
-- Spec: docs/superpowers/specs/2026-11-06-coaching-house-rules-design.md.
--
-- Three switches the owner sets in Setup → How coaching works (and Settings).
-- Each defaults to what the system already did, so no gym changes until its
-- owner says so:
--
--   coaching_pause   never (default) · with_membership · coach_decides
--     When a membership is frozen, each active coaching gets a coaching_pauses
--     row: 'pause' (with_membership) or 'pending' (coach_decides; the coach is
--     asked). While a pause is open the sweep neither ends nor reminds that
--     coaching. When the membership leaves 'frozen', a 'pause' moves the
--     coaching's end date by the days actually frozen; a coach who never
--     answered counts as 'keep'. All of it in a trigger on memberships, so no
--     screen can skip it.
--
--   coaching_cut_on / coaching_cut_percent   (0–50)
--     The gym's share of what members pay coaches directly (trainer_direct).
--     Computed, never stored as a balance: a month's "paid to the coach" is the
--     package prices the coach marked Received (coachings.paid_at, Manila
--     month). Single 1-on-1 sessions record no price, so they cannot count — the
--     screens say so. Settling a month stores the amount and the percent used.
--
--   coach_dues_on / coach_dues_amount   (per month)
--     What a coach pays the gym. Due every calendar month from the month dues
--     were switched on (or the month the coach joined, if later). The desk
--     records each month; a coach behind is flagged to the owner — never locked
--     out.
--
-- Every write goes through a definer function below; the new tables have RLS
-- on and no policy for any role. Safe to paste again.

-- ---------------------------------------------------------------------------
-- The switches
-- ---------------------------------------------------------------------------
alter table gym_settings add column if not exists coaching_pause text not null default 'never';
alter table gym_settings drop constraint if exists gym_settings_coaching_pause_check;
alter table gym_settings add constraint gym_settings_coaching_pause_check
  check (coaching_pause in ('never', 'with_membership', 'coach_decides'));
alter table gym_settings add column if not exists coaching_cut_on boolean not null default false;
alter table gym_settings add column if not exists coaching_cut_percent numeric(4,1) not null default 0;
alter table gym_settings drop constraint if exists gym_settings_coaching_cut_percent_check;
alter table gym_settings add constraint gym_settings_coaching_cut_percent_check
  check (coaching_cut_percent between 0 and 50);
alter table gym_settings add column if not exists coach_dues_on boolean not null default false;
alter table gym_settings add column if not exists coach_dues_amount numeric(10,2) not null default 0;
alter table gym_settings drop constraint if exists gym_settings_coach_dues_amount_check;
alter table gym_settings add constraint gym_settings_coach_dues_amount_check check (coach_dues_amount >= 0);
-- The first month dues are owed: set when the owner switches dues on, so the
-- months they were off are never counted as unpaid.
alter table gym_settings add column if not exists coach_dues_since date;

-- Everyone in the gym reads the pause rule (a member is told it before freezing).
-- The share and the dues are between the gym and its coaches: a member, or a
-- caller with no role here, gets them as null. Called inside other definer
-- functions with no signed-in user (the trigger), it answers in full.
create or replace function coaching_house_rules(p_gym uuid default null)
returns table (pause text, cut_on boolean, cut_percent numeric, dues_on boolean, dues_amount numeric, dues_since date)
language sql stable security definer set search_path = public as $$
  select coalesce(gs.coaching_pause, 'never'),
         case when x.sees_money then coalesce(gs.coaching_cut_on, false) end,
         case when x.sees_money then coalesce(gs.coaching_cut_percent, 0) end,
         case when x.sees_money then coalesce(gs.coach_dues_on, false) end,
         case when x.sees_money then coalesce(gs.coach_dues_amount, 0) end,
         case when x.sees_money then gs.coach_dues_since end
    from (select coalesce(p_gym, current_gym_id()) g,
                 (auth.uid() is null or get_my_role() in ('admin', 'staff', 'trainer')) sees_money) x
    left join gym_settings gs on gs.gym_id = x.g;
$$;
revoke all on function coaching_house_rules(uuid) from public, anon;
grant execute on function coaching_house_rules(uuid) to authenticated;

create or replace function set_coaching_house_rules(p_pause text, p_cut_on boolean, p_cut_percent numeric,
                                                    p_dues_on boolean, p_dues_amount numeric) returns void
language plpgsql security definer set search_path = public as $$
declare v_month date := date_trunc('month', manila_today())::date;
begin
  if get_my_role() is distinct from 'admin' then
    raise exception 'Only the gym owner can change how coaching works.' using errcode = '42501';
  end if;
  if p_pause is null or p_pause not in ('never', 'with_membership', 'coach_decides') then
    raise exception 'Choose never, with the membership, or the coach decides.';
  end if;
  if coalesce(p_cut_on, false) and (p_cut_percent is null or p_cut_percent <= 0 or p_cut_percent > 50) then
    raise exception 'The gym''s share is a percent from 0.1 to 50.';
  end if;
  if coalesce(p_dues_on, false) and (p_dues_amount is null or p_dues_amount <= 0) then
    raise exception 'Coach dues need an amount above zero.';
  end if;
  update gym_settings
     set coaching_pause = p_pause,
         coaching_cut_on = coalesce(p_cut_on, false),
         coaching_cut_percent = case when coalesce(p_cut_on, false) then round(p_cut_percent, 1) else coaching_cut_percent end,
         coach_dues_amount = case when coalesce(p_dues_on, false) then round(p_dues_amount, 2) else coach_dues_amount end,
         -- Switching dues on starts them this month; staying on keeps the start.
         coach_dues_since = case when coalesce(p_dues_on, false) and not coach_dues_on then v_month
                                 when coalesce(p_dues_on, false) then coalesce(coach_dues_since, v_month)
                                 else coach_dues_since end,
         coach_dues_on = coalesce(p_dues_on, false)
   where gym_id = acting_gym_id();
  if not found then raise exception 'This gym has no settings yet.'; end if;
end;
$$;
revoke all on function set_coaching_house_rules(text, boolean, numeric, boolean, numeric) from public, anon;
grant execute on function set_coaching_house_rules(text, boolean, numeric, boolean, numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- 1. Does coaching pause when the membership freezes?
-- ---------------------------------------------------------------------------
create table if not exists coaching_pauses (
  id             uuid primary key default gen_random_uuid(),
  gym_id         uuid not null references gyms(id) on delete cascade,
  coaching_id    uuid not null,
  membership_id  uuid not null,
  frozen_on      date not null,
  decision       text not null check (decision in ('pending', 'pause', 'keep')),
  decided_by     uuid references profiles(id),
  decided_at     timestamptz,
  resumed_on     date,
  days_credited  int check (days_credited is null or days_credited >= 0),
  created_at     timestamptz not null default now(),
  foreign key (gym_id, coaching_id) references coachings (gym_id, id) on delete cascade,
  foreign key (gym_id, membership_id) references memberships (gym_id, id) on delete cascade,
  unique (coaching_id, frozen_on)
);
create index if not exists coaching_pauses_open_idx on coaching_pauses (gym_id, coaching_id) where resumed_on is null;
alter table coaching_pauses enable row level security;

-- An open pause (paused, or still waiting for the coach) holds the term still.
create or replace function coaching_on_pause(p_coaching uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from coaching_pauses
                  where coaching_id = p_coaching and resumed_on is null and decision in ('pause', 'pending'));
$$;
revoke all on function coaching_on_pause(uuid) from public, anon, authenticated;

create or replace function trg_coaching_follows_freeze() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_rule text; c record; p record; v_days int; v_on date;
begin
  -- Frozen now: open a pause for each active coaching, per the gym's rule.
  if new.status = 'frozen' and old.status is distinct from 'frozen' then
    select pause into v_rule from coaching_house_rules(new.gym_id);
    if v_rule = 'never' then return new; end if;
    v_on := coalesce(new.frozen_at, manila_today());
    for c in select * from coachings
              where gym_id = new.gym_id and member_id = new.member_id and status = 'active' loop
      insert into coaching_pauses (gym_id, coaching_id, membership_id, frozen_on, decision, decided_at)
      values (new.gym_id, c.id, new.id, v_on,
              case when v_rule = 'with_membership' then 'pause' else 'pending' end,
              case when v_rule = 'with_membership' then now() end)
      on conflict (coaching_id, frozen_on) do nothing;
      if v_rule = 'with_membership' then
        perform notify_once(c.member_id, 'booking', 'Your coaching is paused too',
          'Your coaching with ' || display_name_of(c.trainer_id) || ' is paused while your membership is. Its end date moves by the days you are away.',
          '/member/coach', 'coachpause:auto:' || c.id || ':' || v_on, new.gym_id);
      else
        perform notify_once(c.trainer_id, 'booking', 'Pause their coaching?',
          display_name_of(c.member_id) || ' paused their membership. Decide whether your coaching pauses too.',
          '/trainer/today', 'coachpause:ask:' || c.id || ':' || v_on, new.gym_id);
      end if;
    end loop;
    return new;
  end if;

  -- No longer frozen: close each open pause; a paused term gets the days back.
  if old.status = 'frozen' and new.status is distinct from 'frozen' then
    for p in select * from coaching_pauses
              where membership_id = new.id and resumed_on is null for update loop
      v_days := case when p.decision = 'pause' then greatest(0, manila_today() - p.frozen_on) else 0 end;
      if v_days > 0 then
        update coachings set ends_on = ends_on + v_days, reminded_at = null, updated_at = now()
         where id = p.coaching_id and status = 'active' and ends_on is not null;
      end if;
      update coaching_pauses
         set resumed_on = manila_today(), days_credited = v_days,
             decision = case when decision = 'pending' then 'keep' else decision end
       where id = p.id;
    end loop;
  end if;
  return new;
end;
$$;
revoke all on function trg_coaching_follows_freeze() from public, anon, authenticated;
drop trigger if exists memberships_coaching_follows_freeze on memberships;
create trigger memberships_coaching_follows_freeze
  after update of status on memberships
  for each row execute function trg_coaching_follows_freeze();

-- The coach (or the owner) answers a pending pause.
create or replace function decide_coaching_pause(p_id uuid, p_pause boolean) returns void
language plpgsql security definer set search_path = public as $$
declare p coaching_pauses; c coachings;
begin
  select * into p from coaching_pauses where id = p_id and gym_id = current_gym_id() for update;
  if p.id is null then raise exception 'That pause was not found.'; end if;
  select * into c from coachings where id = p.coaching_id;
  if c.trainer_id is distinct from auth.uid() and get_my_role() is distinct from 'admin' then
    raise exception 'Only their coach or the gym owner decides this.' using errcode = '42501';
  end if;
  if p.resumed_on is not null then raise exception 'Their membership is already back on — nothing to decide.'; end if;
  if p.decision <> 'pending' then raise exception 'This was already decided.'; end if;
  update coaching_pauses set decision = case when p_pause then 'pause' else 'keep' end,
         decided_by = auth.uid(), decided_at = now() where id = p_id;
  perform notify_once(c.member_id, 'booking',
    case when p_pause then 'Your coaching is paused too' else 'Your coaching keeps running' end,
    case when p_pause
      then display_name_of(c.trainer_id) || ' paused your coaching with your membership. Its end date moves by the days you are away.'
      else display_name_of(c.trainer_id) || ' kept your coaching running while your membership is paused. It still ends on ' || to_char(c.ends_on, 'Mon DD') || '.' end,
    '/member/coach', 'coachpause:decided:' || p_id, p.gym_id);
end;
$$;
revoke all on function decide_coaching_pause(uuid, boolean) from public, anon;
grant execute on function decide_coaching_pause(uuid, boolean) to authenticated;

-- Pauses the caller may see: their own as member or coach; every one at the desk.
create or replace function my_coaching_pauses()
returns table (id uuid, coaching_id uuid, member_id uuid, member_name text, trainer_id uuid, trainer_name text,
               frozen_on date, decision text, decided_at timestamptz, resumed_on date, days_credited int, ends_on date)
language sql stable security definer set search_path = public as $$
  select p.id, p.coaching_id, c.member_id, display_name_of(c.member_id), c.trainer_id, display_name_of(c.trainer_id),
         p.frozen_on, p.decision, p.decided_at, p.resumed_on, p.days_credited, c.ends_on
    from coaching_pauses p join coachings c on c.id = p.coaching_id
   where p.gym_id = current_gym_id()
     and (c.member_id = auth.uid() or c.trainer_id = auth.uid() or is_front_desk())
   order by p.resumed_on nulls first, p.frozen_on desc
   limit 200;
$$;
revoke all on function my_coaching_pauses() from public, anon;
grant execute on function my_coaching_pauses() to authenticated;

-- The sweep (0181), unchanged except that an open pause holds the term still:
-- no "ends soon" reminder and no ending while the member is away.
create or replace function coaching_sweep() returns int
language plpgsql security definer set search_path = public as $$
declare v_gym uuid := current_gym_id(); n int := 0; c record;
begin
  if v_gym is null then return 0; end if;
  for c in select * from coachings where gym_id = v_gym and status = 'active'
             and ends_on is not null and ends_on <= manila_today() + 7 and reminded_at is null and ends_on > manila_today()
             and not coaching_on_pause(id) loop
    perform notify_once(c.member_id, 'booking', 'Your coaching ends soon',
      'Your coaching with ' || display_name_of(c.trainer_id) || ' ends on ' || to_char(c.ends_on, 'Mon DD') || '. Renew it from Your coach.',
      '/member/coach', 'coaching:soon:' || c.id, v_gym);
    update coachings set reminded_at = now() where id = c.id;
  end loop;
  update coachings set status = 'ended', ended_at = now(), end_reason = coalesce(end_reason, 'The term ended.'), updated_at = now()
   where gym_id = v_gym and status = 'active' and ends_on is not null and ends_on <= manila_today()
     and not coaching_on_pause(id);
  get diagnostics n = row_count;
  -- A request nobody answered in 14 days stops waiting.
  update coachings set status = 'cancelled', end_reason = 'Nobody answered in 14 days.', updated_at = now()
   where gym_id = v_gym and status in ('requested', 'invited') and created_at < now() - interval '14 days';
  return n;
end;
$$;
revoke all on function coaching_sweep() from public, anon;
grant execute on function coaching_sweep() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. The gym's cut of what members pay coaches directly
-- ---------------------------------------------------------------------------
create table if not exists coach_cut_settlements (
  gym_id      uuid not null references gyms(id) on delete cascade,
  trainer_id  uuid not null references profiles(id) on delete cascade,
  month       date not null check (extract(day from month) = 1),
  paid_total  numeric(10,2) not null check (paid_total >= 0),
  percent     numeric(4,1) not null check (percent between 0 and 50),
  amount      numeric(10,2) not null check (amount >= 0),
  marked_by   uuid references profiles(id),
  marked_at   timestamptz not null default now(),
  primary key (gym_id, trainer_id, month)
);
alter table coach_cut_settlements enable row level security;

-- What each coach was paid for packages, month by month (Manila months), and
-- the gym's share. A coach sees their own; the desk sees every coach.
-- A settled month shows what was settled; an open one uses today's percent.
create or replace function coach_earnings(p_months int default 6)
returns table (trainer_id uuid, trainer_name text, month date, paid_total numeric, packages int,
               percent numeric, owed numeric, settled boolean, settled_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare v_gym uuid := current_gym_id(); r record; v_from date;
begin
  if v_gym is null or auth.uid() is null then return; end if;
  if not is_front_desk() and get_my_role() is distinct from 'trainer' then
    raise exception 'Only coaches and the front desk see coaching earnings.' using errcode = '42501';
  end if;
  select * into r from coaching_house_rules(v_gym);
  if not r.cut_on then return; end if;
  v_from := (date_trunc('month', manila_today()) - make_interval(months => greatest(1, least(coalesce(p_months, 6), 24)) - 1))::date;
  return query
  with coaches as (
    select gr.user_id as tid from gym_roles gr
     where gr.gym_id = v_gym and gr.role = 'trainer' and gr.status = 'active'
    union
    select c.trainer_id from coachings c
     where c.gym_id = v_gym and c.fee_mode = 'trainer_direct' and c.paid_at is not null
       and (c.paid_at at time zone 'Asia/Manila')::date >= v_from
  ), months as (
    select generate_series(v_from, date_trunc('month', manila_today())::date, interval '1 month')::date as m
  ), paid as (
    select c.trainer_id as tid, date_trunc('month', (c.paid_at at time zone 'Asia/Manila'))::date as m,
           sum(coalesce(c.price, 0)) as total, count(*)::int as n
      from coachings c
     where c.gym_id = v_gym and c.fee_mode = 'trainer_direct' and c.paid_at is not null
       and (c.paid_at at time zone 'Asia/Manila')::date >= v_from
     group by 1, 2
  )
  select co.tid, display_name_of(co.tid), mo.m,
         coalesce(s.paid_total, pd.total, 0)::numeric, coalesce(pd.n, 0),
         coalesce(s.percent, r.cut_percent)::numeric,
         coalesce(s.amount, round(coalesce(pd.total, 0) * r.cut_percent / 100, 2))::numeric,
         s.trainer_id is not null, s.marked_at
    from coaches co cross join months mo
    left join paid pd on pd.tid = co.tid and pd.m = mo.m
    left join coach_cut_settlements s on s.gym_id = v_gym and s.trainer_id = co.tid and s.month = mo.m
   where is_front_desk() or co.tid = auth.uid()
   order by 2, 3 desc;
end;
$$;
revoke all on function coach_earnings(int) from public, anon;
grant execute on function coach_earnings(int) to authenticated;

-- The desk marks a month's share as paid to the gym; the owner can undo it.
create or replace function settle_coach_cut(p_trainer uuid, p_month date) returns void
language plpgsql security definer set search_path = public as $$
declare v_gym uuid := current_gym_id(); r record; v_m date := date_trunc('month', p_month)::date; v_total numeric;
begin
  if not is_front_desk() then raise exception 'The front desk records what a coach gave the gym.' using errcode = '42501'; end if;
  select * into r from coaching_house_rules(v_gym);
  if not r.cut_on then raise exception 'This gym does not take a share of coaching.'; end if;
  if v_m > date_trunc('month', manila_today())::date then raise exception 'That month has not happened yet.'; end if;
  select coalesce(sum(coalesce(price, 0)), 0) into v_total from coachings
   where gym_id = v_gym and trainer_id = p_trainer and fee_mode = 'trainer_direct' and paid_at is not null
     and date_trunc('month', (paid_at at time zone 'Asia/Manila'))::date = v_m;
  insert into coach_cut_settlements (gym_id, trainer_id, month, paid_total, percent, amount, marked_by)
  values (v_gym, p_trainer, v_m, v_total, r.cut_percent, round(v_total * r.cut_percent / 100, 2), auth.uid())
  on conflict (gym_id, trainer_id, month) do nothing;
  if not found then raise exception 'That month is already marked paid.'; end if;
end;
$$;
revoke all on function settle_coach_cut(uuid, date) from public, anon;
grant execute on function settle_coach_cut(uuid, date) to authenticated;

create or replace function unsettle_coach_cut(p_trainer uuid, p_month date) returns void
language plpgsql security definer set search_path = public as $$
begin
  if get_my_role() is distinct from 'admin' then raise exception 'Only the gym owner can undo a settled month.' using errcode = '42501'; end if;
  delete from coach_cut_settlements
   where gym_id = current_gym_id() and trainer_id = p_trainer and month = date_trunc('month', p_month)::date;
  if not found then raise exception 'That month was not marked paid.'; end if;
end;
$$;
revoke all on function unsettle_coach_cut(uuid, date) from public, anon;
grant execute on function unsettle_coach_cut(uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Coach dues
-- ---------------------------------------------------------------------------
create table if not exists coach_dues_payments (
  id           uuid primary key default gen_random_uuid(),
  gym_id       uuid not null references gyms(id) on delete cascade,
  trainer_id   uuid not null references profiles(id) on delete cascade,
  month        date not null check (extract(day from month) = 1),
  amount       numeric(10,2) not null check (amount > 0),
  method       text not null check (method in ('cash', 'gcash', 'maya', 'bank', 'other')),
  note         text check (note is null or length(note) <= 200),
  recorded_by  uuid references profiles(id),
  recorded_at  timestamptz not null default now(),
  unique (gym_id, trainer_id, month)
);
alter table coach_dues_payments enable row level security;

-- Each coach's months from dues_since (or the month they joined, if later) to
-- this month: what was due and what was paid. A coach sees their own; the desk
-- sees every active coach.
create or replace function coach_dues(p_months int default 12)
returns table (trainer_id uuid, trainer_name text, month date, due numeric, paid numeric,
               method text, recorded_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare v_gym uuid := current_gym_id(); r record; v_now date := date_trunc('month', manila_today())::date;
begin
  if v_gym is null or auth.uid() is null then return; end if;
  if not is_front_desk() and get_my_role() is distinct from 'trainer' then
    raise exception 'Only coaches and the front desk see coach dues.' using errcode = '42501';
  end if;
  select * into r from coaching_house_rules(v_gym);
  if not r.dues_on or r.dues_since is null then return; end if;
  return query
  select gr.user_id, display_name_of(gr.user_id), m.m::date, r.dues_amount::numeric,
         d.amount::numeric, d.method, d.recorded_at
    from gym_roles gr
    cross join lateral generate_series(
      greatest(r.dues_since, date_trunc('month', gr.created_at at time zone 'Asia/Manila')::date,
               (v_now - make_interval(months => greatest(1, least(coalesce(p_months, 12), 36)) - 1))::date),
      v_now, interval '1 month') m(m)
    left join coach_dues_payments d on d.gym_id = v_gym and d.trainer_id = gr.user_id and d.month = m.m::date
   where gr.gym_id = v_gym and gr.role = 'trainer' and gr.status = 'active'
     and (is_front_desk() or gr.user_id = auth.uid())
   order by 2, 3 desc;
end;
$$;
revoke all on function coach_dues(int) from public, anon;
grant execute on function coach_dues(int) to authenticated;

create or replace function record_coach_dues(p_trainer uuid, p_month date, p_amount numeric, p_method text, p_note text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare v_gym uuid := current_gym_id(); r record; v_m date := date_trunc('month', p_month)::date;
begin
  if not is_front_desk() then raise exception 'The front desk records coach dues.' using errcode = '42501'; end if;
  select * into r from coaching_house_rules(v_gym);
  if not r.dues_on then raise exception 'This gym does not charge coach dues.'; end if;
  if not exists (select 1 from gym_roles where gym_id = v_gym and user_id = p_trainer and role = 'trainer') then
    raise exception 'That person is not a coach here.';
  end if;
  if v_m < r.dues_since then raise exception 'Dues start in %.', to_char(r.dues_since, 'FMMonth YYYY'); end if;
  if v_m > (date_trunc('month', manila_today()) + interval '1 month')::date then
    raise exception 'Record this month or next month at the latest.';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Enter the amount paid.'; end if;
  if p_method is null or p_method not in ('cash', 'gcash', 'maya', 'bank', 'other') then
    raise exception 'Choose how it was paid.';
  end if;
  insert into coach_dues_payments (gym_id, trainer_id, month, amount, method, note, recorded_by)
  values (v_gym, p_trainer, v_m, round(p_amount, 2), p_method, nullif(btrim(coalesce(p_note, '')), ''), auth.uid())
  on conflict (gym_id, trainer_id, month) do nothing;
  if not found then raise exception 'That month is already recorded.'; end if;
end;
$$;
revoke all on function record_coach_dues(uuid, date, numeric, text, text) from public, anon;
grant execute on function record_coach_dues(uuid, date, numeric, text, text) to authenticated;

create or replace function undo_coach_dues(p_trainer uuid, p_month date) returns void
language plpgsql security definer set search_path = public as $$
begin
  if get_my_role() is distinct from 'admin' then raise exception 'Only the gym owner can undo a recorded payment.' using errcode = '42501'; end if;
  delete from coach_dues_payments
   where gym_id = current_gym_id() and trainer_id = p_trainer and month = date_trunc('month', p_month)::date;
  if not found then raise exception 'That month was not recorded.'; end if;
end;
$$;
revoke all on function undo_coach_dues(uuid, date) from public, anon;
grant execute on function undo_coach_dues(uuid, date) to authenticated;

-- The tenancy register (0220's list, plus the three tables above).
create or replace function tenancy_gym_tables() returns text[] language sql immutable as $$
  select array['account_status_events','achievement_unlocks','achievements','activity_log',
    'ai_coach_profiles','ai_meal_guides','ai_proposals','ai_usage_days',
    'assistant_conversations','assistant_messages','attendance','body_measurements','bookings',
    'cancellation_reasons','cash_closeouts','challenge_participants','challenges','checkin_picks','class_templates',
    'class_waitlist','classes','coach_checkins','coaching_prices','coaching_standins','coachings','conversations',
    'equipment_exercises','equipment_reports','event_registrations','events','fitness_goals','freemium_trials',
    'goal_templates','guest_visits','guests','gym_equipment','gym_exercise_media','gym_goals','gym_house_rules','gym_invitations','gym_modules','gym_payment_methods','gym_photos','gym_plans',
    'gym_program_days','gym_programs','gym_settings','gym_terms_acceptances','gym_waivers','gym_workout_items','gym_workouts',
    'house_rules_acceptances','invoice_counters','member_profiles','member_share_prefs','membership_events',
    'membership_plans','membership_requests','memberships','messages',
    'notifications','payments','pending_registrations','personal_records','plan_features',
    'point_ledger','point_rules','program_enrolments','progress_photos',
    'pt_sessions','referral_codes','referrals','refund_rules','renewal_requests',
    'reward_redemptions','rewards','room_assignments','room_comments','room_leaves','room_members','room_posts',
    'room_submissions','rooms',
    'saved_resources','season_claims','season_tiers','shop_products','shop_sale_items','shop_sales',
    'squad_members','squad_weeks','squads','staff_permissions','stock_moves','streak_milestones','terms_acceptances',
    'trainer_availability','trainer_credentials','trainer_feedback','trainer_payment_methods','trainer_profiles',
    'trainer_ratings','waiver_acceptances','winback_rules','winback_sends','workout_logs','workout_plans',
    'workout_routine_exercises','workout_routine_versions','workout_routines','workout_sets',
    -- 0235: coaching house rules — each is one gym's.
    'coaching_pauses','coach_cut_settlements','coach_dues_payments']::text[]
$$;

create or replace function migration_0235_applied() returns boolean language sql stable as $$ select true $$;
grant execute on function migration_0235_applied() to anon, authenticated;
