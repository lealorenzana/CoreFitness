-- ============================================================================
-- CORE FITNESS — outstanding migrations 0034 → 0038, in order, as one paste.
-- ============================================================================
--
-- HOW TO RUN
--   1. Supabase dashboard → your project → SQL Editor → New query
--   2. Paste this whole file
--   3. Run
--   4. Read the final result grid — it reports what actually landed.
--
-- WRAPPED IN A TRANSACTION on purpose. If any statement fails, the whole thing
-- rolls back and your database is exactly as it was — you will not be left half
-- migrated. Nothing in these five needs to run outside a transaction (checked:
-- no CREATE INDEX CONCURRENTLY, no ALTER TYPE ... ADD VALUE, no CREATE EXTENSION).
--
-- SAFE TO RE-RUN. Every table is CREATE TABLE IF NOT EXISTS, every policy and
-- trigger is preceded by DROP ... IF EXISTS, and every seed is ON CONFLICT.
-- If you already ran some of these, running again changes nothing.
--
-- WHAT EACH ONE DOES
--   0034  front desk may delete notification rows  → admin "Recall" button works
--   0035  same-day undo of a check-in              → Attendance "Undo" works
--   0036  member row created at SIGN-UP            → stops onboarding replaying
--   0037  activity_log audit trail                 → admin Activity page
--   0038  achievements become editable data        → admin Achievements page
--
-- AFTER IT SUCCEEDS: open a member's Achievements screen and confirm their
-- badges are still there. 0038 rewrites sync_my_achievements(); if anything
-- looks wrong, the version in 0028 is the rollback.
-- ============================================================================

begin;


-- ############################################################################
-- ###  0034_admin_recall_broadcast.sql
-- ############################################################################

-- 0034 — let the front desk take back an announcement it should not have sent.
--
-- `notifications_delete_self` (0003, rewritten in 0006) is `user_id = auth.uid()`
-- and it is the ONLY delete policy on the table. So an admin deleting a
-- broadcast's rows matched nothing — and a DELETE that matches no rows is not an
-- error in PostgreSQL, exactly like the zero-row UPDATE that silently discarded
-- every onboarding experience level. The client would have reported "removed
-- from 40 inboxes" while the rows sat untouched in all 40.
--
-- Two ways to fix it: drop the feature, or give the desk the permission the
-- feature needs. A gym that announces "closed Sunday" to 200 people and then
-- realises it meant Saturday needs the second one.
--
-- Deliberately admin/staff, matching every other broadcast power — `is_front_desk()`
-- is the same predicate `notifications_insert_staff` should have used, and the
-- people who can send an announcement are the people who can unsend it.

drop policy if exists notifications_delete_frontdesk on notifications;
create policy notifications_delete_frontdesk on notifications for delete
  using (is_front_desk());

-- The self policy stays. Both are permissive, so a member keeps deleting their
-- own rows from `/{member,trainer}/notifications` and the desk gains the rest.
-- Nothing else changes: this grants DELETE only, so the tamper trigger from 0029
-- still governs what an UPDATE may touch.

-- ############################################################################
-- ###  0035_attendance_undo.sql
-- ############################################################################

-- 0035 — let the front desk undo a check-in it just got wrong.
--
-- `attendance` has had SELECT and INSERT policies since 0002 and nothing else,
-- so DELETE and UPDATE were default-deny. A desk that scanned the wrong member,
-- or checked someone in twice through two different lanes, had no way to fix it:
-- the row was permanent, it counted toward that member's training days in
-- `member_training_stats` (0028), and it counted against the gym in Retention.
--
-- **Same day only.** A mis-scan is noticed within minutes, so that is all the
-- window the desk needs — and it is the difference between correcting today's
-- mistake and being able to quietly rewrite last month's history. `check_in_time`
-- is compared in **Manila time**, not UTC: the gym's day is not the server's, and
-- a 6am visit is normal here. Comparing in UTC would make the last eight hours of
-- every gym day belong to "yesterday" and fall outside the window immediately.
--
-- A hard delete rather than a `voided_at` flag on purpose. A wrong check-in is
-- false data, not history — and soft-voiding would mean auditing every existing
-- reader (progression, retention, the member's own attendance history) to teach
-- each one to skip voided rows. Every one of those readers stays correct as-is.

drop policy if exists attendance_delete_frontdesk on attendance;
create policy attendance_delete_frontdesk on attendance for delete
  using (
    is_front_desk()
    and (check_in_time at time zone 'Asia/Manila')::date
        = (now() at time zone 'Asia/Manila')::date
  );

-- Deliberately no UPDATE policy. There is nothing on this row worth editing:
-- the member, the time and the method are facts about what happened. If any of
-- them is wrong the row is wrong — delete it and scan again.

-- ############################################################################
-- ###  0036_member_row_at_signup.sql
-- ############################################################################

-- 0036 — the member's row exists from sign-up, not from approval.
--
-- 0033 moved "have I finished onboarding?" off localStorage and onto
-- `member_profiles.onboarding_completed_at`, and its own comment said:
--
--     "No policy or trigger work needed. member_profiles_update_self (0006)
--      already lets a member write their own row."
--
-- That is true, and it is not enough, because **there is no row to write yet.**
-- The order of events for a self-registering member is:
--
--   1. signUp()          → trigger 0005 creates `profiles` (pending_approval)
--                          and a `pending_registrations` entry. No member row.
--   2. first login       → onboarding runs
--   3. onboarding finish → UPDATE member_profiles … matches **zero rows**
--   4. admin approves    → INSERT member_profiles … with the column NULL
--
-- A zero-row UPDATE is not an error, so step 3 reported success and wrote
-- nothing. The client caught this and parked the answer in localStorage to
-- apply later — which re-created the exact per-device flag 0033 set out to
-- remove. Sign in on a phone instead of the laptop you registered on and the
-- whole flow replays, permanently, because nothing ever writes the column.
--
-- `experience_level` was lost the same way, and that one is worse: it is what
-- Book a Session reads to recommend classes, so every self-registered member
-- has been getting recommendations based on an answer the database never saw.
--
-- Fix the ordering rather than the symptom: create the row at sign-up. A member
-- who has registered *is* a member record — `profiles.status` is what says
-- whether they may use the gym, and that is unchanged. Approval now fills the
-- row in instead of creating it.

-- ── 1. Backfill, before any new rows exist ──────────────────────────────────
--
-- Every `member_profiles` row that exists right now belongs to somebody who was
-- approved, which means they registered, which means they were walked through
-- onboarding at least once. Marking them complete is the honest reading, and it
-- follows the rule the client already states: wrongly re-running onboarding for
-- an existing member is far more annoying than wrongly skipping it for a new
-- one. `created_at` rather than now(), so the timestamp does not claim they
-- finished onboarding on the day this migration was run.
update member_profiles
   set onboarding_completed_at = created_at
 where onboarding_completed_at is null;

-- ── 2. Rows for members who never got one ──────────────────────────────────
--
-- Runs after the backfill on purpose: these are the still-pending members, and
-- they keep `onboarding_completed_at = NULL` because they may genuinely not
-- have finished. From here on their answers have somewhere to land.
insert into member_profiles (profile_id, qr_code)
select p.id, p.id::text
  from profiles p
 where p.role = 'member'
   and not exists (select 1 from member_profiles m where m.profile_id = p.id)
on conflict (profile_id) do nothing;

-- ── 3. What the member picked in onboarding, kept ──────────────────────────
--
-- The interests step wrote to `localStorage['fitness_preferences']` and was read
-- by nothing at all — a control that writes a flag nothing reads. Stored here it
-- survives the device and can drive recommendations.
alter table member_profiles
  add column if not exists interests text[] not null default '{}';

comment on column member_profiles.interests is
  'Activities the member picked in onboarding. Drives class recommendations alongside experience_level. Empty = no preference expressed, which means "recommend nothing on this basis", not "recommend everything".';

-- ── 4. Sign-up creates the row ─────────────────────────────────────────────
--
-- Same SECURITY DEFINER trigger as 0005, with the member row added. It stays
-- guarded by `signup_source` so the admin-bootstrap and create-trainer paths
-- still no-op. `qr_code` matches what approval used to set (the profile id), so
-- check-in behaves identically.
create or replace function handle_new_member_signup() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  meta jsonb := new.raw_user_meta_data;
begin
  if meta->>'signup_source' is distinct from 'member_self_registration' then
    return new;
  end if;

  insert into profiles (id, role, first_name, last_name, email, phone, status)
  values (
    new.id,
    'member',
    coalesce(meta->>'first_name', 'New'),
    coalesce(meta->>'last_name', 'Member'),
    new.email,
    meta->>'phone',
    'pending_approval'
  )
  on conflict (id) do nothing;

  -- The row onboarding writes into. Created here, not at approval, because
  -- onboarding runs first.
  insert into member_profiles (profile_id, qr_code)
  values (new.id, new.id::text)
  on conflict (profile_id) do nothing;

  insert into pending_registrations (first_name, last_name, email, phone, requested_plan_id, auth_user_id)
  values (
    coalesce(meta->>'first_name', 'New'),
    coalesce(meta->>'last_name', 'Member'),
    new.email,
    meta->>'phone',
    nullif(meta->>'requested_plan_id', '')::uuid,
    new.id
  )
  on conflict (email) do nothing;

  return new;
end;
$$;

-- ── 5. Approval fills the row in ───────────────────────────────────────────
--
-- The admin client used to INSERT here and would now hit a duplicate key. It
-- has been changed to an UPDATE; this function exists so the intake fields land
-- in one statement regardless, and so a member row is created if this project
-- somehow has a member without one (an account made before this migration on a
-- different path).
create or replace function apply_registration_details(
  member uuid,
  p_date_of_birth date,
  p_gender text,
  p_address text,
  p_ec_name text,
  p_ec_phone text,
  p_ec_relationship text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_front_desk() then
    raise exception 'Only the front desk can apply registration details';
  end if;

  insert into member_profiles (profile_id, qr_code, date_of_birth, gender, address,
                               emergency_contact_name, emergency_contact_phone,
                               emergency_contact_relationship)
  values (member, member::text, p_date_of_birth, p_gender, p_address,
          p_ec_name, p_ec_phone, p_ec_relationship)
  on conflict (profile_id) do update
    set date_of_birth                  = coalesce(excluded.date_of_birth, member_profiles.date_of_birth),
        gender                         = coalesce(excluded.gender, member_profiles.gender),
        address                        = coalesce(excluded.address, member_profiles.address),
        emergency_contact_name         = coalesce(excluded.emergency_contact_name, member_profiles.emergency_contact_name),
        emergency_contact_phone        = coalesce(excluded.emergency_contact_phone, member_profiles.emergency_contact_phone),
        emergency_contact_relationship = coalesce(excluded.emergency_contact_relationship, member_profiles.emergency_contact_relationship);
end;
$$;

grant execute on function apply_registration_details(uuid, date, text, text, text, text, text) to authenticated;

comment on function apply_registration_details is
  'Approval-time write of the sign-up intake fields. Upserts because 0036 makes the member row exist from sign-up, so the old INSERT would now collide. coalesce keeps a value the member has since edited from being overwritten by a blank from the queue.';

-- ############################################################################
-- ###  0037_activity_log.sql
-- ############################################################################

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

-- ############################################################################
-- ###  0038_achievements_as_data.sql
-- ############################################################################

-- 0038 — achievements become data the admin owns, instead of code a developer owns.
--
-- 0028 hardcoded 33 earning rules as `if s.training_days >= 25 then …` inside
-- `sync_my_achievements()`, and their titles/icons in a TypeScript file. Adding
-- one meant editing two files in two languages and shipping a deploy, so in
-- practice the gym could never add one at all.
--
-- What does NOT change, because it is the whole point of 0028: **a badge still
-- cannot be granted from a browser.** `achievement_unlocks` still has no INSERT
-- policy. The evaluator is still SECURITY DEFINER and still grades only the
-- caller. What moves is *which rules it evaluates* — from function body to a
-- table an admin can edit. An admin editing the rules is a different act from a
-- member awarding themselves a badge, and only the second one was ever the
-- threat.
--
-- Three rule kinds, because one shape does not honestly cover all 33:
--
--   'metric'  — a named stat vs a number. Covers 31 of them, and is the only
--               kind the admin UI can create.
--   'builtin' — evaluated by hardcoded logic that a metric+threshold cannot
--               express. Exactly two: the level badges, which must agree with
--               `level_thresholds()` or Home and the gallery contradict each
--               other. Editable copy, locked rule.
--   'manual'  — no rule at all. An admin hands it to one person: "Member of the
--               Month", "Most Improved". Earned by judgement, not arithmetic.

-- ============================================================================
-- 1. THE METRIC WHITELIST
-- ============================================================================
-- Every column an admin may build a rule on. A table rather than a CHECK
-- constraint so the admin UI can populate its dropdown from the database and
-- cannot offer a metric the evaluator would fail to read.
--
-- These are exactly the output columns of `member_training_stats()` and
-- `trainer_stats()` (0028), minus `member_since`: that one is a date, and a
-- date cannot be compared to a threshold. It is exposed below as the derived
-- `days_as_member` instead, which is the question anybody actually asks of it.

create table if not exists achievement_metrics (
  key        text primary key,
  audience   text not null check (audience in ('member', 'trainer')),
  label      text not null,
  /** Shown after the number in the admin rule builder: "25 days". */
  unit       text,
  /** TRUE for yes/no stats. The evaluator coerces true→1, false→0, so the
   *  threshold for these is always 1 — the UI hides the number box. */
  is_boolean boolean not null default false,
  sort_order int not null default 0
);

insert into achievement_metrics (key, audience, label, unit, is_boolean, sort_order) values
  ('training_days',        'member', 'Training days',                'days',       false,  1),
  ('verified_days',        'member', 'Verified check-ins at the desk','days',      false,  2),
  ('logged_days',          'member', 'Self-logged workout days',     'days',       false,  3),
  ('consistent_weeks',     'member', 'Consistent weeks (2+ sessions)','weeks',     false,  4),
  ('current_week_streak',  'member', 'Current weekly streak',        'weeks',      false,  5),
  ('best_week_streak',     'member', 'Best weekly streak',           'weeks',      false,  6),
  ('weekend_days',         'member', 'Weekend training days',        'days',       false,  7),
  ('early_checkins',       'member', 'Check-ins before 7am',         'check-ins',  false,  8),
  ('late_checkins',        'member', 'Check-ins after 8pm',          'check-ins',  false,  9),
  ('distinct_activities',  'member', 'Different activities tried',   'activities', false, 10),
  ('goals_achieved',       'member', 'Fitness goals reached',        'goals',      false, 11),
  ('measurements',         'member', 'Body measurements logged',     'entries',    false, 12),
  ('classes_attended',     'member', 'Group classes attended',       'classes',    false, 13),
  ('pt_sessions_done',     'member', 'PT sessions completed',        'sessions',   false, 14),
  ('days_as_member',       'member', 'Days since joining',           'days',       false, 15),
  ('sessions_delivered',   'trainer','PT sessions delivered',        'sessions',   false,  1),
  ('distinct_members',     'trainer','Different members trained',    'members',    false,  2),
  ('classes_led',          'trainer','Attended classes led',         'classes',    false,  3),
  ('notes_sent',           'trainer','Recommendations sent',         'notes',      false,  4),
  ('availability_windows', 'trainer','Bookable hour windows',        'windows',    false,  5),
  ('profile_complete',     'trainer','Profile fully filled in',      null,         true,   6),
  ('days_active',          'trainer','Days on the team',             'days',       false,  7)
on conflict (key) do update
  set audience = excluded.audience, label = excluded.label,
      unit = excluded.unit, is_boolean = excluded.is_boolean,
      sort_order = excluded.sort_order;

-- ============================================================================
-- 2. THE CATALOGUE
-- ============================================================================

create table if not exists achievements (
  -- Stable, and the join to `achievement_unlocks.achievement_key`. Renaming one
  -- would orphan every unlock, so the UI never lets an existing key change.
  key         text primary key,
  audience    text not null check (audience in ('member', 'trainer')),

  title       text not null,
  /** Past tense, addressed to whoever earned it. */
  description text not null,
  /** What it takes, shown while still locked. A locked badge that will not say
   *  what it wants is a tease. */
  requirement text not null,
  /** Name from the app's icon registry, not a URL. Unknown names fall back to a
   *  default rather than rendering a hole. */
  icon        text not null default 'Award',
  tier        text not null default 'bronze'
                check (tier in ('bronze', 'silver', 'gold', 'platinum')),
  category    text not null default 'General',

  rule_kind   text not null default 'metric'
                check (rule_kind in ('metric', 'builtin', 'manual')),
  metric      text references achievement_metrics(key),
  threshold   numeric,
  -- Optional second condition, ANDed with the first. Nothing seeded uses it —
  -- the two rules that need two conditions are 'builtin' — but the admin UI
  -- offers it, e.g. "50 training days AND 8 consistent weeks".
  metric2     text references achievement_metrics(key),
  threshold2  numeric,

  /** Retired achievements stay in the table so past unlocks still render; they
   *  are simply no longer awarded and are hidden from the locked list. */
  active      boolean not null default true,
  /** Seeded by this migration. Their rules are expected by the app, so the UI
   *  warns before retiring one — but does not forbid it. */
  builtin     boolean not null default false,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  created_by  uuid,

  -- A 'metric' rule without a metric is a badge nobody can earn, and a 'manual'
  -- rule with one is a lie about how it is granted. Enforced here rather than
  -- trusted to the form.
  constraint achievements_rule_shape check (
    (rule_kind = 'metric'  and metric is not null and threshold is not null) or
    (rule_kind = 'builtin') or
    (rule_kind = 'manual'  and metric is null and threshold is null)
  ),
  constraint achievements_second_condition check (
    (metric2 is null and threshold2 is null) or
    (metric2 is not null and threshold2 is not null and rule_kind = 'metric')
  )
);

create index if not exists idx_achievements_audience
  on achievements(audience, sort_order) where active;

alter table achievements enable row level security;
alter table achievement_metrics enable row level security;

-- Everyone signed in reads the catalogue — members need it to see what is left
-- to earn, and the gallery would be empty otherwise.
drop policy if exists achievements_select_all on achievements;
create policy achievements_select_all on achievements for select
  using (auth.uid() is not null);

drop policy if exists achievement_metrics_select_all on achievement_metrics;
create policy achievement_metrics_select_all on achievement_metrics for select
  using (auth.uid() is not null);

-- Writing the catalogue is an admin act. Deliberately NOT `is_front_desk()`:
-- inventing a badge changes what the gym rewards, which is the same class of
-- decision as plan pricing, and staff do not get that.
drop policy if exists achievements_write_admin on achievements;
create policy achievements_write_admin on achievements for all
  using (get_my_role() = 'admin') with check (get_my_role() = 'admin');

-- The metric list is fixed by what the stats functions actually compute. There
-- is no write policy at all: adding a row here without a matching column would
-- produce a rule that silently never fires.

-- ----------------------------------------------------------------- deletion --
-- An achievement somebody has already earned must not vanish: the unlock row
-- would survive with nothing to render, and a member would lose a badge they
-- were shown. Retire it instead (`active = false`), which keeps past unlocks
-- displayable and stops new ones.
create or replace function guard_achievement_delete() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  select count(*) into n from achievement_unlocks u where u.achievement_key = old.key;
  if n > 0 then
    raise exception
      'Cannot delete "%": % member(s) have already earned it. Retire it instead so their badge still shows.',
      old.key, n
      using errcode = 'restrict_violation';
  end if;
  return old;
end;
$$;

drop trigger if exists trg_guard_achievement_delete on achievements;
create trigger trg_guard_achievement_delete before delete on achievements
  for each row execute function guard_achievement_delete();

-- ============================================================================
-- 3. SEED — the 33 that 0028 hardcoded
-- ============================================================================
-- Copy, tier, category and icon transcribed from
-- `g-fitness-member/src/data/achievements.ts`; metric and threshold from the
-- `if` ladder in `sync_my_achievements()`. Nothing new is invented here — this
-- is the same catalogue, relocated.
--
-- `do update` on conflict so re-running repairs drift, but **only for builtin
-- rows**: an admin's edits to their own achievements must survive a re-run.

insert into achievements
  (key, audience, title, description, requirement, icon, tier, category, rule_kind, metric, threshold, builtin, sort_order)
values
  ('first_checkin','member','First Step','You checked in at the gym for the first time.','Check in at the front desk once.','Footprints','bronze','Getting started','metric','verified_days',1,true,1),
  ('days_10','member','Getting Into It','10 training days behind you.','Train on 10 separate days.','Dumbbell','bronze','Milestones','metric','training_days',10,true,2),
  ('days_25','member','Regular','25 training days. This is a habit now.','Train on 25 separate days.','CalendarCheck','silver','Milestones','metric','training_days',25,true,3),
  ('days_50','member','Half Century','50 training days logged.','Train on 50 separate days.','Medal','gold','Milestones','metric','training_days',50,true,4),
  ('days_100','member','Centurion','100 training days. Very few people get here.','Train on 100 separate days.','Trophy','platinum','Milestones','metric','training_days',100,true,5),
  ('streak_4','member','Month of Momentum','Four weeks in a row, twice a week or better.','Train at least twice a week, 4 weeks running.','Flame','silver','Consistency','metric','best_week_streak',4,true,6),
  ('streak_12','member','Quarter Strong','Twelve straight weeks of showing up.','Train at least twice a week, 12 weeks running.','Zap','platinum','Consistency','metric','best_week_streak',12,true,7),
  ('early_bird','member','Early Bird','Five sessions done before 7am.','Check in before 7:00am on 5 occasions.','Sunrise','silver','Habits','metric','early_checkins',5,true,8),
  ('night_owl','member','Night Owl','Five late sessions, after 8pm.','Check in at 8:00pm or later on 5 occasions.','Moon','silver','Habits','metric','late_checkins',5,true,9),
  ('weekend_warrior','member','Weekend Warrior','Eight weekend training days.','Train on 8 Saturdays or Sundays.','CalendarHeart','silver','Habits','metric','weekend_days',8,true,10),
  ('all_rounder','member','All-Rounder','You have trained three different ways.','Record 3 different activities.','Shapes','bronze','Habits','metric','distinct_activities',3,true,11),
  ('goal_first','member','Goal Getter','You set a goal and reached it.','Reach one of your fitness goals.','Target','bronze','Progress','metric','goals_achieved',1,true,12),
  ('goal_three','member','Triple Threat','Three goals set and reached.','Reach 3 fitness goals.','Star','gold','Progress','metric','goals_achieved',3,true,13),
  ('measure_first','member','Baseline','You recorded your first measurement.','Log a body measurement.','Ruler','bronze','Progress','metric','measurements',1,true,14),
  ('measure_ten','member','Tracked','Ten measurements — enough to see a real trend.','Log 10 body measurements.','ClipboardList','silver','Progress','metric','measurements',10,true,15),
  ('class_first','member','Joined In','You attended your first group class.','Attend a group class.','Users','bronze','Training','metric','classes_attended',1,true,16),
  ('class_ten','member','Class Regular','Ten group classes attended.','Attend 10 group classes.','HeartHandshake','gold','Training','metric','classes_attended',10,true,17),
  ('pt_first','member','Coached','You completed a session with a personal trainer.','Complete a personal training session.','GraduationCap','silver','Training','metric','pt_sessions_done',1,true,18),
  ('loyal_six_months','member','Half a Year','Six months a member of Core Fitness.','Stay a member for 6 months.','Repeat','silver','Loyalty','metric','days_as_member',180,true,19),
  ('loyal_one_year','member','One of the Family','A full year with us.','Stay a member for 1 year.','Gem','platinum','Loyalty','metric','days_as_member',365,true,20),
  ('level_intermediate','member','Intermediate','You trained your way up to Intermediate.','20 training days and 6 consistent weeks.','Award','gold','Level','builtin',null,null,true,21),
  ('level_advanced','member','Advanced','You reached Advanced. That is a year of real work.','60 training days and 16 consistent weeks.','Sparkles','platinum','Level','builtin',null,null,true,22),
  ('coach_open_for_business','trainer','Open for Business','You published your bookable hours.','Add at least one availability window.','CalendarCheck','bronze','Setup','metric','availability_windows',1,true,1),
  ('coach_full_profile','trainer','Full Profile','Specialisation, bio and photo — members know who they are booking.','Fill in your specialisation, bio and photo.','UserCheck','bronze','Setup','metric','profile_complete',1,true,2),
  ('coach_first_session','trainer','First Client','You delivered your first personal training session.','Deliver 1 personal training session.','GraduationCap','bronze','Coaching','metric','sessions_delivered',1,true,3),
  ('coach_sessions_25','trainer','Twenty-Five Down','25 personal training sessions delivered.','Deliver 25 personal training sessions.','Dumbbell','silver','Coaching','metric','sessions_delivered',25,true,4),
  ('coach_sessions_100','trainer','Centurion Coach','100 sessions delivered. A real practice.','Deliver 100 personal training sessions.','Trophy','platinum','Coaching','metric','sessions_delivered',100,true,5),
  ('coach_members_10','trainer','Ten Trained','Ten different members have trained with you.','Train 10 different members.','Users','silver','Reach','metric','distinct_members',10,true,6),
  ('coach_members_25','trainer','Well Known','Twenty-five different members have trained with you.','Train 25 different members.','HeartHandshake','gold','Reach','metric','distinct_members',25,true,7),
  ('coach_first_class','trainer','Class Act','You led your first group class with members in it.','Lead 1 attended group class.','CalendarHeart','bronze','Classes','metric','classes_led',1,true,8),
  ('coach_classes_50','trainer','Fifty Classes','Fifty attended group classes led.','Lead 50 attended group classes.','Medal','gold','Classes','metric','classes_led',50,true,9),
  ('coach_notes_10','trainer','In Their Corner','Ten recommendations sent to the members you coach.','Send 10 recommendations to members.','Target','silver','Coaching','metric','notes_sent',10,true,10),
  ('coach_one_year','trainer','A Year In','One year on the Core Fitness team.','Be a trainer here for 1 year.','Gem','gold','Loyalty','metric','days_active',365,true,11)
on conflict (key) do update set
  audience    = excluded.audience,
  title       = excluded.title,
  description = excluded.description,
  requirement = excluded.requirement,
  icon        = excluded.icon,
  tier        = excluded.tier,
  category    = excluded.category,
  rule_kind   = excluded.rule_kind,
  metric      = excluded.metric,
  threshold   = excluded.threshold,
  sort_order  = excluded.sort_order
where achievements.builtin;   -- never clobber an admin's own achievement

-- ============================================================================
-- 4. THE EVALUATOR, NOW DATA-DRIVEN
-- ============================================================================
-- Same contract as 0028: SECURITY DEFINER, grades **only the caller**, no uid
-- parameter, returns just the newly inserted keys so the celebration fires once.
-- The 33-branch `if` ladder is replaced by one loop over the catalogue.
--
-- The trick that makes it generic: `to_jsonb(stats_record) ->> metric_name`
-- reads a column chosen at runtime. Everything is then coerced to numeric, so a
-- boolean metric (`profile_complete`) compares against a threshold of 1 without
-- needing its own branch.

-- Reads one stat out of the record-as-jsonb and normalises it to a number.
-- Booleans become 1/0 so `profile_complete >= 1` works without a special case;
-- an unknown, null or non-numeric metric becomes 0, so a misconfigured rule
-- simply never fires instead of aborting everyone's sync.
--
-- Pattern-matched rather than wrapped in an EXCEPTION block on purpose: a
-- plpgsql exception handler opens a subtransaction on every call, and this is
-- called once per rule per sync. Declared here, above its only caller.
create or replace function jsonb_metric_value(stats jsonb, metric_name text)
returns numeric
language sql immutable set search_path = public as $$
  select case
    when metric_name is null then 0
    when stats ->> metric_name is null then 0
    when stats ->> metric_name = 'true' then 1
    when stats ->> metric_name = 'false' then 0
    when stats ->> metric_name ~ '^-?[0-9]+(\.[0-9]+)?$'
      then (stats ->> metric_name)::numeric
    else 0
  end;
$$;

create or replace function sync_my_achievements()
returns setof text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid        uuid := auth.uid();
  role_name  text;
  earned     text[] := '{}';
  s          record;
  t          record;
  stats      jsonb;
  a          record;
  lvl_days   int;
  lvl_weeks  int;
begin
  if uid is null then
    return;
  end if;

  select p.role::text into role_name from profiles p where p.id = uid;

  if role_name = 'member' then
    select * into s from member_training_stats(uid);
    -- `member_since` is a date and cannot meet a numeric threshold. Replace it
    -- with the derived stat the loyalty badges actually want.
    -- `row_to_json(record)::jsonb` rather than `to_jsonb(s)`: to_jsonb takes
    -- `anyelement`, and resolving that against a plpgsql RECORD variable is
    -- fragile. row_to_json is declared to take `record` outright.
    stats := row_to_json(s)::jsonb - 'member_since' || jsonb_build_object(
      'days_as_member',
      case when s.member_since is null then 0 else (current_date - s.member_since) end);

    -- The two rules a metric+threshold cannot express. Kept as code so they
    -- read from `level_thresholds()` — the same source `member_progression()`
    -- uses for the level shown on Home. Duplicating those numbers into the
    -- table would let the badge and the level disagree.
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
    stats := row_to_json(t)::jsonb;
  else
    -- Admin and staff have no achievement set. Front-desk work is measured by
    -- the transactions it records, not by badges.
    return;
  end if;

  -- One pass over every active metric rule for this audience. A retired
  -- achievement is skipped, so retiring one stops new unlocks without
  -- disturbing anybody who already has it.
  for a in
    select ac.key, ac.metric, ac.threshold, ac.metric2, ac.threshold2
      from achievements ac
     where ac.audience = role_name
       and ac.active
       and ac.rule_kind = 'metric'
  loop
    if jsonb_metric_value(stats, a.metric) >= a.threshold
       and (a.metric2 is null
            or jsonb_metric_value(stats, a.metric2) >= a.threshold2) then
      earned := earned || a.key;
    end if;
  end loop;

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
-- 5. MANUAL AWARDS
-- ============================================================================
-- The one new write path, and it is admin-only and server-side. `achievement_
-- unlocks` still has no INSERT policy, so this function is the only way a row
-- can appear other than the member earning it.

create or replace function award_achievement(p_user uuid, p_key text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  a record;
  target_role text;
begin
  if get_my_role() <> 'admin' then
    raise exception 'Only an admin can award an achievement' using errcode = 'insufficient_privilege';
  end if;

  select * into a from achievements where key = p_key;
  if not found then
    raise exception 'No such achievement: %', p_key;
  end if;

  select role::text into target_role from profiles where id = p_user;
  if target_role is null then
    raise exception 'No such account';
  end if;
  -- A coaching badge on a member's profile would render under the wrong
  -- catalogue and read as a bug.
  if target_role <> a.audience then
    raise exception 'That achievement belongs to the % catalogue, but this account is a %',
      a.audience, target_role;
  end if;

  insert into achievement_unlocks (user_id, achievement_key)
  values (p_user, p_key)
  on conflict (user_id, achievement_key) do nothing;
end;
$$;

-- Taking one back. Only meaningful for a manual award — a metric-based one the
-- member still qualifies for is simply re-granted on their next sync, which the
-- admin UI says out loud rather than pretending otherwise.
create or replace function revoke_achievement(p_user uuid, p_key text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if get_my_role() <> 'admin' then
    raise exception 'Only an admin can revoke an achievement' using errcode = 'insufficient_privilege';
  end if;
  delete from achievement_unlocks where user_id = p_user and achievement_key = p_key;
end;
$$;

-- ============================================================================
-- 6. AUDIT
-- ============================================================================
-- Awarding and revoking by hand is exactly what an owner would want to review.
-- Guarded so 0038 still applies cleanly on a database where 0037 has not run.

do $$
begin
  if to_regclass('public.activity_log') is not null then
    execute $fn$
      create or replace function log_achievement_activity() returns trigger
      language plpgsql security definer set search_path = public as $body$
      declare
        v_title text;
        v_who   text;
      begin
        if tg_op = 'INSERT' then
          select title into v_title from achievements where key = new.achievement_key;
          v_who := coalesce(activity_member_name(new.user_id), 'someone');
          -- Only a hand-award has an actor; the nightly self-sync runs as the
          -- member themselves, and logging those would bury the log in badges.
          if auth.uid() is not null and auth.uid() <> new.user_id then
            perform log_activity('achievement.awarded', 'achievement', null, new.user_id,
              'Awarded "' || coalesce(v_title, new.achievement_key) || '" to ' || v_who,
              jsonb_build_object('achievement_key', new.achievement_key));
          end if;
          return new;
        end if;

        select title into v_title from achievements where key = old.achievement_key;
        perform log_activity('achievement.revoked', 'achievement', null, old.user_id,
          'Removed "' || coalesce(v_title, old.achievement_key) || '" from '
            || coalesce(activity_member_name(old.user_id), 'someone'),
          jsonb_build_object('achievement_key', old.achievement_key));
        return old;
      end;
      $body$;
    $fn$;

    execute 'drop trigger if exists trg_log_achievement on achievement_unlocks';
    execute 'create trigger trg_log_achievement after insert or delete on achievement_unlocks
             for each row execute function log_achievement_activity()';
  end if;
end $$;


commit;

-- ============================================================================
-- VERIFICATION — read this grid. Every row should say OK.
-- ============================================================================
select
  'notifications delete policy (0034)' as check,
  case when exists (select 1 from pg_policies
                    where tablename = 'notifications' and policyname = 'notifications_delete_frontdesk')
       then 'OK' else 'MISSING' end as result
union all select
  'attendance delete policy (0035)',
  case when exists (select 1 from pg_policies
                    where tablename = 'attendance' and policyname = 'attendance_delete_frontdesk')
       then 'OK' else 'MISSING' end
union all select
  'member_profiles.interests column (0036)',
  case when exists (select 1 from information_schema.columns
                    where table_name = 'member_profiles' and column_name = 'interests')
       then 'OK' else 'MISSING' end
union all select
  'members without a member_profiles row (0036 backfill)',
  case when (select count(*) from profiles p
             where p.role = 'member'
               and not exists (select 1 from member_profiles m where m.profile_id = p.id)) = 0
       then 'OK — every member has one' else 'STILL MISSING SOME' end
union all select
  'activity_log table (0037)',
  case when to_regclass('public.activity_log') is not null then 'OK' else 'MISSING' end
union all select
  'activity_log entries reconstructed by the backfill',
  coalesce((select count(*)::text from activity_log where reconstructed), '0')
union all select
  'achievements table (0038)',
  case when to_regclass('public.achievements') is not null then 'OK' else 'MISSING' end
union all select
  'achievements seeded (expect 33)',
  coalesce((select count(*)::text from achievements), '0')
union all select
  'achievement badges already earned (must NOT drop to 0)',
  coalesce((select count(*)::text from achievement_unlocks), '0')
union all select
  'earned badges whose achievement is missing from the catalogue',
  coalesce((select count(*)::text from achievement_unlocks u
            where not exists (select 1 from achievements a where a.key = u.achievement_key)), '0')
order by 1;
