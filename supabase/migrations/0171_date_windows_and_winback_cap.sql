-- ============================================================================
-- 0171 — Dates the database refuses, and one win-back a month
-- ============================================================================
--
-- 1. DATE WINDOWS. An evaluator set a gym-wide goal to start in 2002: every
--    date picker accepted any year, and nothing behind them objected. The
--    pickers now name a mode (lib/dateRules.ts, identical in three apps); this
--    is the same rule where a crafted request cannot skip it:
--
--      future  today … two years ahead      challenges, gym goals, events,
--                                           announcements, targets, classwork
--      record  a window back, never ahead   payments (this month), workouts and
--                                           readings (30 days), progress photos
--                                           (a year), credentials (ten years)
--      birth   120 years back … today       date of birth
--
--    Each check fires only when the column is SET (an insert, or an update
--    that changes it), so a row that is already old — last year's challenge —
----    never blocks an unrelated edit to it. And each applies to a signed-in
--    user's own request (direct_user_write()), never to a SECURITY DEFINER
--    function, seed or sweep, which write history on purpose — a weekly quest
--    starts on this week's Monday (CLAUDE.md: a guard must not block its own
--    writer). Only a date of birth is checked for everyone — nobody is born
--    tomorrow or 130 years ago.
--
-- 2. WIN-BACK CAP. An owner saw "Still with us?" in the activity log day after
--    day and read it as the same people being messaged daily. They were not —
--    64 members, once each, Oct 4–9 — but three rules could each send in one
--    month. Now a member gets at most ONE automatic win-back a Manila month,
--    and none at all if they checked in within the last 7 days. The desk's own
--    messages ('manual') are never limited. winback_sweep() notifies only when
--    its insert lands (`found`), so a skipped send sends nothing.
-- ============================================================================

create or replace function manila_today() returns date
language sql stable as $$ select (now() at time zone 'Asia/Manila')::date $$;

create or replace function assert_date_window(p_value date, p_min date, p_max date, p_what text)
returns void language plpgsql stable as $$
begin
  if p_value is not null and (p_value < p_min or p_value > p_max) then
    raise exception '% must be between % and %.', p_what,
      to_char(p_min, 'FMMon FMDD, YYYY'), to_char(p_max, 'FMMon FMDD, YYYY') using errcode = '22008';
  end if;
end;
$$;

-- A write straight from a signed-in user's request (PostgREST runs it as the
-- `authenticated` role). A SECURITY DEFINER function runs as its owner instead,
-- and those write history on purpose — roll_weekly_quests() starts a quest on
-- this week's Monday, demo seeds and sweeps backfill — and keep their own rules.
-- The signed-in user is read the way auth.uid() reads it, from the request's
-- settings, so the check needs no privilege on the auth schema.
create or replace function direct_user_write() returns boolean
language sql stable as $$
  select current_user = 'authenticated'
     and coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                  nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub') is not null
$$;

-- True when this write SETS the column: an insert, or an update that changes it.
-- Written per trigger as  tg_op = 'INSERT' or new.x is distinct from old.x
-- (OLD is unassigned in an INSERT trigger — DATA_ACCESS).

create or replace function trg_dates_challenges() returns trigger
language plpgsql as $$
declare d date := manila_today();
begin
  if not direct_user_write() then return new; end if;
  if tg_op = 'INSERT' or new.starts_on is distinct from old.starts_on then
    perform assert_date_window(new.starts_on, d, (d + interval '2 years')::date, 'A start date');
  end if;
  if tg_op = 'INSERT' or new.ends_on is distinct from old.ends_on then
    perform assert_date_window(new.ends_on, greatest(d, coalesce(new.starts_on, d)), (d + interval '2 years')::date, 'An end date');
  end if;
  return new;
end;
$$;
drop trigger if exists dates_window on challenges;
create trigger dates_window before insert or update on challenges for each row execute function trg_dates_challenges();
drop trigger if exists dates_window on gym_goals;
create trigger dates_window before insert or update on gym_goals for each row execute function trg_dates_challenges();

create or replace function trg_dates_events() returns trigger
language plpgsql as $$
declare d date := manila_today();
begin
  if not direct_user_write() then return new; end if;
  if tg_op = 'INSERT' or new.starts_at is distinct from old.starts_at then
    perform assert_date_window((new.starts_at at time zone 'Asia/Manila')::date, d, (d + interval '2 years')::date, 'An event date');
  end if;
  return new;
end;
$$;
drop trigger if exists dates_window on events;
create trigger dates_window before insert or update on events for each row execute function trg_dates_events();

create or replace function trg_dates_announcements() returns trigger
language plpgsql as $$
declare d date := manila_today();
begin
  if not direct_user_write() then return new; end if;
  if tg_op = 'INSERT' or new.ends_at is distinct from old.ends_at then
    perform assert_date_window((new.ends_at at time zone 'Asia/Manila')::date, d, (d + interval '2 years')::date, 'An end date');
  end if;
  return new;
end;
$$;
drop trigger if exists dates_window on platform_announcements;
create trigger dates_window before insert or update on platform_announcements for each row execute function trg_dates_announcements();

create or replace function trg_dates_target() returns trigger
language plpgsql as $$
declare d date := manila_today();
begin
  if not direct_user_write() then return new; end if;
  if tg_table_name = 'fitness_goals' and (tg_op = 'INSERT' or new.target_date is distinct from old.target_date) then
    perform assert_date_window(new.target_date, d, (d + interval '2 years')::date, 'A target date');
  end if;
  if tg_table_name = 'room_assignments' and (tg_op = 'INSERT' or new.due_on is distinct from old.due_on) then
    perform assert_date_window(new.due_on, d, (d + interval '2 years')::date, 'A due date');
  end if;
  return new;
end;
$$;
drop trigger if exists dates_window on fitness_goals;
create trigger dates_window before insert or update of target_date on fitness_goals for each row execute function trg_dates_target();
drop trigger if exists dates_window on room_assignments;
create trigger dates_window before insert or update of due_on on room_assignments for each row execute function trg_dates_target();

create or replace function trg_dates_records() returns trigger
language plpgsql as $$
declare d date := manila_today();
begin
  if not direct_user_write() then return new; end if;
  case tg_table_name
    when 'payments' then
      if tg_op = 'INSERT' or new.paid_on is distinct from old.paid_on then
        perform assert_date_window(new.paid_on, date_trunc('month', d)::date, d, 'A payment date');
      end if;
    when 'gym_payments' then
      if tg_op = 'INSERT' or new.paid_on is distinct from old.paid_on then
        perform assert_date_window(new.paid_on, d - 62, d, 'A payment date');
      end if;
    when 'workout_logs' then
      if tg_op = 'INSERT' or new.performed_on is distinct from old.performed_on then
        perform assert_date_window(new.performed_on, d - 30, d, 'A workout date');
      end if;
    when 'body_measurements' then
      if tg_op = 'INSERT' or new.measured_on is distinct from old.measured_on then
        perform assert_date_window(new.measured_on, d - 30, d, 'A reading date');
      end if;
    when 'progress_photos' then
      if tg_op = 'INSERT' or new.taken_on is distinct from old.taken_on then
        perform assert_date_window(new.taken_on, d - 365, d, 'A photo date');
      end if;
    when 'trainer_credentials' then
      if tg_op = 'INSERT' or new.issued_on is distinct from old.issued_on then
        perform assert_date_window(new.issued_on, d - 3650, d, 'An issue date');
      end if;
      if tg_op = 'INSERT' or new.expires_on is distinct from old.expires_on then
        perform assert_date_window(new.expires_on, d, d + 3650, 'An expiry date');
      end if;
  end case;
  return new;
end;
$$;
drop trigger if exists dates_window on payments;
create trigger dates_window before insert or update of paid_on on payments for each row execute function trg_dates_records();
drop trigger if exists dates_window on gym_payments;
create trigger dates_window before insert or update of paid_on on gym_payments for each row execute function trg_dates_records();
drop trigger if exists dates_window on workout_logs;
create trigger dates_window before insert or update of performed_on on workout_logs for each row execute function trg_dates_records();
drop trigger if exists dates_window on body_measurements;
create trigger dates_window before insert or update of measured_on on body_measurements for each row execute function trg_dates_records();
drop trigger if exists dates_window on progress_photos;
create trigger dates_window before insert or update of taken_on on progress_photos for each row execute function trg_dates_records();
drop trigger if exists dates_window on trainer_credentials;
create trigger dates_window before insert or update of issued_on, expires_on on trainer_credentials for each row execute function trg_dates_records();

create or replace function trg_dates_birth() returns trigger
language plpgsql as $$
declare d date := manila_today();
begin
  if tg_op = 'INSERT' or new.date_of_birth is distinct from old.date_of_birth then
    perform assert_date_window(new.date_of_birth, (d - interval '120 years')::date, d, 'A date of birth');
  end if;
  return new;
end;
$$;
drop trigger if exists dates_window on member_profiles;
create trigger dates_window before insert or update of date_of_birth on member_profiles for each row execute function trg_dates_birth();

-- ---------------------------------------------------------------------------
-- 2. One automatic win-back a month, none after a recent visit.
-- ---------------------------------------------------------------------------
create or replace function trg_winback_cap() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.rule_key = 'manual' then return new; end if;
  if exists (select 1 from winback_sends s
              where s.gym_id = new.gym_id and s.member_id = new.member_id
                and s.month = new.month and s.rule_key <> 'manual') then
    return null;
  end if;
  -- "We miss you" to someone who was in this week reads as not paying
  -- attention. The lapsed message is about the plan, not the visits, so a
  -- member whose plan ended still hears about renewing.
  if new.rule_key <> 'lapsed' and exists (select 1 from attendance a
              where a.gym_id = new.gym_id and a.member_id = new.member_id
                and a.check_in_time > now() - interval '7 days') then
    return null;
  end if;
  return new;
end;
$$;
drop trigger if exists winback_cap on winback_sends;
create trigger winback_cap before insert on winback_sends for each row execute function trg_winback_cap();

-- 3. The progress-photos switch says what turning it off does (it existed,
--    nested under Progress in Your app; an owner asked for one).
update platform_features
   set description = 'Private progress photos a member can choose to share with a coach. Off: the album is hidden; photos already taken stay the member''s and return when it is back on.'
 where key = 'photos';

create or replace function migration_0171_applied() returns boolean
language sql immutable as $marker$ select true $marker$;
revoke all on function migration_0171_applied() from public, anon;
grant execute on function migration_0171_applied() to authenticated;
comment on function migration_0171_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0171.sql
