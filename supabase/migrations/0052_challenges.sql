-- 0052 — gym challenges: a target, a window, and points for finishing.
--
-- `events` (0014) already exists for things the gym announces. A challenge is
-- different in one way that matters: it has a **measurable target**, and the
-- system decides whether you hit it. Nobody ticks a box.
--
-- ---------------------------------------------------------------------------
-- Not every metric can be a challenge
-- ---------------------------------------------------------------------------
-- Reusing `achievement_metrics` (0038) as the vocabulary means the admin picks
-- from a dropdown of things the system can actually compute, rather than typing
-- a key that silently never matches. But ten of the twenty-two are wrong for a
-- challenge, and offering them would produce challenges that are nonsense
-- rather than merely hard:
--
--   * the seven `audience = 'trainer'` metrics — challenges are for members;
--   * `days_as_member` — a tenure, not an activity. Every member "completes"
--     a 30-day version of it on the day it opens;
--   * `current_week_streak` / `best_week_streak` — a streak is a property of a
--     whole history. "Best streak >= 3 during November" is not a question the
--     data can answer honestly;
--   * `profile_complete` — boolean, so a numeric target is meaningless.
--
-- So the restriction becomes a column the admin can see, rather than a rule
-- hidden inside a dropdown's code.
--
-- ---------------------------------------------------------------------------
-- Progress is computed, never stored
-- ---------------------------------------------------------------------------
-- A `progress int` column would need updating from every table that can move
-- it — attendance, workout_logs, bookings, goals — and would be wrong the first
-- time one of those was edited or deleted. Counting at read time cannot drift,
-- and cannot be self-reported.
--
-- It also must NOT call the lifetime metrics function from 0028. That returns
-- totals over all history and ignores `starts_on` entirely, so every long-
-- standing member would complete a new challenge on the day it opened.

-- ============================================================================
-- 1. WHICH METRICS MAY BE USED
-- ============================================================================
alter table achievement_metrics
  add column if not exists challengeable boolean not null default false;

comment on column achievement_metrics.challengeable is
  'True when the metric can be counted inside a date window. Excludes trainer '
  'metrics, tenure, streaks and booleans — see the header of 0052.';

update achievement_metrics set challengeable = false;
update achievement_metrics set challengeable = true
 where audience = 'member'
   and key in ('training_days','verified_days','logged_days','consistent_weeks',
               'weekend_days','early_checkins','late_checkins',
               'distinct_activities','goals_achieved','measurements',
               'classes_attended','pt_sessions_done');

-- ============================================================================
-- 2. THE CHALLENGES
-- ============================================================================
create table if not exists challenges (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  description   text,
  metric_key    text not null references achievement_metrics(key),
  target        int not null check (target > 0),
  starts_on     date not null,
  ends_on       date not null,
  reward_points int not null default 0 check (reward_points >= 0),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  constraint challenges_window check (ends_on >= starts_on)
);

create index if not exists idx_challenges_open
  on challenges(ends_on) where is_active;

create table if not exists challenge_participants (
  challenge_id uuid not null references challenges(id) on delete cascade,
  member_id    uuid not null references member_profiles(profile_id) on delete cascade,
  joined_at    timestamptz not null default now(),
  completed_on date,
  primary key (challenge_id, member_id)
);

-- ============================================================================
-- 3. PROGRESS
-- ============================================================================
-- Every branch counts the same thing 0028 counts, restricted to the challenge's
-- window. Where 0028 defines a day as "attendance OR a workout log", so does
-- this — otherwise a badge and a challenge would disagree about whether the
-- member trained, and the member would be right to trust neither.
create or replace function challenge_progress(p_challenge uuid, p_member uuid)
returns int
language plpgsql stable security definer set search_path = public as $fn$
declare
  c record;
  n int := 0;
begin
  select * into c from challenges where id = p_challenge;
  if c is null then
    return 0;
  end if;

  -- Only the member themselves, or the gym, may read a progress figure.
  if p_member is distinct from auth.uid()
     and get_my_role() not in ('admin','staff','trainer') then
    return 0;
  end if;

  with raw as (
    select (a.check_in_time at time zone 'Asia/Manila')::date as d, true as verified
      from attendance a
     where a.member_id = p_member
       and (a.check_in_time at time zone 'Asia/Manila')::date between c.starts_on and c.ends_on
    union all
    select w.performed_on, false
      from workout_logs w
     where w.member_id = p_member
       and w.performed_on between c.starts_on and c.ends_on
  ),
  by_day as (
    select d, bool_or(verified) as verified from raw group by d
  ),
  weeks as (
    select date_trunc('week', d)::date as wk, count(*) as k from by_day group by 1
  ),
  activities as (
    select distinct lower(trim(act)) as act from (
      select a.activity as act from attendance a
       where a.member_id = p_member and a.activity is not null
         and (a.check_in_time at time zone 'Asia/Manila')::date between c.starts_on and c.ends_on
      union all
      select w.activity from workout_logs w
       where w.member_id = p_member and w.activity is not null
         and w.performed_on between c.starts_on and c.ends_on
    ) s
    where trim(act) <> ''
  )
  select case c.metric_key
    when 'training_days'       then (select count(*) from by_day)
    when 'verified_days'       then (select count(*) from by_day where verified)
    when 'logged_days'         then (select count(*) from by_day where not verified)
    when 'consistent_weeks'    then (select count(*) from weeks where k >= 2)
    when 'weekend_days'        then (select count(*) from by_day where extract(isodow from d) in (6,7))
    when 'distinct_activities' then (select count(*) from activities)
    when 'early_checkins'      then (select count(*) from attendance a
                                      where a.member_id = p_member
                                        and extract(hour from (a.check_in_time at time zone 'Asia/Manila')) < 7
                                        and (a.check_in_time at time zone 'Asia/Manila')::date between c.starts_on and c.ends_on)
    when 'late_checkins'       then (select count(*) from attendance a
                                      where a.member_id = p_member
                                        and extract(hour from (a.check_in_time at time zone 'Asia/Manila')) >= 20
                                        and (a.check_in_time at time zone 'Asia/Manila')::date between c.starts_on and c.ends_on)
    when 'goals_achieved'      then (select count(*) from fitness_goals g
                                      where g.member_id = p_member and g.achieved_on between c.starts_on and c.ends_on)
    -- `measured_on`, not `created_at`: the day it was measured, not the day it
    -- was typed in (0020). A member catching up on a week of entries must not
    -- have them all land inside whatever window is open today.
    when 'measurements'        then (select count(*) from body_measurements m
                                      where m.member_id = p_member
                                        and m.measured_on between c.starts_on and c.ends_on)
    -- "Attended", exactly as 0028 means it: approved, and the time has passed.
    when 'classes_attended'    then (select count(*) from bookings b
                                      join classes cl on cl.id = b.class_id
                                     where b.member_id = p_member and b.status = 'approved'
                                       and cl.scheduled_at < now()
                                       and (cl.scheduled_at at time zone 'Asia/Manila')::date between c.starts_on and c.ends_on)
    when 'pt_sessions_done'    then (select count(*) from pt_sessions p
                                      where p.member_id = p_member and p.status = 'approved'
                                        and p.starts_at < now()
                                        and (p.starts_at at time zone 'Asia/Manila')::date between c.starts_on and c.ends_on)
    else 0
  end into n;

  return coalesce(n, 0);
end;
$fn$;

-- ============================================================================
-- 4. COMPLETION AND THE AWARD
-- ============================================================================
-- Deliberately NOT called by the client. `completed_on` is written here or not
-- at all, and the points ledger's UNIQUE means running this repeatedly cannot
-- pay twice even if something calls it in a loop.
create or replace function settle_challenges() returns int
language plpgsql security definer set search_path = public as $fn$
declare
  r record;
  n int := 0;
begin
  for r in
    select p.challenge_id, p.member_id, c.target, c.reward_points
      from challenge_participants p
      join challenges c on c.id = p.challenge_id
     where p.completed_on is null
       and c.is_active
       -- Still running, or finished within the last week: a challenge that
       -- ended on Sunday must still settle on Monday.
       and c.starts_on <= (now() at time zone 'Asia/Manila')::date
       and c.ends_on >= (now() at time zone 'Asia/Manila')::date - 7
  loop
    if challenge_progress(r.challenge_id, r.member_id) >= r.target then
      update challenge_participants
         set completed_on = (now() at time zone 'Asia/Manila')::date
       where challenge_id = r.challenge_id and member_id = r.member_id;

      if r.reward_points > 0 then
        -- Routed through award_points so the entitlement check and the
        -- idempotency guarantee are the same ones every other rule uses. The
        -- rule's own value is ignored in favour of the challenge's, so a gym
        -- can make one challenge worth more than another.
        insert into point_ledger (member_id, rule_key, points, source_table, source_id)
        select r.member_id, 'challenge_complete', r.reward_points,
               'challenge_participants', r.challenge_id
        where plan_allows(r.member_id, 'points_earn')
        on conflict (member_id, rule_key, source_table, source_id) do nothing;
      end if;

      n := n + 1;
    end if;
  end loop;
  return n;
end;
$fn$;

-- ============================================================================
-- 5. RLS
-- ============================================================================
alter table challenges             enable row level security;
alter table challenge_participants enable row level security;

drop policy if exists challenges_select_authenticated on challenges;
create policy challenges_select_authenticated on challenges
  for select to authenticated using (true);

drop policy if exists challenges_write_admin on challenges;
create policy challenges_write_admin on challenges
  for all to authenticated
  using (get_my_role() is not distinct from 'admin')
  with check (get_my_role() is not distinct from 'admin');

drop policy if exists participants_select_self on challenge_participants;
create policy participants_select_self on challenge_participants
  for select using (member_id = auth.uid());

drop policy if exists participants_select_gym on challenge_participants;
create policy participants_select_gym on challenge_participants
  for select using (get_my_role() in ('admin','staff','trainer'));

-- Joining is gated, and only during the window: joining a finished challenge
-- would be joining something you cannot possibly complete.
drop policy if exists participants_join_self on challenge_participants;
create policy participants_join_self on challenge_participants
  for insert to authenticated
  with check (
    member_id = auth.uid()
    and plan_allows(member_id, 'challenges')
    and exists (
      select 1 from challenges c
       where c.id = challenge_id and c.is_active
         and c.ends_on >= (now() at time zone 'Asia/Manila')::date
    )
  );

-- Leaving is allowed, but not un-completing: dropping out after finishing
-- would strip the row that proves the points were earned.
drop policy if exists participants_leave_self on challenge_participants;
create policy participants_leave_self on challenge_participants
  for delete using (member_id = auth.uid() and completed_on is null);

-- **No UPDATE policy on challenge_participants for anyone.** `completed_on` is
-- written only by settle_challenges(), which is SECURITY DEFINER. A member
-- cannot declare themselves finished, and neither can an admin by hand.

revoke all on function settle_challenges() from public, anon, authenticated;
revoke all on function challenge_progress(uuid, uuid) from public, anon;
grant execute on function challenge_progress(uuid, uuid) to authenticated;

-- ============================================================================
-- 6. SCHEDULE (optional, same shape as 0030 and 0051)
-- ============================================================================
do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('settle-challenges', '15 * * * *',
      $inner$ select settle_challenges(); $inner$);
  end if;
exception when others then
  null;   -- no pg_cron: progress still displays live, completion settles late
end
$cron$;

-- ============================================================================
-- VERIFICATION
-- ============================================================================
--   select key, label from achievement_metrics where challengeable order by key;
--     -- expect 12, none of them trainer metrics, streaks or days_as_member
--
--   select challenge_progress('<challenge>', '<member>');
--   select settle_challenges();          -- run twice; the second returns 0
--
-- As a member (all must fail or change nothing):
--   update challenge_participants set completed_on = current_date;
--   insert into challenges (title, metric_key, target, starts_on, ends_on)
--     values ('Mine','training_days',1,current_date,current_date);
