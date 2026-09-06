-- 0071 — trainers decide, the gym oversees, and nothing waits forever.
--
-- 0015 put approval with the front desk and TrainerBookings.tsx has carried a
-- docstring ever since explaining that its Accept/Decline buttons were removed
-- because `bookings_update_admin` would have made every tap a silent RLS
-- failure. That was the right call at the time. It is not what the gym wants:
-- the person who knows whether they can take a 7am session on Thursday is the
-- trainer, and routing it through the desk means the member waits for an office
-- to open.
--
-- ## Oversight is reversal and a record, not a second approval
--
-- The obvious reading of "must still pass through admin control" is a two-stage
-- approval: the trainer accepts, the admin confirms. That is worse for everyone.
-- The member is told "approved" twice, and can be un-approved after they have
-- arranged their week around it — so the first message was a lie.
--
-- Instead the trainer's decision is final and immediate, and the gym gets:
--
--   * `decided_by` and `decided_by_role` on the row, so every screen can say
--     who accepted it rather than implying the desk did;
--   * an `activity_log` entry for every decision — already written by 0037's
--     `trg_log_booking` and `trg_log_pt`, which stamp the actor's role, so this
--     file adds no logging trigger of its own. A second one would have put two
--     rows in the feed for every approval;
--   * an unchanged admin UPDATE policy, so an admin can reverse any decision.
--
-- Control without a member-visible limbo.
--
-- ## Waiting is not an event
--
-- "Pending for three days" is not something anything writes a row for, so it
-- cannot be a trigger — a trigger would compile and never fire, exactly as the
-- attendance-points sweep would have (0051). `sweep_stale_requests()` is a
-- re-runnable function, called from the admin Bookings page on load and by
-- pg_cron where it exists. Late at worst, never not at all.
--
-- Re-runnable.

-- ============================================================================
-- 1. WHO DECIDED, AND IN WHAT CAPACITY
-- ============================================================================
-- `approved_by` already exists on both tables and is the wrong column for this:
-- it is NULL for a rejection, so "who turned this down" had no answer at all.
alter table bookings
  add column if not exists decided_by uuid references profiles(id),
  /** 'admin' | 'staff' | 'trainer'. Stamped from the actor's own profile, never
      accepted from the client — the whole point is that it cannot be claimed. */
  add column if not exists decided_by_role text,
  add column if not exists decided_at timestamptz;

alter table pt_sessions
  add column if not exists decided_by uuid references profiles(id),
  add column if not exists decided_by_role text,
  add column if not exists decided_at timestamptz;

comment on column bookings.decided_by_role is
  'The role of whoever accepted or declined, stamped server-side. Lets a screen '
  'say "accepted by your coach" instead of implying the front desk did it.';

-- ============================================================================
-- 2. THE STAMP, AND WHAT A TRAINER MAY CHANGE
-- ============================================================================
-- A policy can say *who* may update a row. It cannot say *which columns*, so
-- without this a trainer allowed to approve their own class's bookings could
-- also rewrite `member_id` and hand the seat to somebody else. The guard pins
-- everything except the decision.
create or replace function trg_stamp_booking_decision() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare
  v_role text;
begin
  if new.status is not distinct from old.status then
    return new;   -- not a decision; nothing to stamp
  end if;

  -- An automatic expiry has no author. Recording the admin who happened to
  -- have the page open would read as "the desk declined this", which is a
  -- different and false statement about why the member did not get their
  -- session. Set only by sweep_stale_requests(), which is SECURITY DEFINER and
  -- front-desk gated; a client cannot reach set_config through PostgREST.
  if coalesce(current_setting('corefitness.automated', true), '') = 'on' then
    new.decided_by      := null;
    new.decided_by_role := 'system';
    new.decided_at      := now();
    if new.status = 'rejected' then
      new.rejected_at := coalesce(new.rejected_at, now());
    end if;
    return new;
  end if;

  select role::text into v_role from profiles where id = auth.uid();

  -- A trainer may decide, and may decide nothing else.
  if v_role = 'trainer' then
    if new.member_id is distinct from old.member_id
       or new.class_id is distinct from old.class_id then
      raise exception 'A trainer may accept or decline a booking, not reassign it.';
    end if;
    if new.status not in ('approved', 'rejected') then
      raise exception 'A trainer may accept or decline a booking.';
    end if;
  end if;

  new.decided_by      := auth.uid();
  new.decided_by_role := v_role;
  new.decided_at      := now();

  -- Kept in step so the existing screens, which read approved_at, keep working.
  if new.status = 'approved' then
    new.approved_at := coalesce(new.approved_at, now());
    new.approved_by := coalesce(new.approved_by, auth.uid());
  elsif new.status = 'rejected' then
    new.rejected_at := coalesce(new.rejected_at, now());
  end if;

  return new;
end;
$fn$;

drop trigger if exists stamp_booking_decision on bookings;
create trigger stamp_booking_decision
  before update on bookings
  for each row execute function trg_stamp_booking_decision();

create or replace function trg_stamp_pt_decision() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare
  v_role text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if coalesce(current_setting('corefitness.automated', true), '') = 'on' then
    new.decided_by      := null;
    new.decided_by_role := 'system';
    new.decided_at      := now();
    return new;
  end if;

  select role::text into v_role from profiles where id = auth.uid();

  if v_role = 'trainer' then
    if new.member_id is distinct from old.member_id
       or new.trainer_id is distinct from old.trainer_id
       or new.starts_at is distinct from old.starts_at then
      raise exception 'A trainer may accept or decline a session, not move it.';
    end if;
    if new.status not in ('approved', 'rejected') then
      raise exception 'A trainer may accept or decline a session.';
    end if;
  end if;

  new.decided_by      := auth.uid();
  new.decided_by_role := v_role;
  new.decided_at      := now();

  if new.status = 'approved' then
    new.approved_at := coalesce(new.approved_at, now());
    new.approved_by := coalesce(new.approved_by, auth.uid());
  end if;

  return new;
end;
$fn$;

drop trigger if exists stamp_pt_decision on pt_sessions;
create trigger stamp_pt_decision
  before update on pt_sessions
  for each row execute function trg_stamp_pt_decision();

-- ============================================================================
-- 3. THE POLICIES
-- ============================================================================
-- RLS asserted, not assumed — both tables had it enabled in 0002/0015, and a
-- policy on a table whose RLS is off reads exactly like protection and is none.
do $$
declare t text;
begin
  foreach t in array array['bookings', 'pt_sessions'] loop
    if not exists (
      select 1 from pg_tables
       where schemaname = 'public' and tablename = t and rowsecurity
    ) then
      raise exception 'RLS is not enabled on %.', t;
    end if;
  end loop;
end
$$;

-- A trainer decides bookings for the classes they teach. The subquery is
-- itself RLS-filtered (0050), so it has to reach `classes` through a policy the
-- trainer actually has — `classes` is selectable by any authenticated user, so
-- it does.
drop policy if exists bookings_update_trainer on bookings;
create policy bookings_update_trainer on bookings for update
  using (
    exists (
      select 1 from classes c
       where c.id = bookings.class_id
         and c.trainer_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from classes c
       where c.id = bookings.class_id
         and c.trainer_id = auth.uid()
    )
  );

-- And their own PT sessions.
drop policy if exists pt_sessions_update_trainer on pt_sessions;
create policy pt_sessions_update_trainer on pt_sessions for update
  using (trainer_id = auth.uid())
  with check (trainer_id = auth.uid());

-- ============================================================================
-- 4. NOBODY WAITS FOREVER
-- ============================================================================
-- The ladder, and what each rung is for:
--
--   24h pending   the trainer is reminded. Most of these are simply unseen.
--   48h pending   the member is told it is still pending, and told they may
--                 choose another coach. Silence reads as refusal.
--   72h pending   the admin is told. It is a desk problem now.
--   <24h to go    everyone, because the member is about to plan a day around
--                 something nobody has confirmed.
--   start passed  auto-declined, the member told why, the slot freed.
--
-- Every message goes through `notify_once` (0053), so its dedupe key makes a
-- repeat impossible rather than merely unlikely — `not exists` races itself,
-- and this function is called on every admin page load.
create or replace function sweep_stale_requests() returns int
language plpgsql security definer set search_path = public as $fn$
declare
  r record;
  sent int := 0;
  v_admin uuid;
  hours numeric;
begin
  -- Front desk only. This function sends mail to every admin and closes other
  -- people's bookings; a member calling it would be a way to spam the gym.
  -- `auth.uid() is not null and` first, so pg_cron and the SQL Editor — which
  -- have no session and are the intended automatic callers — are not the ones
  -- locked out. 0055 and 0062 both shipped that exact bug.
  if auth.uid() is not null and not is_front_desk() then
    raise exception 'Only the front desk can run the booking sweep.';
  end if;

  -- Marks every write below as automatic, so the decision triggers stamp it
  -- as 'system' rather than as whoever happened to open the page. Transaction
  -- local (the `true`), so it cannot leak into the next statement on this
  -- connection. Not reachable from a client: PostgREST exposes functions in
  -- `public`, and `set_config` lives in `pg_catalog`.
  perform set_config('corefitness.automated', 'on', true);
  -- ── PT sessions still pending ────────────────────────────────────────────
  for r in
    select s.id, s.trainer_id, s.member_id, s.starts_at, s.requested_at,
           extract(epoch from (now() - s.requested_at)) / 3600 as waited_hours,
           extract(epoch from (s.starts_at - now())) / 3600    as until_hours,
           trim(p.first_name || ' ' || p.last_name) as member_name
      from pt_sessions s
      join profiles p on p.id = s.member_id
     where s.status = 'pending'
  loop
    -- Past its start and never decided. Declining is the honest outcome: the
    -- session did not happen, and leaving it 'pending' forever means the slot
    -- stays blocked and the member's history is a lie.
    if r.starts_at < now() then
      update pt_sessions set status = 'rejected' where id = r.id;
      perform notify_once(
        r.member_id, 'booking',
        'Session request expired',
        'Your personal training request was not confirmed before the session time, so it has been closed. Please book another slot — the front desk can help.',
        '/member/bookings', 'pt:' || r.id || ':expired');
      sent := sent + 1;
      continue;
    end if;

    hours := r.waited_hours;

    if r.until_hours < 24 then
      -- Urgent, and everyone hears about it: the member has a day to replan.
      if notify_once(r.trainer_id, 'booking', 'Session tomorrow still unconfirmed',
            r.member_name || ' is waiting on a session that starts in less than a day.',
            '/trainer/bookings', 'pt:' || r.id || ':imminent') then sent := sent + 1; end if;
      if notify_once(r.member_id, 'booking', 'Still waiting on your coach',
            'Your session is less than a day away and has not been confirmed yet. The gym has been notified.',
            '/member/bookings', 'pt:' || r.id || ':imminent:member') then sent := sent + 1; end if;
      for v_admin in select id from profiles where role = 'admin' and status = 'active' loop
        if notify_once(v_admin, 'booking', 'Unconfirmed session within 24 hours',
              r.member_name || ' has a personal training request starting soon that the trainer has not answered.',
              '/bookings', 'pt:' || r.id || ':imminent:admin:' || v_admin) then sent := sent + 1; end if;
      end loop;

    elsif hours >= 72 then
      for v_admin in select id from profiles where role = 'admin' and status = 'active' loop
        if notify_once(v_admin, 'booking', 'Booking request unanswered for 3 days',
              r.member_name || ' requested a session three days ago and the trainer has not responded.',
              '/bookings', 'pt:' || r.id || ':72h:' || v_admin) then sent := sent + 1; end if;
      end loop;

    elsif hours >= 48 then
      if notify_once(r.member_id, 'booking', 'Your request is still pending',
            'Your coach has not confirmed yet. You can wait, or book a different trainer for the same time.',
            '/member/book', 'pt:' || r.id || ':48h') then sent := sent + 1; end if;

    elsif hours >= 24 then
      if notify_once(r.trainer_id, 'booking', 'A member is waiting',
            r.member_name || ' asked for a session a day ago. Accept or decline so they can plan.',
            '/trainer/bookings', 'pt:' || r.id || ':24h') then sent := sent + 1; end if;
    end if;
  end loop;

  -- ── Class bookings still pending ─────────────────────────────────────────
  -- Shorter ladder. A class runs whether or not one seat is confirmed, so the
  -- stakes are the member's certainty rather than a trainer's blocked hour.
  for r in
    select b.id, b.member_id, c.trainer_id, c.scheduled_at, c.name,
           extract(epoch from (now() - b.requested_at)) / 3600 as waited_hours,
           trim(p.first_name || ' ' || p.last_name) as member_name
      from bookings b
      join classes c on c.id = b.class_id
      join profiles p on p.id = b.member_id
     where b.status = 'pending' and c.scheduled_at is not null
  loop
    if r.scheduled_at < now() then
      update bookings set status = 'rejected' where id = r.id;
      perform notify_once(
        r.member_id, 'booking', 'Class booking expired',
        'Your booking for ' || r.name || ' was not confirmed before the class ran.',
        '/member/bookings', 'cls:' || r.id || ':expired');
      sent := sent + 1;
      continue;
    end if;

    if r.waited_hours >= 24 and r.trainer_id is not null then
      if notify_once(r.trainer_id, 'booking', 'Seat request waiting',
            r.member_name || ' asked for a seat in ' || r.name || ' a day ago.',
            '/trainer/bookings', 'cls:' || r.id || ':24h') then sent := sent + 1; end if;
    end if;

    if r.waited_hours >= 48 then
      for v_admin in select id from profiles where role = 'admin' and status = 'active' loop
        if notify_once(v_admin, 'booking', 'Class booking unanswered',
              r.member_name || ' has been waiting two days for a seat in ' || r.name || '.',
              '/bookings', 'cls:' || r.id || ':48h:' || v_admin) then sent := sent + 1; end if;
      end loop;
    end if;
  end loop;

  return sent;
end;
$fn$;

revoke all on function sweep_stale_requests() from public, anon;
grant execute on function sweep_stale_requests() to authenticated;

comment on function sweep_stale_requests() is
  'Reminds, escalates and finally expires booking requests nobody answered. '
  'Re-runnable and safe to call on every page load: every message goes through '
  'notify_once, whose dedupe index makes a repeat impossible. Returns the number '
  'of notifications actually created — 0 means everything is already handled.';

-- ============================================================================
-- 5. A TRAINER SETS THE SIZE OF THEIR OWN CLASS
-- ============================================================================
-- The panel asked that both admin and trainer be able to limit class bookings.
-- `classes.capacity` has existed since 0001 and `class_templates.capacity`
-- since 0015; only the front desk could write either. A trainer who knows the
-- studio holds eight had to ask someone to change it.
--
-- Scoped to their own classes, and to capacity alone — the same reasoning as
-- the decision guard: a policy chooses rows, not columns.
create or replace function trg_trainer_class_edit_guard() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare
  v_role text;
begin
  select role::text into v_role from profiles where id = auth.uid();
  if v_role is distinct from 'trainer' then
    return new;   -- the desk may edit anything; this guard is about trainers
  end if;

  if new.name is distinct from old.name
     or new.scheduled_at is distinct from old.scheduled_at
     or new.trainer_id is distinct from old.trainer_id
     or new.location is distinct from old.location
     or new.duration_minutes is distinct from old.duration_minutes then
    raise exception
      'A trainer can change the class size. The timetable itself is set by the gym.';
  end if;

  -- Never below the seats already taken: those members are booked in, and a
  -- capacity under the roster makes every "spots left" reading negative.
  if new.capacity < (
    select count(*) from bookings b
     where b.class_id = new.id and b.status in ('pending', 'approved')
  ) then
    raise exception 'That class already has more members booked than the size you set.';
  end if;

  return new;
end;
$fn$;

drop trigger if exists trainer_class_edit_guard on classes;
create trigger trainer_class_edit_guard
  before update on classes
  for each row execute function trg_trainer_class_edit_guard();

drop policy if exists classes_update_trainer on classes;
create policy classes_update_trainer on classes for update
  using (trainer_id = auth.uid())
  with check (trainer_id = auth.uid());

-- ============================================================================
-- VERIFICATION — as a real trainer, not as the owner.
-- ============================================================================
--   -- Their own class's booking: allowed.
--   update bookings set status = 'approved' where id = '<booking on my class>';
--   select decided_by_role from bookings where id = '<same>';   -- 'trainer'
--
--   -- Someone else's: matches no policy, updates 0 rows, no error.
--   update bookings set status = 'approved' where id = '<other trainer''s>';
--   -- expected: UPDATE 0  — which is why the app checks the row count.
--
--   -- Reassigning a seat: refused by the guard even on their own class.
--   update bookings set member_id = '<someone else>' where id = '<mine>';
--
--   -- Capacity below the roster: refused.
--   update classes set capacity = 1 where id = '<a class with 5 booked>';
--
--   -- The sweep is safe to run twice; the second returns 0.
--   select sweep_stale_requests();
--   select sweep_stale_requests();
