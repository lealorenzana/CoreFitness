-- 0028 — earned training levels, and achievements that are actually earned.
--
-- Migration 0020 deleted the old badges tab with the note: "no table and no
-- earning rules — gamification with nothing behind it." This is the sequel that
-- supplies both, so the feature can come back honest.
--
-- Three decisions worth defending:
--
--   1. **The rules live in SQL, not in the client.** If the browser decided who
--      had earned what and then INSERTed the row, any member could unlock
--      anything with one REST call. `sync_my_achievements()` is SECURITY
--      DEFINER, reads the real tables, and is the *only* thing granted INSERT
--      on `achievement_unlocks`. The app can ask "what have I earned?" — it
--      cannot answer the question itself.
--
--   2. **The earned level never replaces `experience_level`.** That column is
--      self-declared (0016 deliberately relaxed the tamper trigger for it) and
--      drives class recommendations. Somebody who trained for ten years
--      elsewhere is advanced on day one here with zero check-ins, and
--      overwriting their answer with "Beginner" would be the app telling a
--      member something false about themselves. The earned level is a second,
--      separate thing: what *this gym* has recorded. The UI suggests, the
--      member decides.
--
--   3. **A level, once reached, is kept.** Reaching Intermediate writes an
--      unlock row, and the displayed level is the highest of "computed now" and
--      "highest ever unlocked". Same reasoning as `fitness_goals.achieved_on`
--      in 0020: a quiet month is not grounds for demoting somebody.

-- ============================================================================
-- TRAINING STATS — one query, one definition of every number
-- ============================================================================
--
-- A **training day** is a calendar day (Manila) on which the member either was
-- checked in at the desk or logged a workout themselves. Counting days rather
-- than rows is what stops three log entries on one afternoon reading as three
-- sessions.
--
-- The two sources are deliberately unequal and both are reported separately:
-- `verified_days` are check-ins the gym recorded, `logged_days` are the
-- member's own word for it. The level uses the combined figure, because a
-- member training at home is still training; the split is exposed so a screen
-- can say which is which instead of implying the gym witnessed all of it.

create or replace function member_training_stats(uid uuid)
returns table (
  training_days        int,
  verified_days        int,
  logged_days          int,
  consistent_weeks     int,
  current_week_streak  int,
  best_week_streak     int,
  weekend_days         int,
  early_checkins       int,
  late_checkins        int,
  distinct_activities  int,
  goals_achieved       int,
  measurements         int,
  classes_attended     int,
  pt_sessions_done     int,
  member_since         date
)
language sql
stable
security definer
set search_path = public
as $$
  with
  -- Every training day from both sources, tagged with where it came from.
  raw as (
    select (a.check_in_time at time zone 'Asia/Manila')::date as d, true as verified
    from attendance a
    where a.member_id = uid
    union all
    select w.performed_on, false
    from workout_logs w
    where w.member_id = uid
  ),
  by_day as (
    select d, bool_or(verified) as verified
    from raw
    group by d
  ),
  -- A week is "consistent" at two or more training days. One visit in a week
  -- is an appearance; two is a pattern.
  weeks as (
    select date_trunc('week', d)::date as wk, count(*) as n
    from by_day
    group by 1
  ),
  consistent as (
    select wk from weeks where n >= 2
  ),
  -- Longest unbroken run of consistent weeks, ever.
  --
  -- Classic gaps-and-islands: for consecutive weeks, `wk` grows by exactly 7
  -- while the row number grows by 1, so `wk - rn*7` is constant across a run
  -- and changes at every gap. Grouping on it counts the runs.
  islands as (
    -- row_number() is bigint and there is no `date - bigint` operator, hence
    -- the cast.
    select wk - ((row_number() over (order by wk))::int * 7) as grp
    from consistent
  ),
  best as (
    select coalesce(max(cnt), 0) as run from (
      select count(*) as cnt from islands group by grp
    ) t
  ),
  -- Current run: the same idea walked backwards from the most recent consistent
  -- week, which is allowed to be *last* week as well as this one — on a Tuesday
  -- the current week cannot have two days in it yet, and a streak that
  -- evaporates every Monday would be a bug, not a rule.
  anchor as (
    select max(wk) as wk
    from consistent
    where wk <= date_trunc('week', (now() at time zone 'Asia/Manila')::date)::date
      and wk >= date_trunc('week', (now() at time zone 'Asia/Manila')::date)::date - 7
  ),
  backwards as (
    select c.wk, (row_number() over (order by c.wk desc))::int as rn
    from consistent c, anchor
    where anchor.wk is not null and c.wk <= anchor.wk
  ),
  current_run as (
    -- Rows stay aligned with `anchor - (rn-1)*7` only while unbroken; after a
    -- gap the actual week is always further back than the expected one and can
    -- never realign, so a plain count of the aligned rows is the run length.
    select count(*) as run
    from backwards, anchor
    where backwards.wk = anchor.wk - ((backwards.rn - 1) * 7)
  ),
  activities as (
    select distinct lower(trim(act)) as act from (
      select a.activity as act from attendance a where a.member_id = uid and a.activity is not null
      union all
      select w.activity from workout_logs w where w.member_id = uid and w.activity is not null
    ) s
    where trim(act) <> ''
  )
  select
    (select count(*) from by_day)::int,
    (select count(*) from by_day where verified)::int,
    (select count(*) from by_day where not verified)::int,
    (select count(*) from consistent)::int,
    (select run from current_run)::int,
    (select run from best)::int,
    (select count(*) from by_day where extract(isodow from d) in (6, 7))::int,
    (select count(*) from attendance a
      where a.member_id = uid
        and extract(hour from (a.check_in_time at time zone 'Asia/Manila')) < 7)::int,
    (select count(*) from attendance a
      where a.member_id = uid
        and extract(hour from (a.check_in_time at time zone 'Asia/Manila')) >= 20)::int,
    (select count(*) from activities)::int,
    (select count(*) from fitness_goals g where g.member_id = uid and g.achieved_on is not null)::int,
    (select count(*) from body_measurements m where m.member_id = uid)::int,
    -- Attended, not booked: the class has to have actually happened.
    (select count(*) from bookings b
       join classes c on c.id = b.class_id
      where b.member_id = uid and b.status = 'approved' and c.scheduled_at < now())::int,
    (select count(*) from pt_sessions p
      where p.member_id = uid and p.status = 'approved' and p.starts_at < now())::int,
    (select mp.created_at::date from member_profiles mp where mp.profile_id = uid);
$$;

-- ============================================================================
-- TRAINER STATS
-- ============================================================================
--
-- `pt_sessions` has no 'completed' status — the enum is the shared
-- `booking_status`. An approved session whose start time has passed is the
-- closest honest reading of "delivered", and it is what the trainer's own
-- schedule screen already shows as past work.

create or replace function trainer_stats(uid uuid)
returns table (
  sessions_delivered  int,
  distinct_members    int,
  classes_led         int,
  notes_sent          int,
  availability_windows int,
  profile_complete    boolean,
  days_active         int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*) from pt_sessions p
      where p.trainer_id = uid and p.status = 'approved' and p.starts_at < now())::int,
    (select count(distinct p.member_id) from pt_sessions p
      where p.trainer_id = uid and p.status = 'approved' and p.starts_at < now())::int,
    -- Classes that ran *and* somebody came to. The scheduler generates rows
    -- from templates weeks ahead, so counting bare `classes` rows would award
    -- a trainer for sessions nobody booked.
    (select count(distinct c.id) from classes c
       join bookings b on b.class_id = c.id and b.status = 'approved'
      where c.trainer_id = uid and c.scheduled_at < now())::int,
    (select count(*) from notifications n
      where n.type in ('recommendation', 'trainer_recommendation', 'trainer_feedback')
        and n.metadata ->> 'from_trainer_id' = uid::text)::int,
    (select count(*) from trainer_availability t where t.trainer_id = uid)::int,
    coalesce((select coalesce(trim(tp.specialization), '') <> ''
        and coalesce(trim(tp.bio), '') <> ''
        and pr.photo_url is not null
       from trainer_profiles tp join profiles pr on pr.id = tp.profile_id
      where tp.profile_id = uid), false),
    (select greatest(0, (current_date - pr.created_at::date))::int
       from profiles pr where pr.id = uid);
$$;

-- ============================================================================
-- LEVELS
-- ============================================================================
--
-- Two axes, and **both** must be met. Volume alone can be crammed into a
-- fortnight; consistency alone can be two months of showing up twice and
-- nothing more. Requiring both is what makes the level mean "has built a
-- habit" rather than "has been enthusiastic once".
--
--   Intermediate — 20 training days and 6 consistent weeks   (~2.5 months @ 2x)
--   Advanced     — 60 training days and 16 consistent weeks  (~7 months @ 2x)
--
-- Neither threshold references a paid entitlement. Gating Advanced behind PT
-- sessions or class bookings would make it unreachable on the free tier, which
-- is every self-registered member.

create or replace function level_thresholds(lvl text)
returns table (days int, weeks int)
language sql immutable as $$
  select t.d, t.w from (values
    ('beginner',      0,  0),
    ('intermediate', 20,  6),
    ('advanced',     60, 16)
  ) as t(name, d, w)
  where t.name = lvl;
$$;

-- ============================================================================
-- ACHIEVEMENT UNLOCKS
-- ============================================================================
--
-- Only the unlock is stored. The catalogue — title, description, icon, tier —
-- lives in the app (`src/data/achievements.ts`), because it is presentation and
-- because a second copy of the rules in a table would drift from the ones
-- below. The two are joined by `achievement_key`; adding an achievement means
-- touching this function *and* that file.

create table if not exists achievement_unlocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  achievement_key text not null,
  -- The day it was first detected, not the day the criterion was truly met.
  -- Honest naming: nobody is watching the tables in real time, and back-dating
  -- it would be an invention.
  unlocked_on date not null default (now() at time zone 'Asia/Manila')::date,
  -- Cleared once the celebration has been shown, so it fires exactly once.
  seen boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, achievement_key)
);

create index if not exists idx_achievement_unlocks_user
  on achievement_unlocks(user_id, unlocked_on desc);

alter table achievement_unlocks enable row level security;

drop policy if exists achievement_unlocks_select_self on achievement_unlocks;
create policy achievement_unlocks_select_self on achievement_unlocks
  for select using (user_id = auth.uid());

-- Trainers and the front desk can see them; a coach congratulating a member on
-- a milestone is the point of the feature.
drop policy if exists achievement_unlocks_select_staff on achievement_unlocks;
create policy achievement_unlocks_select_staff on achievement_unlocks
  for select using (get_my_role() in ('admin', 'staff', 'trainer'));

-- Marking one seen is the only write anybody gets. There is deliberately **no**
-- INSERT policy: rows arrive solely from `sync_my_achievements()`, which runs
-- as definer and therefore bypasses RLS. An UPDATE cannot change which
-- achievement a row is for, only whether its celebration has played.
drop policy if exists achievement_unlocks_mark_seen on achievement_unlocks;
create policy achievement_unlocks_mark_seen on achievement_unlocks
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============================================================================
-- THE EVALUATOR
-- ============================================================================
--
-- Runs for the caller only — no uid parameter, so there is no way to ask it to
-- grade somebody else. Returns just the keys it newly inserted, which is what
-- the celebration queue needs; everything already unlocked is read normally
-- through the table.

create or replace function sync_my_achievements()
returns setof text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  role_name text;
  earned text[] := '{}';
  s record;
  t record;
  lvl_days int;
  lvl_weeks int;
begin
  if uid is null then
    return;
  end if;

  select p.role::text into role_name from profiles p where p.id = uid;

  if role_name = 'member' then
    select * into s from member_training_stats(uid);

    if s.verified_days >= 1        then earned := earned || 'first_checkin'::text; end if;
    if s.training_days >= 10       then earned := earned || 'days_10'::text; end if;
    if s.training_days >= 25       then earned := earned || 'days_25'::text; end if;
    if s.training_days >= 50       then earned := earned || 'days_50'::text; end if;
    if s.training_days >= 100      then earned := earned || 'days_100'::text; end if;
    if s.best_week_streak >= 4     then earned := earned || 'streak_4'::text; end if;
    if s.best_week_streak >= 12    then earned := earned || 'streak_12'::text; end if;
    if s.early_checkins >= 5       then earned := earned || 'early_bird'::text; end if;
    if s.late_checkins >= 5        then earned := earned || 'night_owl'::text; end if;
    if s.weekend_days >= 8         then earned := earned || 'weekend_warrior'::text; end if;
    if s.distinct_activities >= 3  then earned := earned || 'all_rounder'::text; end if;
    if s.goals_achieved >= 1       then earned := earned || 'goal_first'::text; end if;
    if s.goals_achieved >= 3       then earned := earned || 'goal_three'::text; end if;
    if s.measurements >= 1         then earned := earned || 'measure_first'::text; end if;
    if s.measurements >= 10        then earned := earned || 'measure_ten'::text; end if;
    if s.classes_attended >= 1     then earned := earned || 'class_first'::text; end if;
    if s.classes_attended >= 10    then earned := earned || 'class_ten'::text; end if;
    if s.pt_sessions_done >= 1     then earned := earned || 'pt_first'::text; end if;

    if s.member_since is not null and s.member_since <= current_date - 180 then
      earned := earned || 'loyal_six_months'::text;
    end if;
    if s.member_since is not null and s.member_since <= current_date - 365 then
      earned := earned || 'loyal_one_year'::text;
    end if;

    select days, weeks into lvl_days, lvl_weeks from level_thresholds('intermediate');
    if s.training_days >= lvl_days and s.consistent_weeks >= lvl_weeks then
      earned := earned || 'level_intermediate'::text;
    end if;

    select days, weeks into lvl_days, lvl_weeks from level_thresholds('advanced');
    if s.training_days >= lvl_days and s.consistent_weeks >= lvl_weeks then
      earned := earned || 'level_advanced'::text;
    end if;

  elsif role_name = 'trainer' then
    select * into t from trainer_stats(uid);

    if t.availability_windows >= 1 then earned := earned || 'coach_open_for_business'::text; end if;
    if t.profile_complete          then earned := earned || 'coach_full_profile'::text; end if;
    if t.sessions_delivered >= 1   then earned := earned || 'coach_first_session'::text; end if;
    if t.sessions_delivered >= 25  then earned := earned || 'coach_sessions_25'::text; end if;
    if t.sessions_delivered >= 100 then earned := earned || 'coach_sessions_100'::text; end if;
    if t.distinct_members >= 10    then earned := earned || 'coach_members_10'::text; end if;
    if t.distinct_members >= 25    then earned := earned || 'coach_members_25'::text; end if;
    if t.classes_led >= 1          then earned := earned || 'coach_first_class'::text; end if;
    if t.classes_led >= 50         then earned := earned || 'coach_classes_50'::text; end if;
    if t.notes_sent >= 10          then earned := earned || 'coach_notes_10'::text; end if;
    if t.days_active >= 365        then earned := earned || 'coach_one_year'::text; end if;
  else
    -- Admin and staff have no achievement set. Front-desk work is measured by
    -- the transactions it records, not by badges.
    return;
  end if;

  -- Wrapped in a CTE because RETURN QUERY takes a query, not a data-modifying
  -- statement. `do nothing` means a re-sync returns an empty set rather than
  -- re-firing every celebration the member has already seen.
  return query
  with ins as (
    insert into achievement_unlocks (user_id, achievement_key)
    select uid, k from unnest(earned) as k
    on conflict (user_id, achievement_key) do nothing
    returning achievement_key
  )
  select ins.achievement_key from ins;
end;
$$;

-- ============================================================================
-- PROGRESSION READ
-- ============================================================================
--
-- The single source of truth for the level screens: the raw counts, the level
-- they add up to, and the pair of numbers the next level needs. Thresholds are
-- returned rather than duplicated in TypeScript, so the bar on screen can never
-- disagree with the rule that grants the badge.

create or replace function member_progression(uid uuid default auth.uid())
returns table (
  level               text,
  computed_level      text,
  training_days       int,
  verified_days       int,
  logged_days         int,
  consistent_weeks    int,
  current_week_streak int,
  best_week_streak    int,
  next_level          text,
  next_days           int,
  next_weeks          int,
  member_since        date
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s record;
  computed text := 'beginner';
  held text := 'beginner';
  nxt text;
  nd int;
  nw int;
  d int;
  w int;
begin
  -- A member reads their own; the people who coach and serve them can read it
  -- too. SECURITY DEFINER bypasses RLS on the underlying tables, so the check
  -- has to be here.
  if uid is null or (uid <> auth.uid() and get_my_role() not in ('admin', 'staff', 'trainer')) then
    raise exception 'Not allowed to read this member''s progression';
  end if;

  select * into s from member_training_stats(uid);

  select days, weeks into d, w from level_thresholds('intermediate');
  if s.training_days >= d and s.consistent_weeks >= w then computed := 'intermediate'; end if;

  select days, weeks into d, w from level_thresholds('advanced');
  if s.training_days >= d and s.consistent_weeks >= w then computed := 'advanced'; end if;

  -- The ratchet: a level reached stays reached, even if the definition of
  -- "currently" would now say otherwise.
  if exists (select 1 from achievement_unlocks a
              where a.user_id = uid and a.achievement_key = 'level_advanced') then
    held := 'advanced';
  elsif exists (select 1 from achievement_unlocks a
                 where a.user_id = uid and a.achievement_key = 'level_intermediate') then
    held := 'intermediate';
  end if;

  if computed = 'advanced' or held = 'advanced' then
    held := 'advanced';
    nxt := null;
  elsif computed = 'intermediate' or held = 'intermediate' then
    held := 'intermediate';
    nxt := 'advanced';
  else
    held := 'beginner';
    nxt := 'intermediate';
  end if;

  if nxt is not null then
    select days, weeks into nd, nw from level_thresholds(nxt);
  end if;

  return query select
    held, computed,
    s.training_days, s.verified_days, s.logged_days,
    s.consistent_weeks, s.current_week_streak, s.best_week_streak,
    nxt, nd, nw, s.member_since;
end;
$$;

-- ============================================================================
-- GRANTS
-- ============================================================================
-- The stats functions are definer-rights and unguarded, so they are **not**
-- exposed to clients — only the two guarded entry points above are callable.

revoke all on function member_training_stats(uuid) from public, anon, authenticated;
revoke all on function trainer_stats(uuid) from public, anon, authenticated;

grant execute on function sync_my_achievements() to authenticated;
grant execute on function member_progression(uuid) to authenticated;
grant execute on function level_thresholds(text) to authenticated;
