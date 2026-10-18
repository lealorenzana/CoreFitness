-- ============================================================================
-- 0201 — The walk-in history
-- ============================================================================
--
-- The owner (2026-10-18): Walk-ins showed today's list and counts, never the
-- past. guest_visits_between() lists every walk-in between two Manila dates
-- for the desk's Past walk-ins window: the guest's name and phone, what they
-- paid for, how much, cash or online, who recorded it, and voids.
--
-- (A guest's name stays required — 0185's rule, the owner's call.)
-- ============================================================================

-- The walk-in history (Attendance → Walk-ins → Past walk-ins): every visit
-- between two Manila dates, newest first, with who recorded it. The desk only.
create or replace function guest_visits_between(p_from date, p_to date)
returns table (id uuid, guest_id uuid, name text, phone text, visit_day date, visited_at timestamptz, kind text,
               amount numeric, method text, voided boolean, recorded_by_name text)
language sql stable security definer set search_path = public as $$
  select v.id, g.id, g.name, g.phone, v.visit_day, v.visited_at, v.kind, v.amount, v.method, v.voided_at is not null,
         nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '')
    from guest_visits v
    join guests g on g.id = v.guest_id
    left join profiles p on p.id = v.recorded_by
   where is_front_desk() and v.gym_id = current_gym_id()
     and v.visit_day between p_from and p_to
     and p_to - p_from <= 366
   order by v.visited_at desc
   limit 2000;
$$;
revoke all on function guest_visits_between(date, date) from public, anon;
grant execute on function guest_visits_between(date, date) to authenticated;

create or replace function migration_0201_applied() returns boolean
language sql immutable as $marker$ select true $marker$;
revoke all on function migration_0201_applied() from public, anon;
grant execute on function migration_0201_applied() to authenticated;
comment on function migration_0201_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0201.sql
