-- 0037 — an audit trail: who did what, and when.
--
-- The gym owner needs to answer questions the current schema cannot answer at
-- all. "Who cancelled this booking, the member or the desk?" is the clearest
-- one: 0016 lets a member self-cancel by flipping `bookings.status` to
-- 'cancelled', and that is the whole write. No timestamp, no actor. The row
-- afterwards is indistinguishable from one the front desk cancelled a month
-- earlier. Same for a suspension, a freeze, a deleted check-in.
--
-- Three decisions worth stating up front, because each one had a plausible
-- alternative that is wrong:
--
-- 1. **Written by triggers, not by the app.** An audit trail the admin app
--    writes is one the admin app can forget to write, and it would miss every
--    action taken from the member app, an Edge Function, or the SQL editor —
--    which is most of them. Same reasoning as the badge rules in 0028: if the
--    client can decide whether the record exists, the record proves nothing.
--    There is deliberately **no INSERT policy** on this table. Nothing holding
--    an anon or authenticated key can write a row here, forge one, or delete
--    one. The trigger functions are SECURITY DEFINER and are the only writers.
--
-- 2. **No foreign keys.** History outlives its subjects. A member who is
--    archived, a class that is deleted, a plan that is retired — none of those
--    may take the record of what happened with them, and none may block the
--    write either. `actor_id` referencing `profiles` would have made an audit
--    insert fail for any actor without a profile row yet, which would have
--    broken sign-up itself. The ids are stored as plain uuids and joined
--    opportunistically on read.
--
-- 3. **Admin only.** Staff cannot read this table. It is a supervision tool —
--    the point is that the owner can review a shift — so a shared feed would
--    defeat it. Enforced here in RLS; the sidebar guard is only convenience.

-- ============================================================================
-- 1. THE TABLE
-- ============================================================================

create table if not exists activity_log (
  id           bigint generated always as identity primary key,
  occurred_at  timestamptz not null default now(),

  -- Who did it. Nullable on purpose: an unauthenticated sign-up, a pg_cron job
  -- and a backfilled row all genuinely have no actor, and "unknown" must render
  -- as unknown rather than as a plausible name.
  actor_id     uuid,
  -- The role **at the time**. This is history, not a lookup: a receptionist
  -- promoted to admin next year must not retroactively become an admin in every
  -- row she ever wrote.
  actor_role   text,
  -- Name as it read when the action happened. The reader prefers a live join on
  -- `profiles` and only falls back to this when the profile is gone, so a
  -- corrected spelling shows through everywhere it still can.
  actor_label  text,

  -- What happened. Dotted `subject.verb`, past tense, e.g. 'booking.cancelled'.
  action       text not null,
  subject_type text not null,
  subject_id   uuid,

  -- Who it was *about*, when that differs from who did it. The desk records a
  -- payment (actor = staff) for a member (member_id = the member). This is what
  -- makes "everything that ever happened to this member" a single indexed query.
  member_id    uuid,

  -- One human sentence, composed at write time from values that are correct at
  -- write time. Composing it on read would mean re-deriving a deleted class's
  -- name from a row that no longer exists.
  summary      text not null,
  detail       jsonb,

  -- TRUE for rows reconstructed from pre-existing timestamps by the backfill in
  -- section 4. They are real events with real times, but their actor is often
  -- unknown and their coverage is partial, so the page labels them rather than
  -- presenting them as the same quality of record as a live entry.
  reconstructed boolean not null default false
);

create index if not exists idx_activity_log_occurred on activity_log(occurred_at desc);
create index if not exists idx_activity_log_member   on activity_log(member_id, occurred_at desc);
create index if not exists idx_activity_log_actor    on activity_log(actor_id, occurred_at desc);
create index if not exists idx_activity_log_action   on activity_log(action, occurred_at desc);

alter table activity_log enable row level security;

drop policy if exists activity_log_select_admin on activity_log;
create policy activity_log_select_admin on activity_log for select
  using (get_my_role() = 'admin');

-- No INSERT, UPDATE or DELETE policy anywhere. Default-deny is the feature: a
-- log a user can edit is not a log. Retention pruning, if it is ever needed, is
-- an admin running SQL deliberately — not a button.

-- ============================================================================
-- 2. THE WRITER
-- ============================================================================
-- Every trigger funnels through here so the actor is resolved exactly once, the
-- same way, in one place.

create or replace function log_activity(
  p_action       text,
  p_subject_type text,
  p_subject_id   uuid,
  p_member_id    uuid,
  p_summary      text,
  p_detail       jsonb default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_role  text;
  v_label text;
begin
  -- Left join semantics by hand: a caller with no profile row (mid-sign-up, or
  -- a pg_cron job with no session at all) still logs, with a null actor.
  select p.role::text, nullif(trim(p.first_name || ' ' || p.last_name), '')
    into v_role, v_label
    from profiles p
   where p.id = v_actor;

  insert into activity_log (
    actor_id, actor_role, actor_label,
    action, subject_type, subject_id, member_id, summary, detail
  ) values (
    v_actor, v_role, v_label,
    p_action, p_subject_type, p_subject_id, p_member_id, p_summary, p_detail
  );
end;
$$;

-- Display name for a member, for the summary sentence. Returns NULL rather than
-- a placeholder when the profile is missing — the project's no-fallback-identity
-- rule applies to a log line as much as to a profile page.
create or replace function activity_member_name(p_member uuid) returns text
language sql security definer stable set search_path = public as $$
  select nullif(trim(first_name || ' ' || last_name), '')
    from profiles where id = p_member;
$$;

-- ============================================================================
-- 3. THE TRIGGERS
-- ============================================================================
-- Deliberately NOT covered:
--   • `classes`      — `generate_class_instances()` (0015) materialises weeks of
--                      rows at a time from templates. Logging those would bury
--                      every human action under machine noise. The template is
--                      what a person edits, so the template is what is logged.
--   • `notifications` — the Notifications page already is that list.
--   • reads of any kind — no page-view tracking. This logs changes to data.

-- ---------------------------------------------------------------- bookings --
create or replace function log_booking_activity() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_class text;
  v_who   text;
begin
  -- NEW only, never `coalesce(new.x, old.x)`. This trigger fires on INSERT and
  -- UPDATE, and on an INSERT `OLD` is an *unassigned* record — reading a field
  -- off it raises "record \"old\" is not assigned yet" and aborts the statement.
  -- That would have made every new booking fail. NEW is populated for both
  -- operations, so the coalesce was never needed in the first place.
  select c.name into v_class from classes c where c.id = new.class_id;
  v_who := coalesce(activity_member_name(new.member_id), 'A member');

  if tg_op = 'INSERT' then
    perform log_activity('booking.requested', 'booking', new.id, new.member_id,
      v_who || ' requested a spot in ' || coalesce(v_class, 'a class'),
      jsonb_build_object('class_id', new.class_id, 'class_name', v_class));
    return new;
  end if;

  -- Only a real status transition is an event. Any other column changing is
  -- bookkeeping and does not deserve a line.
  if new.status is distinct from old.status then
    perform log_activity(
      'booking.' || new.status::text, 'booking', new.id, new.member_id,
      case new.status
        when 'approved'  then v_who || '''s booking for ' || coalesce(v_class, 'a class') || ' was approved'
        when 'rejected'  then v_who || '''s booking for ' || coalesce(v_class, 'a class') || ' was rejected'
        -- The line this whole migration exists for. `auth.uid()` is the only
        -- thing that can tell these two apart, and it is gone the instant the
        -- statement finishes.
        when 'cancelled' then
          case when auth.uid() = new.member_id
               then v_who || ' cancelled their own booking for ' || coalesce(v_class, 'a class')
               else v_who || '''s booking for ' || coalesce(v_class, 'a class') || ' was cancelled by the front desk'
          end
        else v_who || '''s booking became ' || new.status::text
      end,
      jsonb_build_object(
        'from', old.status, 'to', new.status,
        'class_id', new.class_id, 'class_name', v_class,
        'self_service', auth.uid() = new.member_id));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_log_booking on bookings;
create trigger trg_log_booking after insert or update on bookings
  for each row execute function log_booking_activity();

-- ------------------------------------------------------------ pt_sessions --
create or replace function log_pt_activity() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_member  text;
  v_trainer text;
begin
  -- NEW only — see the note in log_booking_activity(). Insert-or-update trigger.
  v_member  := coalesce(activity_member_name(new.member_id), 'A member');
  v_trainer := activity_member_name(new.trainer_id);

  if tg_op = 'INSERT' then
    perform log_activity('pt.requested', 'pt_session', new.id, new.member_id,
      v_member || ' requested a personal training session'
        || coalesce(' with ' || v_trainer, ''),
      jsonb_build_object('trainer_id', new.trainer_id, 'starts_at', new.starts_at));
    return new;
  end if;

  if new.status is distinct from old.status then
    perform log_activity('pt.' || new.status::text, 'pt_session', new.id, new.member_id,
      v_member || '''s PT session' || coalesce(' with ' || v_trainer, '') || ' was ' || new.status::text,
      jsonb_build_object('from', old.status, 'to', new.status,
                         'trainer_id', new.trainer_id, 'starts_at', new.starts_at));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_log_pt on pt_sessions;
create trigger trg_log_pt after insert or update on pt_sessions
  for each row execute function log_pt_activity();

-- ---------------------------------------------------------------- payments --
create or replace function log_payment_activity() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform log_activity('payment.recorded', 'payment', new.id, new.member_id,
      'Recorded a ' || ('₱' || to_char(new.amount, 'FM999,999,990.00')) || ' ' || new.method
        || ' payment for ' || coalesce(activity_member_name(new.member_id), 'a member'),
      -- `paid_on` and `created_at` are different questions (0008) and both
      -- belong here: the desk can record yesterday's cash this morning.
      jsonb_build_object('amount', new.amount, 'method', new.method,
                         'paid_on', new.paid_on, 'invoice_number', new.invoice_number));
    return new;
  end if;

  if tg_op = 'DELETE' then
    perform log_activity('payment.deleted', 'payment', old.id, old.member_id,
      'Deleted a ' || ('₱' || to_char(old.amount, 'FM999,999,990.00')) || ' payment for '
        || coalesce(activity_member_name(old.member_id), 'a member'),
      jsonb_build_object('amount', old.amount, 'method', old.method, 'paid_on', old.paid_on));
    return old;
  end if;

  if new.amount is distinct from old.amount or new.status is distinct from old.status then
    perform log_activity('payment.amended', 'payment', new.id, new.member_id,
      'Amended a payment for ' || coalesce(activity_member_name(new.member_id), 'a member'),
      jsonb_build_object('amount_from', old.amount, 'amount_to', new.amount,
                         'status_from', old.status, 'status_to', new.status));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_log_payment on payments;
create trigger trg_log_payment after insert or update or delete on payments
  for each row execute function log_payment_activity();

-- -------------------------------------------------------------- attendance --
create or replace function log_attendance_activity() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform log_activity('checkin.recorded', 'attendance', new.id, new.member_id,
      coalesce(activity_member_name(new.member_id), 'A member') || ' checked in'
        || case when new.method = 'qr' then ' by QR' else ' at the desk' end
        || coalesce(' for ' || new.activity, ''),
      jsonb_build_object('method', new.method, 'activity', new.activity,
                         'check_in_time', new.check_in_time));
    return new;
  end if;

  -- 0035 allows a same-day delete so the desk can undo a mis-scan. That undo is
  -- exactly the kind of correction an owner would want to see.
  perform log_activity('checkin.undone', 'attendance', old.id, old.member_id,
    'Undid a check-in for ' || coalesce(activity_member_name(old.member_id), 'a member'),
    jsonb_build_object('method', old.method, 'check_in_time', old.check_in_time));
  return old;
end;
$$;

drop trigger if exists trg_log_attendance on attendance;
create trigger trg_log_attendance after insert or delete on attendance
  for each row execute function log_attendance_activity();

-- ------------------------------------------------------------- memberships --
create or replace function log_membership_activity() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_member text;
  v_plan   text;
begin
  -- NEW only — see the note in log_booking_activity(). Insert-or-update trigger.
  v_member := coalesce(activity_member_name(new.member_id), 'A member');
  select p.name into v_plan from membership_plans p where p.id = new.plan_id;

  if tg_op = 'INSERT' then
    perform log_activity('membership.created', 'membership', new.id, new.member_id,
      v_member || ' was put on the ' || coalesce(v_plan, 'a') || ' plan',
      jsonb_build_object('plan_id', new.plan_id, 'plan_name', v_plan,
                         'status', new.status, 'expiry_date', new.expiry_date));
    return new;
  end if;

  if new.status is distinct from old.status then
    perform log_activity('membership.' || new.status::text, 'membership', new.id, new.member_id,
      v_member || '''s membership is now ' || new.status::text,
      jsonb_build_object('from', old.status, 'to', new.status,
                         'plan_name', v_plan, 'freeze_count', new.freeze_count));
  end if;

  -- An expiry moving is a renewal or an extension — money changed hands, or
  -- somebody granted days. Either way it is worth a line of its own.
  if new.expiry_date is distinct from old.expiry_date then
    perform log_activity('membership.expiry_changed', 'membership', new.id, new.member_id,
      v_member || '''s membership expiry moved from '
        || coalesce(old.expiry_date::text, 'none') || ' to '
        || coalesce(new.expiry_date::text, 'none'),
      jsonb_build_object('from', old.expiry_date, 'to', new.expiry_date, 'plan_name', v_plan));
  end if;

  if new.plan_id is distinct from old.plan_id then
    perform log_activity('membership.plan_changed', 'membership', new.id, new.member_id,
      v_member || ' moved to the ' || coalesce(v_plan, 'a') || ' plan',
      jsonb_build_object('from_plan', old.plan_id, 'to_plan', new.plan_id, 'plan_name', v_plan));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_log_membership on memberships;
create trigger trg_log_membership after insert or update on memberships
  for each row execute function log_membership_activity();

-- ------------------------------------------------- profiles (status + role) --
create or replace function log_profile_activity() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_name text := coalesce(nullif(trim(new.first_name || ' ' || new.last_name), ''), new.email);
begin
  if tg_op = 'INSERT' then
    perform log_activity(
      case when new.status = 'pending_approval' then 'member.registered' else 'account.created' end,
      'profile', new.id,
      case when new.role = 'member' then new.id end,
      case when new.status = 'pending_approval'
           then v_name || ' registered and is awaiting approval'
           else v_name || ' was added as ' || new.role::text end,
      jsonb_build_object('role', new.role, 'status', new.status, 'email', new.email));
    return new;
  end if;

  if new.status is distinct from old.status then
    perform log_activity(
      case
        when old.status = 'pending_approval' and new.status = 'active' then 'member.approved'
        when new.status = 'suspended' then 'member.suspended'
        when new.status = 'archived'  then 'member.archived'
        when old.status in ('suspended','archived') and new.status = 'active' then 'member.reinstated'
        else 'account.status_changed'
      end,
      'profile', new.id,
      case when new.role = 'member' then new.id end,
      v_name || ' — ' || old.status::text || ' → ' || new.status::text,
      jsonb_build_object('from', old.status, 'to', new.status, 'role', new.role));
  end if;

  -- Rare and significant: someone gained or lost desk access.
  if new.role is distinct from old.role then
    perform log_activity('account.role_changed', 'profile', new.id, null,
      v_name || ' changed from ' || old.role::text || ' to ' || new.role::text,
      jsonb_build_object('from', old.role, 'to', new.role));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_log_profile on profiles;
create trigger trg_log_profile after insert or update on profiles
  for each row execute function log_profile_activity();

-- ---------------------------------------------------------- pricing & plans --
create or replace function log_plan_activity() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform log_activity('plan.created', 'plan', new.id, null,
      'Created the ' || new.name || ' plan at ' || ('₱' || to_char(new.price, 'FM999,999,990.00')),
      jsonb_build_object('price', new.price, 'tier', new.tier, 'duration_days', new.duration_days));
    return new;
  end if;

  if tg_op = 'DELETE' then
    perform log_activity('plan.deleted', 'plan', old.id, null,
      'Deleted the ' || old.name || ' plan', jsonb_build_object('price', old.price));
    return old;
  end if;

  -- A price change is the single most consequential edit in the admin app and
  -- had no record at all before this.
  if new.price is distinct from old.price then
    perform log_activity('plan.price_changed', 'plan', new.id, null,
      new.name || ' repriced from ' || ('₱' || to_char(old.price, 'FM999,999,990.00'))
        || ' to ' || ('₱' || to_char(new.price, 'FM999,999,990.00')),
      jsonb_build_object('from', old.price, 'to', new.price));
  end if;

  if new.is_active is distinct from old.is_active then
    perform log_activity('plan.' || case when new.is_active then 'activated' else 'retired' end,
      'plan', new.id, null,
      new.name || ' was ' || case when new.is_active then 'made available again' else 'retired' end,
      jsonb_build_object('is_active', new.is_active));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_log_plan on membership_plans;
create trigger trg_log_plan after insert or update or delete on membership_plans
  for each row execute function log_plan_activity();

-- ------------------------------------------------------------------ events --
create or replace function log_event_activity() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform log_activity('event.created', 'event', new.id, null,
      'Created the event "' || new.title || '"',
      jsonb_build_object('starts_at', new.starts_at, 'capacity', new.capacity));
    return new;
  end if;

  -- 0014 stores only cancellation; everything else about an event's status is
  -- derived from `starts_at`. So cancellation is the only state worth logging.
  if new.cancelled is distinct from old.cancelled then
    perform log_activity('event.' || case when new.cancelled then 'cancelled' else 'reinstated' end,
      'event', new.id, null,
      '"' || new.title || '" was ' || case when new.cancelled then 'cancelled' else 'reinstated' end,
      jsonb_build_object('starts_at', new.starts_at));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_log_event on events;
create trigger trg_log_event after insert or update on events
  for each row execute function log_event_activity();

-- ------------------------------------------------------- class timetable ----
create or replace function log_class_template_activity() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform log_activity('class.template_created', 'class_template', new.id, null,
      'Added ' || new.name || ' to the weekly timetable', to_jsonb(new));
    return new;
  end if;

  if tg_op = 'DELETE' then
    perform log_activity('class.template_deleted', 'class_template', old.id, null,
      'Removed ' || old.name || ' from the weekly timetable', null);
    return old;
  end if;

  if new.active is distinct from old.active then
    perform log_activity('class.template_' || case when new.active then 'resumed' else 'paused' end,
      'class_template', new.id, null,
      new.name || ' was ' || case when new.active then 'resumed' else 'paused' end, null);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_log_class_template on class_templates;
create trigger trg_log_class_template after insert or update or delete on class_templates
  for each row execute function log_class_template_activity();

-- ============================================================================
-- 4. BACKFILL
-- ============================================================================
-- Everything below is reconstructed from timestamps that already existed, so
-- the page has real history the day it ships instead of an empty state.
--
-- What is deliberately NOT reconstructed, and why it matters: **cancellations.**
-- `bookings` stores no `cancelled_at` and no `cancelled_by`, so for every
-- booking already sitting at status='cancelled' there is no honest answer to
-- "when?" or "by whom?". Dating them by `requested_at` would put the
-- cancellation before the booking existed; dating them `now()` would claim they
-- all happened at migration time. Both are inventions. They stay absent, and
-- every cancellation from this migration onward is captured exactly.
--
-- Guarded by `not exists` so re-running the migration cannot duplicate history.

insert into activity_log (occurred_at, actor_id, action, subject_type, subject_id, member_id, summary, detail, reconstructed)
select p.created_at, p.recorded_by, 'payment.recorded', 'payment', p.id, p.member_id,
       'Recorded a ' || ('₱' || to_char(p.amount, 'FM999,999,990.00')) || ' ' || p.method || ' payment for '
         || coalesce(activity_member_name(p.member_id), 'a member'),
       jsonb_build_object('amount', p.amount, 'method', p.method, 'paid_on', p.paid_on), true
  from payments p
 where not exists (select 1 from activity_log a where a.subject_id = p.id and a.action = 'payment.recorded');

insert into activity_log (occurred_at, actor_id, action, subject_type, subject_id, member_id, summary, detail, reconstructed)
select a.check_in_time, a.recorded_by, 'checkin.recorded', 'attendance', a.id, a.member_id,
       coalesce(activity_member_name(a.member_id), 'A member') || ' checked in'
         || case when a.method = 'qr' then ' by QR' else ' at the desk' end,
       jsonb_build_object('method', a.method, 'activity', a.activity), true
  from attendance a
 where not exists (select 1 from activity_log l where l.subject_id = a.id and l.action = 'checkin.recorded');

insert into activity_log (occurred_at, actor_id, action, subject_type, subject_id, member_id, summary, detail, reconstructed)
select b.requested_at, b.member_id, 'booking.requested', 'booking', b.id, b.member_id,
       coalesce(activity_member_name(b.member_id), 'A member') || ' requested a spot in '
         || coalesce(c.name, 'a class'),
       jsonb_build_object('class_name', c.name), true
  from bookings b left join classes c on c.id = b.class_id
 where not exists (select 1 from activity_log l where l.subject_id = b.id and l.action = 'booking.requested');

insert into activity_log (occurred_at, actor_id, action, subject_type, subject_id, member_id, summary, detail, reconstructed)
select b.approved_at, b.approved_by, 'booking.approved', 'booking', b.id, b.member_id,
       coalesce(activity_member_name(b.member_id), 'A member') || '''s booking for '
         || coalesce(c.name, 'a class') || ' was approved',
       jsonb_build_object('class_name', c.name), true
  from bookings b left join classes c on c.id = b.class_id
 where b.approved_at is not null
   and not exists (select 1 from activity_log l where l.subject_id = b.id and l.action = 'booking.approved');

insert into activity_log (occurred_at, actor_id, action, subject_type, subject_id, member_id, summary, detail, reconstructed)
select b.rejected_at, b.approved_by, 'booking.rejected', 'booking', b.id, b.member_id,
       coalesce(activity_member_name(b.member_id), 'A member') || '''s booking for '
         || coalesce(c.name, 'a class') || ' was rejected',
       jsonb_build_object('class_name', c.name), true
  from bookings b left join classes c on c.id = b.class_id
 where b.rejected_at is not null
   and not exists (select 1 from activity_log l where l.subject_id = b.id and l.action = 'booking.rejected');

insert into activity_log (occurred_at, actor_id, action, subject_type, subject_id, member_id, summary, detail, reconstructed)
select s.requested_at, s.member_id, 'pt.requested', 'pt_session', s.id, s.member_id,
       coalesce(activity_member_name(s.member_id), 'A member') || ' requested a personal training session'
         || coalesce(' with ' || activity_member_name(s.trainer_id), ''),
       jsonb_build_object('starts_at', s.starts_at), true
  from pt_sessions s
 where not exists (select 1 from activity_log l where l.subject_id = s.id and l.action = 'pt.requested');

insert into activity_log (occurred_at, actor_id, action, subject_type, subject_id, member_id, summary, detail, reconstructed)
select s.approved_at, s.approved_by, 'pt.approved', 'pt_session', s.id, s.member_id,
       coalesce(activity_member_name(s.member_id), 'A member') || '''s PT session was approved',
       jsonb_build_object('starts_at', s.starts_at), true
  from pt_sessions s
 where s.approved_at is not null
   and not exists (select 1 from activity_log l where l.subject_id = s.id and l.action = 'pt.approved');

insert into activity_log (occurred_at, action, subject_type, subject_id, member_id, summary, detail, reconstructed)
select m.created_at, 'membership.created', 'membership', m.id, m.member_id,
       coalesce(activity_member_name(m.member_id), 'A member') || ' was put on the '
         || coalesce(pl.name, 'a') || ' plan',
       jsonb_build_object('plan_name', pl.name, 'status', m.status, 'expiry_date', m.expiry_date), true
  from memberships m left join membership_plans pl on pl.id = m.plan_id
 where not exists (select 1 from activity_log l where l.subject_id = m.id and l.action = 'membership.created');

insert into activity_log (occurred_at, action, subject_type, subject_id, member_id, summary, detail, reconstructed)
select p.created_at, 'member.registered', 'profile', p.id, p.id,
       coalesce(nullif(trim(p.first_name || ' ' || p.last_name), ''), p.email) || ' joined the gym',
       jsonb_build_object('role', p.role, 'status', p.status), true
  from profiles p
 where p.role = 'member'
   and not exists (select 1 from activity_log l where l.subject_id = p.id and l.action = 'member.registered');

insert into activity_log (occurred_at, actor_id, action, subject_type, subject_id, summary, detail, reconstructed)
select e.created_at, e.created_by, 'event.created', 'event', e.id,
       'Created the event "' || e.title || '"',
       jsonb_build_object('starts_at', e.starts_at, 'capacity', e.capacity), true
  from events e
 where not exists (select 1 from activity_log l where l.subject_id = e.id and l.action = 'event.created');

-- ============================================================================
-- 5. READ HELPER
-- ============================================================================
-- The page needs the actor's *current* name (so a corrected spelling shows
-- everywhere it still can) with the write-time snapshot as the fallback, plus
-- the member the entry is about. Doing that as three PostgREST round trips per
-- page would be three joins the client has to reassemble, so it is one view.
--
-- `security_invoker` is what keeps the admin-only policy on the base table in
-- force: without it the view would run as its owner and hand the whole log to
-- anyone who can select from it.

create or replace view activity_feed
with (security_invoker = true) as
select
  l.id, l.occurred_at, l.action, l.subject_type, l.subject_id,
  l.summary, l.detail, l.reconstructed,
  l.actor_id,
  l.actor_role,
  coalesce(nullif(trim(ap.first_name || ' ' || ap.last_name), ''), l.actor_label) as actor_name,
  ap.photo_url as actor_photo_url,
  l.member_id,
  nullif(trim(mp.first_name || ' ' || mp.last_name), '') as member_name
from activity_log l
left join profiles ap on ap.id = l.actor_id
left join profiles mp on mp.id = l.member_id;

grant select on activity_feed to authenticated;
