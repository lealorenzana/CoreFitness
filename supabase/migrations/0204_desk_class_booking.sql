-- ============================================================================
-- 0204 — The desk books a member into a class (2026-10-20, Schedule/Bookings redesign)
-- ============================================================================
--
-- The desk could book a 1-on-1 for a member (pt_sessions_insert_frontdesk) but
-- never a class: `bookings` has one insert policy, bookings_insert_self. A
-- member at the counter asking "put me in Thursday's yoga" had to do it on
-- their own phone. Now `desk_book_class()` does it, confirmed at once (the desk
-- deciding is the decision), and the member is told.
--
-- Everything that already guards a booking still runs, because this inserts a
-- real row: the member's plan and weekly quota (0017), clashes with their other
-- bookings (0068), the trainer's alert. Two things are the function's own: the
-- class must have a free seat (the desk must not overbook silently), and it
-- must not have started.
--
-- And CLAUDE.md's rule, made true: `waiver_required` gates booking only — never
-- a desk booking. waiver_blocks() now steps aside when the caller is the gym's
-- owner or front desk.
-- ============================================================================

create or replace function waiver_blocks(p_member uuid, p_gym uuid)
returns text
language plpgsql stable security definer set search_path = public as $$
declare v_w record;
begin
  -- The desk booking for a member is never held to the member's own paperwork.
  if auth.uid() is not null and role_in_gym(p_gym) in ('admin', 'staff') then
    return null;
  end if;
  if not coalesce((select waiver_required from gym_settings where gym_id = p_gym), false) then
    return null;
  end if;
  select id, version into v_w from gym_waivers
   where gym_id = p_gym and published_at is not null
   order by version desc limit 1;
  if v_w.id is null then return null; end if;
  if exists (select 1 from waiver_acceptances
              where waiver_id = v_w.id and member_id = p_member) then
    return null;
  end if;
  return 'Please read and sign the gym''s waiver before booking. It is in the app '
      || 'under Membership, and takes a minute.';
end;
$$;

create or replace function desk_book_class(p_member uuid, p_class uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_gym  uuid := current_gym_id();
  v_role text := role_in_gym(v_gym);
  v_cls  classes;
  v_taken int;
  v_id   uuid;
begin
  if auth.uid() is null or v_role not in ('admin', 'staff') then
    raise exception 'Only the gym can book a class for a member.' using errcode = '42501';
  end if;
  if not staff_may('bookings') then
    raise exception 'Your account does not include bookings.' using errcode = '42501';
  end if;
  if not gym_writable(v_gym) then
    raise exception 'This gym is read-only right now.';
  end if;
  select * into v_cls from classes where id = p_class and gym_id = v_gym;
  if v_cls.id is null then
    raise exception 'That class is not on this gym''s schedule.';
  end if;
  if v_cls.scheduled_at is null or v_cls.scheduled_at <= now() then
    raise exception 'That class has already started.';
  end if;
  if not exists (select 1 from gym_roles where gym_id = v_gym and user_id = p_member
                  and role = 'member' and status = 'active') then
    raise exception 'That person is not an active member here.';
  end if;
  if exists (select 1 from bookings where class_id = p_class and member_id = p_member
              and status in ('pending', 'approved')) then
    raise exception '% is already booked into this class.', display_name_of(p_member);
  end if;
  select count(*) into v_taken from bookings where class_id = p_class and status = 'approved';
  if v_cls.capacity is not null and v_taken >= v_cls.capacity then
    raise exception '% is full (% of %).', v_cls.name, v_taken, v_cls.capacity;
  end if;

  perform act_as_gym(v_gym);
  insert into bookings (gym_id, member_id, class_id, status, decided_by, decided_by_role, decided_at, approved_at, approved_by)
  values (v_gym, p_member, p_class, 'approved', auth.uid(), v_role, now(), now(), auth.uid())
  returning id into v_id;

  perform notify_once(p_member, 'booking', 'Booked by the gym',
    'You are booked into ' || v_cls.name || ' on '
      || to_char(v_cls.scheduled_at at time zone 'Asia/Manila', 'Dy Mon DD, FMHH12:MI AM') || '. See you there.',
    '/member/bookings', 'deskbook:' || v_id, v_gym);
  perform act_as_gym(null);
  return v_id;
end;
$$;
revoke all on function desk_book_class(uuid, uuid) from public, anon;
grant execute on function desk_book_class(uuid, uuid) to authenticated;

create or replace function migration_0204_applied() returns boolean
language sql immutable as $marker$ select true $marker$;
revoke all on function migration_0204_applied() from public, anon;
grant execute on function migration_0204_applied() to authenticated;
comment on function migration_0204_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0204.sql
