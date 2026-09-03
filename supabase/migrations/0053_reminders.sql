-- 0053 — the reminders that were never written.
--
-- Since 0030 this system has had exactly **one** automated notification: the
-- training-day nudge. Nothing tells a member their membership is about to run
-- out, that they have a class tomorrow, that they reached a goal, or that they
-- have earned enough points to claim something.
--
-- The expiry one is the commercially serious gap. A member's access simply
-- stops one morning, and the first they hear of it is the front desk.
--
-- ---------------------------------------------------------------------------
-- Idempotency, done with a constraint rather than a check
-- ---------------------------------------------------------------------------
-- 0030 remembers `gym_plans.last_reminded_on`. That works because it reminds
-- about a row it also owns. These do not: there is nowhere on `memberships` to
-- record "we warned them at 7 days", and adding four such columns to four
-- tables would be four chances to forget one.
--
-- So each reminder carries a **dedupe key** in `notifications.metadata`, and a
-- partial unique index makes a second identical notification impossible rather
-- than merely unlikely. A `not exists` check would have raced with itself the
-- first time two cron ticks overlapped; a unique index cannot.
--
-- The same reasoning as the points ledger, one migration earlier: something is
-- unique because a constraint says so.

-- ============================================================================
-- 1. THE DEDUPE KEY
-- ============================================================================
create unique index if not exists notifications_dedupe_unique
  on notifications (user_id, (metadata ->> 'dedupe'))
  where metadata ? 'dedupe';

comment on index notifications_dedupe_unique is
  'Makes a repeated automated reminder impossible. Only rows carrying a dedupe '
  'key participate, so ordinary notifications are unaffected and a member can '
  'still receive many of the same type.';

-- One writer, so every reminder gets the key and none of them has to remember
-- to handle the conflict.
create or replace function notify_once(
  p_user uuid, p_type text, p_title text, p_message text,
  p_action_url text, p_dedupe text
) returns boolean
language plpgsql security definer set search_path = public as $fn$
begin
  insert into notifications (user_id, type, title, message, action_url, metadata)
  values (p_user, p_type, p_title, p_message, p_action_url,
          jsonb_build_object('dedupe', p_dedupe))
  on conflict do nothing;
  return found;
end;
$fn$;

-- ============================================================================
-- 2. MEMBERSHIP EXPIRY — 7, 3 and 1 days out
-- ============================================================================
create or replace function send_membership_expiry_reminders() returns int
language plpgsql security definer set search_path = public as $fn$
declare
  today date := (now() at time zone 'Asia/Manila')::date;
  sent int := 0;
  m record;
  d int;
begin
  for m in
    select ms.id, ms.member_id, ms.expiry_date, mp.name as plan_name,
           (ms.expiry_date - today) as days_left
      from memberships ms
      join profiles pr on pr.id = ms.member_id
      join membership_plans mp on mp.id = ms.plan_id
     where ms.status = 'active'
       and not ms.never_expires
       and ms.expiry_date is not null
       and pr.status = 'active'
       and (ms.expiry_date - today) in (7, 3, 1)
       -- Only the newest membership row. A member who renewed early has an old
       -- row expiring next week and a new one running to next month; warning
       -- them about the old one would be alarming and wrong.
       and ms.created_at = (select max(m2.created_at) from memberships m2
                             where m2.member_id = ms.member_id)
  loop
    d := m.days_left;
    if notify_once(
      m.member_id, 'expiry',
      case when d = 1 then 'Your membership ends tomorrow'
           else 'Your membership ends in ' || d || ' days' end,
      'Your ' || m.plan_name || ' membership runs to ' ||
        to_char(m.expiry_date, 'FMMon FMDD') ||
        '. Renew at the front desk to keep your access.',
      '/member/renew',
      'expiry:' || m.id::text || ':' || d::text
    ) then
      sent := sent + 1;
    end if;
  end loop;
  return sent;
end;
$fn$;

-- ============================================================================
-- 3. TOMORROW'S SESSION
-- ============================================================================
-- Sent the day before rather than an hour before: this gym's members travel to
-- it, and an hour's warning is not enough time to do anything about a clash.
create or replace function send_upcoming_session_reminders() returns int
language plpgsql security definer set search_path = public as $fn$
declare
  tomorrow date := (now() at time zone 'Asia/Manila')::date + 1;
  sent int := 0;
  r record;
begin
  for r in
    select b.id, b.member_id, c.name as title, c.scheduled_at as at
      from bookings b
      join classes c on c.id = b.class_id
      join profiles pr on pr.id = b.member_id
     where b.status = 'approved' and pr.status = 'active'
       and (c.scheduled_at at time zone 'Asia/Manila')::date = tomorrow
  loop
    if notify_once(
      r.member_id, 'booking', 'Class tomorrow',
      r.title || ' at ' ||
        to_char(r.at at time zone 'Asia/Manila', 'FMHH12:MI AM') || '.',
      '/member/booking-history',
      'session:booking:' || r.id::text
    ) then
      sent := sent + 1;
    end if;
  end loop;

  for r in
    select p.id, p.member_id, p.starts_at as at,
           pr2.first_name || ' ' || pr2.last_name as coach
      from pt_sessions p
      join profiles pr on pr.id = p.member_id
      join profiles pr2 on pr2.id = p.trainer_id
     where p.status = 'approved' and pr.status = 'active'
       and (p.starts_at at time zone 'Asia/Manila')::date = tomorrow
  loop
    if notify_once(
      r.member_id, 'booking', 'Training session tomorrow',
      'With ' || r.coach || ' at ' ||
        to_char(r.at at time zone 'Asia/Manila', 'FMHH12:MI AM') || '.',
      '/member/booking-history',
      'session:pt:' || r.id::text
    ) then
      sent := sent + 1;
    end if;
  end loop;

  return sent;
end;
$fn$;

-- ============================================================================
-- 4. THE MOMENTS WORTH NOTICING
-- ============================================================================
-- These have real events, so they are triggers rather than sweeps — the same
-- distinction 0051 had to make for points.

create or replace function trg_notify_goal_reached() returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  if new.achieved_on is not null and old.achieved_on is null then
    perform notify_once(
      new.member_id, 'success', 'Goal reached',
      'You hit your goal: ' || new.title || '.',
      '/member/progress?tab=goals',
      'goal:' || new.id::text
    );
  end if;
  return null;
end;
$fn$;

drop trigger if exists fitness_goals_notify on fitness_goals;
create trigger fitness_goals_notify
  after update on fitness_goals
  for each row execute function trg_notify_goal_reached();

create or replace function trg_notify_achievement() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare
  a record;
begin
  -- `title`, not `name` — the achievements catalogue (0038) calls it title,
  -- and `description` there is already past tense addressed to the earner.
  select title, description into a from achievements where key = new.achievement_key;
  perform notify_once(
    new.user_id, 'success', 'Badge unlocked',
    coalesce(a.title, 'You unlocked a new badge') ||
      coalesce(' — ' || a.description, '.'),
    '/member/achievements',
    'badge:' || new.id::text
  );
  return null;
end;
$fn$;

drop trigger if exists achievement_unlocks_notify on achievement_unlocks;
create trigger achievement_unlocks_notify
  after insert on achievement_unlocks
  for each row execute function trg_notify_achievement();

-- ── Points ──────────────────────────────────────────────────────────────────
-- Deliberately NOT one notification per ledger row. Ten points for a check-in
-- is not news, and a phone that buzzes every time you scan a QR code is a
-- phone whose notifications get turned off. The member is told when their
-- balance first reaches something they can actually claim.
create or replace function trg_notify_reward_reachable() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare
  bal int;
  r record;
begin
  bal := member_points_balance(new.member_id);

  -- The most expensive reward now affordable. One message, not one per reward.
  select id, name, cost_points into r
    from rewards
   where is_active and (stock is null or stock > 0) and cost_points <= bal
   order by cost_points desc
   limit 1;

  if r.id is not null then
    perform notify_once(
      new.member_id, 'success', 'You can claim a reward',
      'You have ' || bal || ' CORE Points — enough for ' || r.name || '.',
      '/member/rewards',
      'reward:' || r.id::text
    );
  end if;
  return null;
end;
$fn$;

drop trigger if exists point_ledger_notify on point_ledger;
create trigger point_ledger_notify
  after insert on point_ledger
  for each row execute function trg_notify_reward_reachable();

-- ============================================================================
-- 5. GRANTS
-- ============================================================================
-- None of these is callable by a browser. A client that could invoke them could
-- broadcast to every member in the gym.
revoke all on function notify_once(uuid, text, text, text, text, text)
  from public, anon, authenticated;
revoke all on function send_membership_expiry_reminders() from public, anon, authenticated;
revoke all on function send_upcoming_session_reminders() from public, anon, authenticated;

-- ============================================================================
-- 6. SCHEDULE (optional — the app is still correct without it)
-- ============================================================================
-- Every reminder here has a screen that already shows the same fact: Home shows
-- days remaining, Bookings shows tomorrow's session, Progress shows the goal,
-- Rewards shows the balance. The notification is the nudge, never the record —
-- so if pg_cron is unavailable, members are not told early, but nothing is
-- hidden from them.
do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    -- 9am Manila = 01:00 UTC. Once a day: a renewal warning that arrives three
    -- times a day is how people learn to ignore it.
    perform cron.schedule('membership-expiry-reminders', '0 1 * * *',
      $inner$ select send_membership_expiry_reminders(); $inner$);
    -- 6pm Manila = 10:00 UTC, the evening before.
    perform cron.schedule('upcoming-session-reminders', '0 10 * * *',
      $inner$ select send_upcoming_session_reminders(); $inner$);
  end if;
exception when others then
  null;
end
$cron$;

-- ============================================================================
-- VERIFICATION
-- ============================================================================
--   select send_membership_expiry_reminders();   -- run twice; second returns 0
--   select send_upcoming_session_reminders();    -- same
--
--   select metadata ->> 'dedupe' as key, count(*)
--     from notifications where metadata ? 'dedupe'
--    group by 1 having count(*) > 1;             -- must return no rows
--
-- The index only covers keyed rows, so ordinary notifications are unaffected:
--   select count(*) from notifications where not (metadata ? 'dedupe');
