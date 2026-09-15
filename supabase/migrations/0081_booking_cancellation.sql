-- ============================================================================
-- 0081  CANCELLING A BOOKING: A REASON, AN ACTOR, AND A TIME
-- ============================================================================
-- Re-runnable.
--
-- A member has been able to cancel since 0016 — the policy lets them flip their
-- own booking to 'cancelled' and nothing else. What the row never recorded is
-- **why**, **who**, or **when**. 0037 says so in its own comment while
-- reconstructing history: "`bookings` stores no `cancelled_at` and no
-- `cancelled_by`, so for every booking already sitting at status='cancelled'
-- there is no honest answer to 'when?' or 'by whom?'." That gap is what this
-- closes, and the activity log's note stops being true from here on.
--
-- ## The status enum does not grow
--
-- 'Cancelled by member' / 'by trainer' / 'by admin' are tempting as statuses and
-- are the wrong shape: they multiply the terminal states four ways and every
-- `status = 'cancelled'` check in the codebase would have to become an IN list —
-- including the partial unique indexes in 0015 that free a trainer's slot, and
-- `membership_is_usable`. Who cancelled is an *attribute* of the cancellation,
-- not a different outcome, so it lives in `cancelled_by_role` and the enum is
-- untouched. One status system, as it already was.
--
-- ## Reasons are a table, not an enum
--
-- `point_rules` and `achievements` are both tables the gym edits for their own
-- rules rather than values frozen into a type, and a cancellation reason is the
-- same kind of thing: the desk will want to add one, and that should not need a
-- migration. An enum would also make "retire this reason but keep the rows that
-- used it" impossible, which is exactly what `is_active` is for.

-- ============================================================================
-- 1. THE REASONS THE GYM OFFERS
-- ============================================================================
create table if not exists cancellation_reasons (
  key         text primary key,
  label       text not null,
  /** Who may pick it: 'member', 'trainer', 'staff', or 'any'. A member has no
      business selecting "Member unavailable" about themselves in the abstract,
      and a trainer cancelling should not claim the member's reasons. */
  applies_to  text not null default 'any'
              check (applies_to in ('any', 'member', 'trainer', 'staff')),
  /** Forces the free-text note. Only 'other' needs it today, but making it a
      column means a future reason can require detail without new code. */
  needs_note  boolean not null default false,
  sort_order  int not null default 100,
  is_active   boolean not null default true
);

comment on table cancellation_reasons is
  'The cancellation reasons offered in the app. A table rather than an enum so '
  'the gym can add one without a migration, and retire one with is_active '
  'without orphaning the bookings that already cite it.';

-- Seeded, not hardcoded in the client. `on conflict do nothing` so re-running
-- never overwrites a label the gym has since reworded.
insert into cancellation_reasons (key, label, applies_to, needs_note, sort_order) values
  ('schedule_conflict',   'Schedule conflict',        'any',     false, 10),
  ('personal_emergency',  'Personal emergency',       'any',     false, 20),
  ('health',              'Health or personal reasons','any',    false, 30),
  ('trainer_unavailable', 'Trainer unavailable',      'trainer', false, 40),
  ('member_unavailable',  'Member unavailable',       'trainer', false, 50),
  ('changed_plans',       'Changed plans',            'member',  false, 60),
  ('mistake',             'Booked by mistake',        'member',  false, 70),
  -- Last, always, and the only one that demands words.
  ('other',               'Other',                    'any',     true,  999)
on conflict (key) do nothing;

alter table cancellation_reasons enable row level security;

-- Readable by anyone signed in: the picker needs them, and a list of reasons is
-- not private. Writable by the front desk only.
drop policy if exists cancellation_reasons_select on cancellation_reasons;
create policy cancellation_reasons_select on cancellation_reasons for select
  using (auth.uid() is not null);

drop policy if exists cancellation_reasons_write on cancellation_reasons;
create policy cancellation_reasons_write on cancellation_reasons for all
  using (is_front_desk()) with check (is_front_desk());

-- ============================================================================
-- 2. WHAT A CANCELLED ROW NOW CARRIES
-- ============================================================================
alter table bookings
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references profiles(id),
  /** 'member' | 'trainer' | 'admin' | 'staff' | 'system'. Stamped from the
      actor's own profile inside cancel_booking(), never accepted from the
      client — the same rule as decided_by_role in 0071. */
  add column if not exists cancelled_by_role text,
  add column if not exists cancellation_reason text references cancellation_reasons(key),
  add column if not exists cancellation_note text
    check (cancellation_note is null or length(cancellation_note) <= 500);

alter table pt_sessions
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references profiles(id),
  add column if not exists cancelled_by_role text,
  add column if not exists cancellation_reason text references cancellation_reasons(key),
  add column if not exists cancellation_note text
    check (cancellation_note is null or length(cancellation_note) <= 500);

comment on column bookings.cancelled_by_role is
  'Who cancelled, in what capacity. Stamped server-side so a screen can say '
  '"your coach cancelled this" rather than leaving the member to guess.';

-- ============================================================================
-- 3. ONE FUNCTION, BOTH TABLES, EVERY RULE
-- ============================================================================
-- SECURITY DEFINER because it must read the actor's role and the other party's
-- id to notify them, and a member may not select either. The guard is the first
-- thing it does.
--
-- `p_kind` is 'class' or 'pt' rather than two near-identical functions: the
-- validation is the same sentence in both cases, and two copies is how the two
-- halves of a rule drift apart.
create or replace function cancel_booking(
  p_kind   text,
  p_id     uuid,
  p_reason text,
  p_note   text default null
) returns void
language plpgsql security definer set search_path = public as $fn$
declare
  v_role        text;
  v_member      uuid;
  v_trainer     uuid;
  v_status      booking_status;
  v_starts_at   timestamptz;
  v_what        text;
  v_needs_note  boolean;
  v_label       text;
  v_applies     text;
  v_actor_role  text;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to cancel a booking.';
  end if;
  if p_kind not in ('class', 'pt') then
    raise exception 'Unknown booking type.';
  end if;

  select role::text into v_role from profiles where id = auth.uid();

  -- ── The booking, and who it belongs to ───────────────────────────────────
  if p_kind = 'pt' then
    select s.member_id, s.trainer_id, s.status, s.starts_at, 'personal training session'
      into v_member, v_trainer, v_status, v_starts_at, v_what
      from pt_sessions s where s.id = p_id;
  else
    select b.member_id, c.trainer_id, b.status, c.scheduled_at, coalesce(c.name, 'a class')
      into v_member, v_trainer, v_status, v_starts_at, v_what
      from bookings b join classes c on c.id = b.class_id
     where b.id = p_id;
  end if;

  if v_member is null then
    raise exception 'That booking could not be found.';
  end if;

  -- ── May this person cancel it? ───────────────────────────────────────────
  -- Ordered so the actor's capacity is decided once and reused for the stamp.
  if v_member = auth.uid() then
    v_actor_role := 'member';
  elsif v_trainer is not null and v_trainer = auth.uid() and v_role = 'trainer' then
    v_actor_role := 'trainer';
  elsif is_front_desk() then
    v_actor_role := coalesce(v_role, 'staff');
  else
    raise exception 'You cannot cancel a booking that is not yours.';
  end if;

  -- ── Is it cancellable? ───────────────────────────────────────────────────
  if v_status = 'cancelled' then
    raise exception 'That booking has already been cancelled.';
  end if;
  if v_status = 'rejected' then
    raise exception 'That booking was declined and cannot be cancelled.';
  end if;
  -- A session that has already begun cannot be un-booked: it either happened or
  -- it was a no-show, and both are history rather than a cancellation. The desk
  -- is not exempt — rewriting the past is the thing this rule prevents.
  if v_starts_at is not null and v_starts_at <= now() then
    raise exception
      'That session has already started, so it can no longer be cancelled. Ask the front desk to correct the record.';
  end if;

  -- ── Is the reason real, and complete? ────────────────────────────────────
  select r.needs_note, r.label, r.applies_to
    into v_needs_note, v_label, v_applies
    from cancellation_reasons r
   where r.key = p_reason and r.is_active;

  if v_label is null then
    raise exception 'Choose a reason for cancelling.';
  end if;
  if v_applies <> 'any' and v_applies <> v_actor_role
     and not (v_applies = 'staff' and v_actor_role in ('admin', 'staff')) then
    raise exception 'That reason is not one you can give for this cancellation.';
  end if;
  -- The note is required for 'other' and is checked HERE, not in the form: a
  -- client that skips the dialog must still not be able to file a blank reason.
  if v_needs_note and coalesce(btrim(p_note), '') = '' then
    raise exception 'Please say why, in your own words.';
  end if;

  -- ── Write it ─────────────────────────────────────────────────────────────
  -- Transaction-local, so it cannot leak into the next statement on this
  -- connection. Tells the 0074 decision guards that this particular update is a
  -- checked cancellation rather than a trainer trying to set a status by hand.
  perform set_config('corefitness.cancelling', 'on', true);

  if p_kind = 'pt' then
    update pt_sessions
       set status = 'cancelled',
           cancelled_at = now(),
           cancelled_by = auth.uid(),
           cancelled_by_role = v_actor_role,
           cancellation_reason = p_reason,
           cancellation_note = nullif(btrim(p_note), '')
     where id = p_id;
  else
    update bookings
       set status = 'cancelled',
           cancelled_at = now(),
           cancelled_by = auth.uid(),
           cancelled_by_role = v_actor_role,
           cancellation_reason = p_reason,
           cancellation_note = nullif(btrim(p_note), '')
     where id = p_id;
  end if;

  -- ── Tell the other side ──────────────────────────────────────────────────
  -- The record is the row; this is the alert. Through notify_once so a repeated
  -- call cannot produce a second message (0053's dedupe index).
  if v_actor_role = 'member' then
    if v_trainer is not null then
      perform notify_once(
        v_trainer, 'booking',
        'A booking was cancelled',
        'Your member cancelled ' || v_what || '. Reason given: ' || v_label || '.',
        '/trainer/bookings', 'cancel:' || p_id::text || ':trainer');
    end if;
  else
    perform notify_once(
      v_member, 'booking',
      case when v_actor_role = 'trainer'
           then 'Your coach cancelled a session'
           else 'A booking was cancelled' end,
      case when v_actor_role = 'trainer'
           then 'Your coach cancelled ' || v_what || '. Reason given: ' || v_label || '. You can book another time.'
           else 'The front desk cancelled ' || v_what || '. Reason given: ' || v_label || '.' end,
      '/member/bookings', 'cancel:' || p_id::text || ':member');
  end if;
end;
$fn$;

revoke all on function cancel_booking(text, uuid, text, text) from public, anon;
grant execute on function cancel_booking(text, uuid, text, text) to authenticated;

comment on function cancel_booking(text, uuid, text, text) is
  'Cancels a class booking or a PT session with a reason, stamping who did it '
  'and when. Every rule lives here: ownership, already-cancelled, already-'
  'started, and a reason that exists and carries a note when it needs one.';

-- ============================================================================
-- 4. A TRAINER MAY NOW CANCEL — A DELIBERATE REVERSAL OF 0071
-- ============================================================================
-- 0071 decided the other way, and said so in the guard:
--
--     -- A trainer decides, and the only decisions are yes and no. Cancelling
--     -- on a member's behalf is the desk's job.
--     if v_role = 'trainer' and new.status not in ('approved','rejected') then
--       raise exception 'A trainer may accept or decline a booking.';
--
-- The gym has asked for the opposite: a coach who cannot make Tuesday should be
-- able to call it off themselves rather than ringing the desk. This is a policy
-- change, not a bug fix, and it is written here rather than by editing 0074 so
-- the original reasoning stays legible.
--
-- **The trainer still cannot cancel by hand.** The escape below is a
-- transaction-local flag that only `cancel_booking()` sets — the same mechanism
-- and the same reasoning as 0071's `corefitness.automated`, and equally out of
-- reach of a client, because PostgREST exposes `public` and `set_config` lives
-- in `pg_catalog`. A trainer PATCHing `status=cancelled` straight at the table
-- still gets the old refusal, so a cancellation without a reason remains
-- impossible however it is attempted.
--
-- The escape sits *after* the column pins, which run at the top of both
-- functions and are never skipped: cancelling still cannot smuggle in a change
-- of `member_id` or `starts_at`.
--
-- Everything else in both functions is 0074 verbatim.
create or replace function trg_stamp_booking_decision() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare
  v_role text;
begin
  select role::text into v_role from profiles where id = auth.uid();

  if v_role = 'trainer' then
    if new.member_id is distinct from old.member_id
       or new.class_id is distinct from old.class_id then
      raise exception 'A trainer may accept or decline a booking, not reassign it.';
    end if;
  end if;

  if new.status is not distinct from old.status then
    return new;   -- not a decision; nothing to stamp
  end if;

  if coalesce(current_setting('corefitness.automated', true), '') = 'on' then
    new.decided_by      := null;
    new.decided_by_role := 'system';
    new.decided_at      := now();
    if new.status = 'rejected' then
      new.rejected_at := coalesce(new.rejected_at, now());
    end if;
    return new;
  end if;

  -- Going through cancel_booking(), which has already checked ownership, the
  -- start time and the reason, and sets the cancellation columns itself. A
  -- cancellation is not a decision, so nothing is stamped as one.
  if coalesce(current_setting('corefitness.cancelling', true), '') = 'on'
     and new.status = 'cancelled' then
    return new;
  end if;

  if v_role = 'trainer' and new.status not in ('approved', 'rejected') then
    raise exception 'A trainer may accept or decline a booking.';
  end if;

  new.decided_by      := auth.uid();
  new.decided_by_role := v_role;
  new.decided_at      := now();

  if new.status = 'approved' then
    new.approved_at := coalesce(new.approved_at, now());
    new.approved_by := coalesce(new.approved_by, auth.uid());
  elsif new.status = 'rejected' then
    new.rejected_at := coalesce(new.rejected_at, now());
  end if;

  return new;
end;
$fn$;

create or replace function trg_stamp_pt_decision() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare
  v_role text;
begin
  select role::text into v_role from profiles where id = auth.uid();

  if v_role = 'trainer' then
    if new.member_id is distinct from old.member_id
       or new.trainer_id is distinct from old.trainer_id
       or new.starts_at is distinct from old.starts_at then
      raise exception 'A trainer may accept or decline a session, not move it.';
    end if;
  end if;

  if new.status is not distinct from old.status then
    return new;
  end if;

  if coalesce(current_setting('corefitness.automated', true), '') = 'on' then
    new.decided_by      := null;
    new.decided_by_role := 'system';
    new.decided_at      := now();
    return new;
  end if;

  if coalesce(current_setting('corefitness.cancelling', true), '') = 'on'
     and new.status = 'cancelled' then
    return new;
  end if;

  if v_role = 'trainer' and new.status not in ('approved', 'rejected') then
    raise exception 'A trainer may accept or decline a session.';
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

-- The row-level half. 0071 gave a trainer UPDATE on their own sessions for the
-- decision; this restates it so a fresh database does not depend on reading
-- 0071 to know the policy exists. Column-level rules stay in the trigger, which
-- is the split 0071 established.
drop policy if exists pt_sessions_cancel_trainer on pt_sessions;
create policy pt_sessions_cancel_trainer on pt_sessions for update
  using (trainer_id = auth.uid() and get_my_role() = 'trainer')
  with check (trainer_id = auth.uid() and get_my_role() = 'trainer');

-- ============================================================================
-- 5. NO CANCELLATION WITHOUT A REASON — AS A RULE, NOT A CONVENTION
-- ============================================================================
-- Everything above is only as strong as the client choosing to use it. 0016's
-- `bookings_cancel_self` still lets a member PATCH `status='cancelled'` straight
-- at the table with no reason at all, and the admin app did the same thing from
-- `cancelOwnBooking()`. A reason that any caller can skip is not required.
--
-- So the transition INTO 'cancelled' is refused unless it arrives through
-- `cancel_booking()`, which is the only thing that sets this flag and has
-- already checked ownership, timing and the reason. Nothing else about either
-- table changes: approve, reject and the automatic expiry are untouched.
--
-- Deliberately a trigger and not a CHECK constraint. A CHECK on "reason is not
-- null when status is cancelled" would reject every row already sitting at
-- 'cancelled' from before this migration — real history, for which 0037
-- established there is no honest answer — the moment anything updated it.
create or replace function trg_require_cancellation_reason() returns trigger
language plpgsql set search_path = public as $fn$
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled'
     and coalesce(current_setting('corefitness.cancelling', true), '') <> 'on' then
    raise exception
      'Cancel through the app so a reason is recorded (cancel_booking).';
  end if;
  return new;
end;
$fn$;

drop trigger if exists trg_bookings_require_cancel_reason on bookings;
create trigger trg_bookings_require_cancel_reason
before update on bookings
for each row execute function trg_require_cancellation_reason();

drop trigger if exists trg_pt_require_cancel_reason on pt_sessions;
create trigger trg_pt_require_cancel_reason
before update on pt_sessions
for each row execute function trg_require_cancellation_reason();

-- Marker for scripts/probe-migrations.py.
create or replace function migration_0081_applied() returns boolean
language sql immutable as $fn$ select true $fn$;

revoke all on function migration_0081_applied() from public, anon;
grant execute on function migration_0081_applied() to authenticated;

comment on function migration_0081_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION
--   select count(*) from cancellation_reasons where is_active;          -- 8
--   As a member, on someone else's booking:
--     select cancel_booking('pt', '<other member''s id>', 'changed_plans');
--       -> 'You cannot cancel a booking that is not yours.'
--   As the member who owns it, with no reason:
--     select cancel_booking('pt', '<id>', 'other');
--       -> 'Please say why, in your own words.'
--   On a session that has started:
--       -> 'That session has already started...'
--   Twice in a row:
--       -> 'That booking has already been cancelled.'
