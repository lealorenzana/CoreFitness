-- 0251: the database keeps two rules the screens already promised.
-- Found by the staging QA run (2026-11-13, C:\Users\USER\Documents\CoreFitness-Staging-Tests):
--
-- 1. CAP-APPROVE: a coach approved 50 requests on a 20-seat class and the database refused none.
--    Seats are pending + approved (0096's class_seats_left), but only desk_book_class (0204)
--    ever counted them. Now:
--      * approving (or reinstating) a class booking is refused once the approved bookings fill
--        the class — on every path, so no approval can overfill a class;
--      * a member's own request is refused once pending + approved fill it — the screen already
--        says "Full" and offers the waitlist (0096); this closes the gap for two phones at once.
--    One advisory lock per class serialises the count and the write, so 50 requests at the same
--    moment cannot all see the last seat.
--
-- 2. ATT-DUP-DB / ATT-EXPIRED-DB: the database stored a second check-in on the same day and a
--    check-in for a frozen membership; only the desk app (checkInService) refused them.
--    A check-in written by a signed-in user (the desk, the kiosk) now follows the same rules as
--    0211's offline sync, which already enforced them: one a Manila day per member, and only on a
--    usable membership or that day's day pass. Definer functions, seeds and sweeps stand aside
--    (direct_user_write, 0171) — 0211 checks for itself. Same lock key as 0211, so an offline
--    flush and a live scan cannot both record the day.
--
-- The trigger functions run as the caller (direct_user_write needs current_user); the counts
-- they need are read by definer helpers that answer only for the caller's own gym.

-- ---- 1. class seats -------------------------------------------------------------------------

create or replace function class_seat_counts(p_class uuid, p_except uuid)
returns table (capacity int, approved int, taken int, name text)
language sql volatile security definer set search_path = public as $$
  select c.capacity,
         (select count(*) from bookings b where b.class_id = c.id and b.status = 'approved'
             and b.id is distinct from p_except)::int,
         (select count(*) from bookings b where b.class_id = c.id and b.status in ('pending', 'approved')
             and b.id is distinct from p_except)::int,
         c.name
    from classes c
   where c.id = p_class and (current_user <> 'authenticated' or in_my_gym(c.gym_id));
$$;
revoke all on function class_seat_counts(uuid, uuid) from public, anon;
grant execute on function class_seat_counts(uuid, uuid) to authenticated;

create or replace function trg_booking_seats() returns trigger
language plpgsql as $$
declare s record;
begin
  if new.class_id is null then return new; end if;
  -- Only writes that take a seat: a new pending/approved booking, or a change INTO approved.
  if not ((tg_op = 'INSERT' and new.status in ('pending', 'approved'))
          or (tg_op = 'UPDATE' and new.status = 'approved' and old.status is distinct from 'approved')) then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtext('class_seats:' || new.class_id::text));
  select * into s from class_seat_counts(new.class_id, case when tg_op = 'UPDATE' then new.id end);
  if s.capacity is null then return new; end if;

  if new.status = 'approved' and s.approved >= s.capacity then
    raise exception '% is full (% of % places taken). Reject this request, or give the class more places first.',
      s.name, s.approved, s.capacity using errcode = 'P0001';
  end if;
  if tg_op = 'INSERT' and new.status = 'pending' and direct_user_write() and s.taken >= s.capacity then
    raise exception '% is full. Join the waitlist and you will be told when a place frees up.',
      s.name using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function trg_booking_seats() from public, anon, authenticated;

-- z_*: after 0180's a_booking_mode_insert has decided pending vs approved (BEFORE triggers fire
-- in name order), so an auto-approved booking is counted as approved.
drop trigger if exists z_booking_seats on bookings;
create trigger z_booking_seats before insert or update of status on bookings
  for each row execute function trg_booking_seats();

-- ---- 2. check-ins ---------------------------------------------------------------------------

/** Why this check-in may not be recorded, in words for the desk, or NULL. The same rule as 0211's record_offline_checkin. */
create or replace function checkin_refusal(p_member uuid, p_gym uuid, p_at timestamptz)
returns text
language plpgsql volatile security definer set search_path = public as $$
declare
  v_day date := (coalesce(p_at, now()) at time zone 'Asia/Manila')::date;
  m record;
  v_ok boolean;
begin
  if p_member is null or p_gym is null then return null; end if;
  if current_user = 'authenticated' and not in_my_gym(p_gym) then return null; end if;  -- RLS refuses it anyway
  perform pg_advisory_xact_lock(hashtext('offline_checkin:' || p_member::text));
  if exists (select 1 from attendance a
              where a.gym_id = p_gym and a.member_id = p_member
                and (a.check_in_time at time zone 'Asia/Manila')::date = v_day) then
    return display_name_of(p_member) || ' already checked in today.';
  end if;
  select ms.status, ms.expiry_date, ms.never_expires into m
    from memberships ms where ms.member_id = p_member and ms.gym_id = p_gym
   order by ms.created_at desc limit 1;
  v_ok := m.status is not null and case m.status::text
    when 'active'    then coalesce(m.never_expires, false) or (m.expiry_date is not null and m.expiry_date >= v_day)
    when 'cancelled' then m.expiry_date is not null and m.expiry_date >= v_day
    else false end;
  if not v_ok then v_ok := coalesce(has_day_pass(p_member, p_gym, v_day), false); end if;
  if not v_ok then
    return display_name_of(p_member) || case when m.status::text = 'frozen' then '''s membership is frozen.'
                when m.status is null then ' has no membership on file.' else '''s membership has expired.' end;
  end if;
  return null;
end;
$$;
revoke all on function checkin_refusal(uuid, uuid, timestamptz) from public, anon;
grant execute on function checkin_refusal(uuid, uuid, timestamptz) to authenticated;

create or replace function trg_attendance_rules() returns trigger
language plpgsql as $$
declare why text;
begin
  if not direct_user_write() or new.member_id is null then return new; end if;
  why := checkin_refusal(new.member_id, coalesce(new.gym_id, current_gym_id()), new.check_in_time);
  if why is null then return new; end if;
  raise exception '%', why using errcode = 'P0001';
end;
$$;
revoke execute on function trg_attendance_rules() from public, anon, authenticated;

-- b_*: after 0200's a_attendance_pick.
drop trigger if exists b_attendance_rules on attendance;
create trigger b_attendance_rules before insert on attendance
  for each row execute function trg_attendance_rules();

create or replace function migration_0251_applied() returns boolean language sql stable as $$ select true $$;
grant execute on function migration_0251_applied() to anon, authenticated;
