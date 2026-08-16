-- Core Fitness — the booking model: recurring classes, one-off classes, and
-- 1-on-1 personal training.
--
-- This is the piece the whole booking UI was blocked on. The old admin/member
-- screens assumed *recurring weekly trainer availability*, while the `classes`
-- table holds *discrete dated instances*. Neither alone is right, so both exist:
--
--   class_templates  "Yoga, every Tuesday 06:00, Coach Lea"  — the timetable
--   classes          a specific dated session members book   — already existed
--
-- A template does not replace instances; it *generates* them (see
-- generate_class_instances below). One-off specials are simply instances with a
-- null template_id, so both modes live in one table and one booking flow.
--
-- Personal training is separate from classes on purpose: a class has a roster
-- and a capacity, a PT session has exactly one member. Forcing PT through
-- `classes` would mean capacity-1 classes and a bookings row per session, which
-- makes every "how many people are in this class" query lie.

-- ============================================================================
-- 1. TRAINER AVAILABILITY — real times, not day names
-- ============================================================================
-- `trainer_profiles.availability` is a comma-joined string of weekday names
-- ("Monday, Friday"). That's enough to display, but PT slots need start and end
-- times to generate from. The old column is intentionally left in place for now
-- so the admin Trainers card and trainer Schedule screen keep working; it
-- becomes display-only once those read from this table.

create table if not exists trainer_availability (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references trainer_profiles(profile_id) on delete cascade,
  -- 0 = Sunday … 6 = Saturday, matching Postgres extract(dow) and JS getDay().
  day_of_week int not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  -- How long one bookable PT slot is. 60 fits most gyms; per-row so a trainer
  -- can run 30-minute assessments on some days.
  slot_minutes int not null default 60 check (slot_minutes > 0),
  created_at timestamptz not null default now(),
  constraint trainer_availability_range check (end_time > start_time)
);

create index if not exists idx_trainer_availability_trainer
  on trainer_availability(trainer_id, day_of_week);

-- ============================================================================
-- 2. CLASS TEMPLATES — the recurring weekly timetable
-- ============================================================================

create table if not exists class_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  trainer_id uuid references trainer_profiles(profile_id) on delete set null,
  level class_level not null default 'all_levels',
  capacity int not null default 20 check (capacity > 0),
  location text,
  day_of_week int not null check (day_of_week between 0 and 6),
  start_time time not null,
  duration_minutes int not null default 60 check (duration_minutes > 0),
  -- Retiring a template must not delete the sessions already run from it, so
  -- this is a flag rather than a delete.
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Link instances back to the template that produced them. Null = one-off special.
alter table classes add column if not exists template_id uuid references class_templates(id) on delete set null;

-- Makes generation idempotent: running it twice can't duplicate a session.
-- Postgres treats NULLs as distinct in unique indexes, so one-off classes
-- (template_id is null) are unaffected by this constraint.
create unique index if not exists idx_classes_template_slot
  on classes(template_id, scheduled_at)
  where template_id is not null;

-- ============================================================================
-- 3. PERSONAL TRAINING SESSIONS
-- ============================================================================

create table if not exists pt_sessions (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references trainer_profiles(profile_id) on delete cascade,
  member_id uuid not null references member_profiles(profile_id) on delete cascade,
  starts_at timestamptz not null,
  duration_minutes int not null default 60 check (duration_minutes > 0),
  status booking_status not null default 'pending',
  notes text,
  requested_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- A trainer cannot be in two places at once. Partial index so a cancelled or
-- rejected session frees the slot for someone else.
create unique index if not exists idx_pt_sessions_trainer_slot
  on pt_sessions(trainer_id, starts_at)
  where status in ('pending', 'approved');

create index if not exists idx_pt_sessions_member on pt_sessions(member_id);
create index if not exists idx_pt_sessions_starts_at on pt_sessions(starts_at);

-- ============================================================================
-- 4. INSTANCE GENERATION
-- ============================================================================
-- Materialises dated `classes` rows from active templates for the next N weeks.
-- Called on demand from the admin Schedule page rather than by a cron job — the
-- free tier has no scheduled worker, and generating on read means the timetable
-- is always populated far enough ahead without extra infrastructure.
--
-- Safe to call repeatedly: the unique index above absorbs duplicates.

create or replace function generate_class_instances(weeks_ahead int default 4)
returns int
language plpgsql security definer set search_path = public as $$
declare
  inserted_count int := 0;
begin
  if weeks_ahead < 1 or weeks_ahead > 26 then
    raise exception 'weeks_ahead must be between 1 and 26';
  end if;

  with slots as (
    select
      t.id  as template_id,
      t.name,
      t.trainer_id,
      t.level,
      t.capacity,
      t.location,
      t.duration_minutes,
      -- Walk forward from today to the horizon, keeping days matching the
      -- template's weekday, then pin the template's start time onto each.
      (d::date + t.start_time) at time zone 'Asia/Manila' as scheduled_at
    from class_templates t
    cross join generate_series(
      current_date,
      current_date + (weeks_ahead * 7),
      interval '1 day'
    ) as d
    where t.active
      and extract(dow from d) = t.day_of_week
  )
  insert into classes (name, trainer_id, level, capacity, location, scheduled_at, duration_minutes, template_id, class_type)
  select name, trainer_id, level, capacity, location, scheduled_at, duration_minutes, template_id, 'group'
  from slots
  where scheduled_at > now()
  on conflict (template_id, scheduled_at) where template_id is not null do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

-- ============================================================================
-- 5. RLS
-- ============================================================================

alter table trainer_availability enable row level security;
alter table class_templates enable row level security;
alter table pt_sessions enable row level security;

-- --- trainer_availability ---
-- Members need to see it to pick a slot.
drop policy if exists trainer_availability_select_authenticated on trainer_availability;
create policy trainer_availability_select_authenticated on trainer_availability for select
  using (auth.uid() is not null);
-- A trainer manages their own hours; the desk can fix them up.
drop policy if exists trainer_availability_write_self on trainer_availability;
create policy trainer_availability_write_self on trainer_availability for all
  using (trainer_id = auth.uid() or is_front_desk())
  with check (trainer_id = auth.uid() or is_front_desk());

-- --- class_templates ---
drop policy if exists class_templates_select_authenticated on class_templates;
create policy class_templates_select_authenticated on class_templates for select
  using (auth.uid() is not null);
-- The timetable is the gym's operating plan — front desk can run it.
drop policy if exists class_templates_write_frontdesk on class_templates;
create policy class_templates_write_frontdesk on class_templates for all
  using (is_front_desk()) with check (is_front_desk());

-- --- pt_sessions ---
drop policy if exists pt_sessions_select_self on pt_sessions;
create policy pt_sessions_select_self on pt_sessions for select
  using (member_id = auth.uid());
drop policy if exists pt_sessions_select_trainer on pt_sessions;
create policy pt_sessions_select_trainer on pt_sessions for select
  using (trainer_id = auth.uid());
drop policy if exists pt_sessions_select_frontdesk on pt_sessions;
create policy pt_sessions_select_frontdesk on pt_sessions for select
  using (is_front_desk());

-- A member requests their own session, and only their own.
drop policy if exists pt_sessions_insert_self on pt_sessions;
create policy pt_sessions_insert_self on pt_sessions for insert
  with check (member_id = auth.uid());
drop policy if exists pt_sessions_insert_frontdesk on pt_sessions;
create policy pt_sessions_insert_frontdesk on pt_sessions for insert
  with check (is_front_desk());

-- Approval stays with the front desk, matching the decision that trainers see
-- requests but don't confirm them.
drop policy if exists pt_sessions_update_frontdesk on pt_sessions;
create policy pt_sessions_update_frontdesk on pt_sessions for update
  using (is_front_desk()) with check (is_front_desk());
-- A member may withdraw their own request.
drop policy if exists pt_sessions_delete_self on pt_sessions;
create policy pt_sessions_delete_self on pt_sessions for delete
  using ((member_id = auth.uid() and status = 'pending') or is_front_desk());

-- Verify:
--   select generate_class_instances(4);   -- returns rows created
--   select count(*) from classes where template_id is not null;
