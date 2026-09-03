-- 0051 — CORE Points: a currency the gym actually honours.
--
-- Achievements (0028/0038) already reward consistency, but a badge cannot be
-- spent. This is a balance the member accrues and redeems for something real,
-- which the gym owner approves one request at a time.
--
-- That word — *real* — is what makes this different from every other counter in
-- the app. **Points are a liability.** A double-awarded point is money the gym
-- owes and did not agree to, so the whole design is about making a second award
-- impossible rather than unlikely.
--
-- ---------------------------------------------------------------------------
-- Two award mechanisms, because two different things are being rewarded
-- ---------------------------------------------------------------------------
-- The obvious design is "a trigger per rule". It does not survive contact with
-- this schema:
--
--   check-in          -> a row appears. That IS the event. Trigger.
--   workout completed -> completed_at goes NULL -> not-NULL. Trigger.
--   goal achieved     -> achieved_on goes NULL -> not-NULL. Trigger.
--   class attended    -> 0028 defines this as an APPROVED booking whose class
--                        time has PASSED. Nothing writes a row when that
--                        becomes true. Time simply passes. **No event exists.**
--   PT session done   -> worse: `pt_sessions` has no 'completed' status at all,
--                        the enum is the shared `booking_status` (0028:171).
--
-- So the last two are awarded by `award_due_session_points()`, a sweep that is
-- safe to run any number of times because the ledger's UNIQUE constraint
-- rejects the second attempt. Writing them as triggers would have compiled,
-- deployed, and silently never fired — for the two most valuable things a
-- member does.

-- ============================================================================
-- 1. THE RULES — data the gym edits
-- ============================================================================
create table if not exists point_rules (
  key        text primary key,
  label      text not null,
  points     int not null check (points > 0),
  is_active  boolean not null default true,
  sort_order int not null default 0
);

-- Seeded, because an empty rules table awards nothing while looking like a
-- working feature. The gym tunes these; a "double points week" is an UPDATE.
insert into point_rules (key, label, points, sort_order) values
  ('checkin',            'Checked in at the gym',   10, 1),
  ('workout_logged',     'Logged a workout',        15, 2),
  ('class_attended',     'Attended a group class',  25, 3),
  ('pt_session',         'Completed a PT session',  40, 4),
  ('goal_achieved',      'Reached a fitness goal', 100, 5),
  ('challenge_complete', 'Finished a challenge',   250, 6)
on conflict (key) do update
  set label = excluded.label, sort_order = excluded.sort_order;

-- ============================================================================
-- 2. THE LEDGER — append-only, never written by a browser
-- ============================================================================
create table if not exists point_ledger (
  id           uuid primary key default gen_random_uuid(),
  member_id    uuid not null references member_profiles(profile_id) on delete cascade,
  rule_key     text not null references point_rules(key),
  -- Copied, not joined. Re-pricing a rule must not silently restate what a
  -- member earned last month.
  points       int not null,
  source_table text not null,
  source_id    uuid not null,
  created_at   timestamptz not null default now(),
  -- The single most important line in this migration. Without it a re-run, a
  -- retry, or a trigger that fires twice awards twice, and the gym pays.
  -- An identifier is unique because a constraint says so.
  unique (member_id, rule_key, source_table, source_id)
);

create index if not exists idx_point_ledger_member on point_ledger(member_id, created_at desc);

-- ============================================================================
-- 3. REWARDS AND REDEMPTIONS
-- ============================================================================
create table if not exists rewards (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  cost_points int not null check (cost_points > 0),
  -- NULL = unlimited. 0 means genuinely out of stock, which is why it is not
  -- the same value as "no limit".
  stock       int check (stock is null or stock >= 0),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists reward_redemptions (
  id            uuid primary key default gen_random_uuid(),
  member_id     uuid not null references member_profiles(profile_id) on delete cascade,
  reward_id     uuid not null references rewards(id) on delete restrict,
  -- Frozen at request time. If the gym re-prices a reward while a request is
  -- pending, the member is charged what they agreed to, not what it costs now.
  cost_points   int not null check (cost_points > 0),
  status        text not null default 'pending'
                check (status in ('pending','approved','rejected','fulfilled')),
  requested_at  timestamptz not null default now(),
  decided_by    uuid references profiles(id),
  decided_at    timestamptz,
  decision_note text
);

create index if not exists idx_redemptions_pending
  on reward_redemptions(requested_at) where status = 'pending';

-- ============================================================================
-- 4. BALANCE
-- ============================================================================
-- Earned minus everything committed. A *pending* request counts against the
-- balance: otherwise a member requests five rewards they can afford once, and
-- the gym discovers the overdraft at the counter.
create or replace function member_points_balance(p_member uuid)
returns int language sql stable security definer set search_path = public as $fn$
  select coalesce((select sum(points) from point_ledger where member_id = p_member), 0)
       - coalesce((select sum(cost_points) from reward_redemptions
                    where member_id = p_member
                      and status in ('pending','approved','fulfilled')), 0);
$fn$;

-- ============================================================================
-- 5. AWARDING — SECURITY DEFINER only
-- ============================================================================
-- One writer. Every rule goes through it, so the entitlement check and the
-- idempotency guarantee exist in exactly one place.
create or replace function award_points(
  p_member uuid, p_rule text, p_source_table text, p_source_id uuid
) returns void language plpgsql security definer set search_path = public as $fn$
declare
  v_points int;
begin
  -- Earning is a plan feature (0049). Checked here rather than at each call
  -- site so a new rule cannot forget it.
  if not plan_allows(p_member, 'points_earn') then
    return;
  end if;

  select points into v_points from point_rules where key = p_rule and is_active;
  if v_points is null then
    return;                       -- rule switched off by the gym, or unknown
  end if;

  insert into point_ledger (member_id, rule_key, points, source_table, source_id)
  values (p_member, p_rule, v_points, p_source_table, p_source_id)
  -- The idempotency guarantee, made explicit. A second award for the same
  -- source is not an error to handle, it is a no-op by design.
  on conflict (member_id, rule_key, source_table, source_id) do nothing;
end;
$fn$;

-- ── Event-driven awards ─────────────────────────────────────────────────────
create or replace function trg_points_checkin() returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  perform award_points(new.member_id, 'checkin', 'attendance', new.id);
  return null;
end;
$fn$;

drop trigger if exists attendance_award_points on attendance;
create trigger attendance_award_points
  after insert on attendance
  for each row execute function trg_points_checkin();

create or replace function trg_points_workout() returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  -- Only on the transition. An UPDATE that touches notes on an already
  -- completed session must not look like a second workout.
  if new.completed_at is not null and old.completed_at is null then
    perform award_points(new.member_id, 'workout_logged', 'workout_logs', new.id);
  end if;
  return null;
end;
$fn$;

drop trigger if exists workout_logs_award_points on workout_logs;
create trigger workout_logs_award_points
  after update on workout_logs
  for each row execute function trg_points_workout();

create or replace function trg_points_goal() returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  if new.achieved_on is not null and old.achieved_on is null then
    perform award_points(new.member_id, 'goal_achieved', 'fitness_goals', new.id);
  end if;
  return null;
end;
$fn$;

drop trigger if exists fitness_goals_award_points on fitness_goals;
create trigger fitness_goals_award_points
  after update on fitness_goals
  for each row execute function trg_points_goal();

-- ── The sweep, for the two that have no event ───────────────────────────────
create or replace function award_due_session_points() returns int
language plpgsql security definer set search_path = public as $fn$
declare
  n int := 0;
  r record;
begin
  -- "Attended" exactly as 0028 defines it, so the badge and the points can
  -- never disagree about whether a session happened.
  for r in
    select b.member_id, b.id
      from bookings b
      join classes c on c.id = b.class_id
     where b.status = 'approved' and c.scheduled_at < now()
  loop
    perform award_points(r.member_id, 'class_attended', 'bookings', r.id);
    n := n + 1;
  end loop;

  for r in
    select p.member_id, p.id
      from pt_sessions p
     where p.status = 'approved' and p.starts_at < now()
  loop
    perform award_points(r.member_id, 'pt_session', 'pt_sessions', r.id);
    n := n + 1;
  end loop;

  return n;
end;
$fn$;

comment on function award_due_session_points() is
  'Awards class and PT points. A sweep and not a trigger because "attended" '
  'means an approved booking whose time has passed, and nothing writes a row '
  'when that becomes true. Safe to run repeatedly: the ledger UNIQUE rejects '
  'the second award.';

-- ============================================================================
-- 6. SPENDING
-- ============================================================================
-- Three ways a redemption could be wrong, all closed in the database because
-- all three are things a client could otherwise assert.
create or replace function trg_validate_redemption() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare
  r record;
begin
  if not plan_allows(new.member_id, 'points_redeem') then
    raise exception 'Redeeming points is not included in your membership.';
  end if;

  select * into r from rewards where id = new.reward_id;
  if r is null or not r.is_active then
    raise exception 'That reward is not available.';
  end if;
  if r.stock is not null and r.stock <= 0 then
    raise exception 'That reward is out of stock.';
  end if;

  -- The price is the gym's, not the client's. Overwritten rather than
  -- validated, so a crafted request cannot buy a reward for one point.
  new.cost_points := r.cost_points;

  if member_points_balance(new.member_id) < r.cost_points then
    raise exception 'You do not have enough points for that yet.';
  end if;

  return new;
end;
$fn$;

drop trigger if exists reward_redemptions_validate on reward_redemptions;
create trigger reward_redemptions_validate
  before insert on reward_redemptions
  for each row execute function trg_validate_redemption();

-- Stock moves when the gym approves, not when the member asks — a rejected
-- request must not have consumed one.
create or replace function trg_redemption_decided() returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  if new.status = 'approved' and old.status = 'pending' then
    update rewards set stock = stock - 1
     where id = new.reward_id and stock is not null;
  end if;
  return null;
end;
$fn$;

drop trigger if exists reward_redemptions_decided on reward_redemptions;
create trigger reward_redemptions_decided
  after update on reward_redemptions
  for each row execute function trg_redemption_decided();

-- ============================================================================
-- 7. RLS
-- ============================================================================
alter table point_rules        enable row level security;
alter table point_ledger       enable row level security;
alter table rewards            enable row level security;
alter table reward_redemptions enable row level security;

-- Members read the rules: "how do I earn points" is the first question, and a
-- points system whose rules are secret is a slot machine.
drop policy if exists point_rules_select_authenticated on point_rules;
create policy point_rules_select_authenticated on point_rules
  for select to authenticated using (true);

drop policy if exists point_rules_write_admin on point_rules;
create policy point_rules_write_admin on point_rules
  for all to authenticated
  using (get_my_role() is not distinct from 'admin')
  with check (get_my_role() is not distinct from 'admin');

-- Your own ledger, and the gym's.
drop policy if exists point_ledger_select_self on point_ledger;
create policy point_ledger_select_self on point_ledger
  for select using (member_id = auth.uid());

drop policy if exists point_ledger_select_gym on point_ledger;
create policy point_ledger_select_gym on point_ledger
  for select using (get_my_role() in ('admin','staff'));

-- **No INSERT, UPDATE or DELETE policy on point_ledger. For anyone.**
-- Not admin, not staff, not the member. Every row is written by award_points(),
-- which is SECURITY DEFINER and therefore bypasses RLS. A browser holding a
-- service token still cannot mint points, and an admin who wants to give some
-- away does it by creating a reward, which is recorded.

drop policy if exists rewards_select_authenticated on rewards;
create policy rewards_select_authenticated on rewards
  for select to authenticated using (true);

drop policy if exists rewards_write_admin on rewards;
create policy rewards_write_admin on rewards
  for all to authenticated
  using (get_my_role() is not distinct from 'admin')
  with check (get_my_role() is not distinct from 'admin');

drop policy if exists redemptions_select_self on reward_redemptions;
create policy redemptions_select_self on reward_redemptions
  for select using (member_id = auth.uid());

drop policy if exists redemptions_select_gym on reward_redemptions;
create policy redemptions_select_gym on reward_redemptions
  for select using (get_my_role() in ('admin','staff'));

-- A member may ask, and may withdraw a request the gym has not answered yet.
drop policy if exists redemptions_insert_self on reward_redemptions;
create policy redemptions_insert_self on reward_redemptions
  for insert to authenticated with check (member_id = auth.uid());

drop policy if exists redemptions_delete_self on reward_redemptions;
create policy redemptions_delete_self on reward_redemptions
  for delete using (member_id = auth.uid() and status = 'pending');

-- Deciding is admin-only. Approving a redemption commits the gym to giving
-- something away, which is the same class of decision as pricing — not a
-- front-desk transaction, so `staff` reads it but cannot decide it.
drop policy if exists redemptions_decide_admin on reward_redemptions;
create policy redemptions_decide_admin on reward_redemptions
  for update to authenticated
  using (get_my_role() is not distinct from 'admin')
  with check (get_my_role() is not distinct from 'admin');

revoke all on function award_points(uuid, text, text, uuid) from public, anon, authenticated;
revoke all on function award_due_session_points() from public, anon, authenticated;
revoke all on function member_points_balance(uuid) from public, anon;
grant execute on function member_points_balance(uuid) to authenticated;

-- ============================================================================
-- 8. THE SWEEP ON A SCHEDULE (optional, exactly like 0030)
-- ============================================================================
do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'award-due-session-points', '30 * * * *',
      $inner$ select award_due_session_points(); $inner$
    );
  end if;
exception when others then
  -- pg_cron absent or not permitted. The function still exists and can be run
  -- by hand or from the admin app; points arrive late rather than never.
  null;
end
$cron$;

-- ============================================================================
-- VERIFICATION
-- ============================================================================
--   select * from point_rules order by sort_order;      -- expect 6
--   select member_points_balance('<a member>');
--
-- Idempotency (run twice, expect the same number of rows both times):
--   select award_due_session_points();
--   select count(*) from point_ledger where rule_key = 'class_attended';
--
-- As a member (all three must fail):
--   insert into point_ledger (member_id, rule_key, points, source_table, source_id)
--     values (auth.uid(), 'checkin', 9999, 'x', gen_random_uuid());
--   update point_ledger set points = 9999;
--   update reward_redemptions set status = 'approved';
