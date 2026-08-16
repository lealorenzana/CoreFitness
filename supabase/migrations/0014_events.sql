-- Core Fitness — gym events, replacing localStorage['admin_events'].
--
-- The Events page kept everything in one browser's localStorage, invented its
-- `registered` counts, and generated the attendee list from a hardcoded array of
-- twenty names. Two tables fix that: the event itself, and who signed up.
--
-- Design note — status is DERIVED, not stored. The old page persisted
-- 'Upcoming' | 'Ongoing' | 'Completed' | 'Cancelled' as a column, which drifts
-- the moment time passes: an event stays "Upcoming" forever unless something
-- rewrites it. Only cancellation is a real decision a human makes, so only that
-- is stored; the rest is computed from starts_at at read time.

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  starts_at timestamptz not null,
  duration_minutes int not null default 60,
  location text,
  capacity int not null default 30,
  cancelled boolean not null default false,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists event_registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  member_id uuid not null references member_profiles(profile_id) on delete cascade,
  registered_at timestamptz not null default now(),
  -- One signup per member per event. Without this a double-tap silently
  -- inflates the headcount the gym caters for.
  unique (event_id, member_id)
);

create index if not exists idx_event_registrations_event on event_registrations(event_id);
create index if not exists idx_events_starts_at on events(starts_at);

alter table events enable row level security;
alter table event_registrations enable row level security;

-- ============ EVENTS ============
-- Everyone signed in can see what's on — the member app lists these.
drop policy if exists events_select_authenticated on events;
create policy events_select_authenticated on events for select
  using (auth.uid() is not null);

-- Front desk can run events. Organising one is operational work, not a change to
-- pricing or access, so staff are included (see 0012's is_front_desk()).
drop policy if exists events_write_frontdesk on events;
create policy events_write_frontdesk on events for all
  using (is_front_desk()) with check (is_front_desk());

-- ============ EVENT REGISTRATIONS ============
drop policy if exists event_registrations_select_self on event_registrations;
create policy event_registrations_select_self on event_registrations for select
  using (member_id = auth.uid());
drop policy if exists event_registrations_select_staff on event_registrations;
create policy event_registrations_select_staff on event_registrations for select
  using (is_front_desk() or get_my_role() = 'trainer');

-- A member signs themselves up, and can only sign *themselves* up.
drop policy if exists event_registrations_insert_self on event_registrations;
create policy event_registrations_insert_self on event_registrations for insert
  with check (member_id = auth.uid());
drop policy if exists event_registrations_insert_staff on event_registrations;
create policy event_registrations_insert_staff on event_registrations for insert
  with check (is_front_desk());

-- Members can withdraw; the desk can remove a no-show.
drop policy if exists event_registrations_delete_self on event_registrations;
create policy event_registrations_delete_self on event_registrations for delete
  using (member_id = auth.uid() or is_front_desk());
