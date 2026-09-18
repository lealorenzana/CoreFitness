-- 0090 — a member can save a free workout for later, and tick it off.
--
-- The library (0019) is 37 links long and grows. A member who finds "Yoga With
-- Adriene" on Tuesday had no way to find it again on Saturday except to scroll,
-- and no way to say "I did that one". Per-member state never lives in
-- localStorage here (CLAUDE.md), so it is a table: one row per member per
-- resource, `done_at` set when they mark it done.
--
-- Never gated — the library exists for members who cannot pay, and so does
-- saving from it.

create table if not exists saved_resources (
  member_id   uuid not null references member_profiles(profile_id) on delete cascade,
  resource_id uuid not null references workout_resources(id) on delete cascade,
  saved_at    timestamptz not null default now(),
  done_at     timestamptz,
  primary key (member_id, resource_id)
);

alter table saved_resources enable row level security;

drop policy if exists saved_resources_own on saved_resources;
create policy saved_resources_own on saved_resources
  for all using (member_id = auth.uid()) with check (member_id = auth.uid());

grant select, insert, update, delete on saved_resources to authenticated;

-- Marker for scripts/probe-migrations.py.
create or replace function migration_0090_applied() returns boolean
language sql immutable as $fn$ select true $fn$;
revoke all on function migration_0090_applied() from public, anon;
grant execute on function migration_0090_applied() to authenticated;

-- VERIFICATION — as a member:
--   insert into saved_resources (member_id, resource_id) values (auth.uid(), '<id>');   -- ok
--   update saved_resources set done_at = now() where resource_id = '<id>';                -- 1 row
--   insert into saved_resources (member_id, resource_id) values ('<someone else>', '<id>'); -- refused
