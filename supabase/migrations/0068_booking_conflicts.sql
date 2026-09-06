-- 0068 — nobody can be in two places at once.
--
-- The booking model (0015) kept classes and personal training in separate
-- tables for good reasons: a class has a roster and a capacity, a PT session has
-- exactly one member. What neither table knew was that the *same member* might
-- be in both at the same hour.
--
-- Three holes, all reachable today:
--
--   1. **Member books a class and a PT session at the same time.** Nothing
--      looked across the two tables. 0017's guards count quota — "how many this
--      week", "how many this month" — and a quota has no opinion about clashes.
--   2. **Member books two classes at the same time.** Same reason. One seat is
--      taken from a class they cannot attend, and the class looks fuller than it
--      is.
--   3. **A trainer teaching a class at 10:00 is booked for PT at 10:00.**
--      `idx_pt_sessions_trainer_slot` is `unique(trainer_id, starts_at)`, which
--      catches an exact restatement of the same minute and nothing else. A
--      60-minute session at 10:00 and another at 10:30 pass it cleanly, and it
--      has never known that `classes` exists.
--
-- ## Overlap, not equality
--
-- A 10:00 class of 60 minutes conflicts with a 10:30 PT session. Comparing
-- `starts_at = starts_at` finds none of the collisions that actually happen at a
-- gym. These guards compare half-open intervals `[starts_at, starts_at + duration)`
-- with the `overlaps` operator, which treats the end instant as free — so a
-- class ending at 11:00 and a session starting at 11:00 are fine, which is what
-- anyone standing in the gym would expect.
--
-- ## Why in SQL and not in the booking form
--
-- Because the form is not the only writer. The member app inserts, the front
-- desk inserts through a different screen, and two members can race for the same
-- slot between a check and an insert. A guard in one form is not a rule.
--
-- ## What this deliberately does NOT do
--
-- It does not let anyone override. 0057's freeze limit has an admin override
-- because "twice a month" is a policy, and policies have exceptions. Being in
-- two rooms at 10am is not a policy — it is a contradiction. The desk's fix is
-- to cancel the other commitment, and the error message names it so they can.
--
-- Re-runnable.

-- ============================================================================
-- 1. WHAT A MEMBER IS ALREADY COMMITTED TO
-- ============================================================================
-- Both tables, one shape, as intervals. Used by the guard below and by the
-- member app, so the slot picker can grey out a time before it is tapped rather
-- than only explaining the refusal afterwards.
--
-- SECURITY DEFINER, so it must decide for itself who may ask. RLS would
-- otherwise be bypassed and any member could enumerate another's schedule.
create or replace function member_commitments(p_member uuid)
returns table (
  source     text,
  ref_id     uuid,
  starts_at  timestamptz,
  ends_at    timestamptz,
  label      text
)
language plpgsql stable security definer set search_path = public as $fn$
begin
  -- `auth.uid() is not null and` first: outside a browser session `auth.uid()`
  -- is NULL, and a bare `is distinct from` would then be true and refuse the
  -- one caller entitled to run it. 0055 and 0062 both shipped that bug.
  if auth.uid() is not null
     and p_member is distinct from auth.uid()
     and not is_front_desk() then
    raise exception 'You can only read your own schedule.';
  end if;

  return query
    select 'class'::text, b.id, c.scheduled_at,
           c.scheduled_at + make_interval(mins => c.duration_minutes),
           c.name
      from bookings b
      join classes c on c.id = b.class_id
     where b.member_id = p_member
       and b.status in ('pending', 'approved')
    union all
    select 'pt'::text, s.id, s.starts_at,
           s.starts_at + make_interval(mins => s.duration_minutes),
           'Personal training'
      from pt_sessions s
     where s.member_id = p_member
       and s.status in ('pending', 'approved');
end;
$fn$;

revoke all on function member_commitments(uuid) from public, anon;
grant execute on function member_commitments(uuid) to authenticated;

comment on function member_commitments(uuid) is
  'Every class booking and PT session a member holds, as half-open intervals. '
  'Self or front desk only — SECURITY DEFINER bypasses RLS, so the guard is here.';

-- ============================================================================
-- 2. THE MEMBER GUARD
-- ============================================================================
-- One function, two triggers. The two tables carry the interval differently
-- (a booking's time lives on its class), so each trigger resolves its own
-- interval and hands the same three values over.
create or replace function assert_member_free(
  p_member    uuid,
  p_starts_at timestamptz,
  p_ends_at   timestamptz,
  p_skip_kind text,   -- 'class' | 'pt' — which table the new row is in
  p_skip_id   uuid    -- the row's own id on UPDATE, so it cannot clash with itself
) returns void
language plpgsql stable security definer set search_path = public as $fn$
declare
  clash record;
begin
  select * into clash
    from (
      select 'class'::text as source, b.id as ref_id, c.scheduled_at as starts_at,
             c.scheduled_at + make_interval(mins => c.duration_minutes) as ends_at,
             c.name as label
        from bookings b
        join classes c on c.id = b.class_id
       where b.member_id = p_member and b.status in ('pending', 'approved')
      union all
      select 'pt'::text, s.id, s.starts_at,
             s.starts_at + make_interval(mins => s.duration_minutes),
             'Personal training'
        from pt_sessions s
       where s.member_id = p_member and s.status in ('pending', 'approved')
    ) held
   where not (held.source = p_skip_kind and held.ref_id is not distinct from p_skip_id)
     and (held.starts_at, held.ends_at) overlaps (p_starts_at, p_ends_at)
   limit 1;

  if found then
    raise exception
      'This clashes with % on % at %. Cancel that first, then book this.',
      clash.label,
      to_char(clash.starts_at at time zone 'Asia/Manila', 'FMDay FMDD FMMonth'),
      to_char(clash.starts_at at time zone 'Asia/Manila', 'FMHH12:MI am');
  end if;
end;
$fn$;

revoke all on function assert_member_free(uuid, timestamptz, timestamptz, text, uuid)
  from public, anon, authenticated;

-- ── bookings ────────────────────────────────────────────────────────────────
create or replace function trg_booking_no_member_overlap() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare
  c record;
begin
  -- A row leaving the running states frees a slot; it can never create a clash.
  if new.status not in ('pending', 'approved') then
    return new;
  end if;

  select scheduled_at, duration_minutes into c from classes where id = new.class_id;
  if c.scheduled_at is null then
    -- A class with no time cannot overlap anything. 0001 allows a NULL
    -- `scheduled_at` for catalog rows, so this is reachable, not defensive.
    return new;
  end if;

  perform assert_member_free(
    new.member_id, c.scheduled_at,
    c.scheduled_at + make_interval(mins => c.duration_minutes),
    'class', new.id);
  return new;
end;
$fn$;

drop trigger if exists booking_no_member_overlap on bookings;
create trigger booking_no_member_overlap
  before insert or update of status, class_id, member_id on bookings
  for each row execute function trg_booking_no_member_overlap();

-- ── pt_sessions ─────────────────────────────────────────────────────────────
create or replace function trg_pt_no_member_overlap() returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  if new.status not in ('pending', 'approved') then
    return new;
  end if;

  perform assert_member_free(
    new.member_id, new.starts_at,
    new.starts_at + make_interval(mins => new.duration_minutes),
    'pt', new.id);
  return new;
end;
$fn$;

drop trigger if exists pt_no_member_overlap on pt_sessions;
create trigger pt_no_member_overlap
  before insert or update of status, starts_at, duration_minutes, member_id on pt_sessions
  for each row execute function trg_pt_no_member_overlap();

-- ============================================================================
-- 3. THE TRAINER GUARD
-- ============================================================================
-- Availability is **per trainer**, and that is the point the panel asked about:
-- Trainer A being fully booked at Tuesday 10:00 must say nothing at all about
-- Trainer B. Every query below is keyed on `trainer_id`, so it does not — the
-- slot is unavailable *for that trainer*, never for the hour.
--
-- What was actually missing is that a trainer's own two commitments could
-- overlap. `idx_pt_sessions_trainer_slot` compares one instant to another; it
-- cannot see a 60-minute session straddling the next half hour, and it has never
-- looked at `classes` at all.
create or replace function assert_trainer_free(
  p_trainer   uuid,
  p_starts_at timestamptz,
  p_ends_at   timestamptz,
  p_skip_kind text,
  p_skip_id   uuid
) returns void
language plpgsql stable security definer set search_path = public as $fn$
declare
  clash record;
begin
  if p_trainer is null then
    return;   -- an unassigned class books nobody's time
  end if;

  select * into clash
    from (
      select 'class'::text as source, c.id as ref_id, c.scheduled_at as starts_at,
             c.scheduled_at + make_interval(mins => c.duration_minutes) as ends_at,
             c.name as label
        from classes c
       where c.trainer_id = p_trainer and c.scheduled_at is not null
      union all
      select 'pt'::text, s.id, s.starts_at,
             s.starts_at + make_interval(mins => s.duration_minutes),
             'a personal training session'
        from pt_sessions s
       where s.trainer_id = p_trainer and s.status in ('pending', 'approved')
    ) held
   where not (held.source = p_skip_kind and held.ref_id is not distinct from p_skip_id)
     and (held.starts_at, held.ends_at) overlaps (p_starts_at, p_ends_at)
   limit 1;

  if found then
    raise exception
      'That trainer is already booked for % at %.',
      clash.label,
      to_char(clash.starts_at at time zone 'Asia/Manila', 'FMDay FMDD FMMonth, FMHH12:MI am');
  end if;
end;
$fn$;

revoke all on function assert_trainer_free(uuid, timestamptz, timestamptz, text, uuid)
  from public, anon, authenticated;

create or replace function trg_pt_no_trainer_overlap() returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  if new.status not in ('pending', 'approved') then
    return new;
  end if;
  perform assert_trainer_free(
    new.trainer_id, new.starts_at,
    new.starts_at + make_interval(mins => new.duration_minutes),
    'pt', new.id);
  return new;
end;
$fn$;

drop trigger if exists pt_no_trainer_overlap on pt_sessions;
create trigger pt_no_trainer_overlap
  before insert or update of status, starts_at, duration_minutes, trainer_id on pt_sessions
  for each row execute function trg_pt_no_trainer_overlap();

-- Classes are generated in bulk by `generate_class_instances()` from templates,
-- which is exactly where a clash would be introduced silently and en masse. But
-- that function is `on conflict do nothing` over a whole INSERT … SELECT, and a
-- raising trigger would abort the entire generation rather than skip one row —
-- turning a single bad template into a timetable that will not build at all.
--
-- So the class side reports rather than refuses: the admin Schedule page can ask
-- which of its own rows collide, and fix the template.
create or replace function trainer_schedule_conflicts()
returns table (
  trainer_id uuid,
  a_kind text, a_id uuid, a_label text, a_starts_at timestamptz,
  b_kind text, b_id uuid, b_label text, b_starts_at timestamptz
)
language sql stable security definer set search_path = public as $fn$
  with held as (
    select c.trainer_id, 'class'::text as kind, c.id, c.name as label,
           c.scheduled_at as starts_at,
           c.scheduled_at + make_interval(mins => c.duration_minutes) as ends_at
      from classes c
     where c.trainer_id is not null and c.scheduled_at is not null
       and c.scheduled_at > now() - interval '1 day'
    union all
    select s.trainer_id, 'pt', s.id, 'Personal training',
           s.starts_at, s.starts_at + make_interval(mins => s.duration_minutes)
      from pt_sessions s
     where s.status in ('pending', 'approved')
       and s.starts_at > now() - interval '1 day'
  )
  select a.trainer_id,
         a.kind, a.id, a.label, a.starts_at,
         b.kind, b.id, b.label, b.starts_at
    from held a
    join held b
      on b.trainer_id = a.trainer_id
     and (a.kind, a.id) < (b.kind, b.id)   -- each pair once, never a row with itself
     and (a.starts_at, a.ends_at) overlaps (b.starts_at, b.ends_at)
   order by a.starts_at;
$fn$;

revoke all on function trainer_schedule_conflicts() from public, anon;
grant execute on function trainer_schedule_conflicts() to authenticated;

comment on function trainer_schedule_conflicts() is
  'Overlapping commitments per trainer, for the admin Schedule page. A report '
  'rather than a guard, because class instances are generated in bulk and a '
  'raising trigger would abort the whole generation over one bad template.';

-- ============================================================================
-- VERIFICATION — run these as a real member, not as the owner.
-- ============================================================================
--   -- Same member, class then PT at the same hour: the second must raise.
--   insert into bookings (member_id, class_id) values ('<member>', '<10am class>');
--   insert into pt_sessions (member_id, trainer_id, starts_at)
--     values ('<member>', '<trainer>', '<same 10am, as UTC>');
--   -- expected: 'This clashes with <class> on <day> at 10:00 am.'
--
--   -- Trainer A full, Trainer B free, a DIFFERENT member: must succeed.
--   insert into pt_sessions (member_id, trainer_id, starts_at)
--     values ('<member 2>', '<trainer B>', '<same 10am>');
--
--   -- Ends where the next begins is not an overlap:
--   --   a 10:00 class of 60 minutes and a PT session at 11:00 both stand.
--
--   select * from trainer_schedule_conflicts();   -- expected: 0 rows on clean data
