-- ============================================================================
-- 0203 — "Who approves" means who approves (2026-10-20, the owner's correction)
-- ============================================================================
--
-- 0180 let a gym choose who decides bookings, but kept 0071's escape hatch:
-- "the desk and the owner can always approve, decline or reverse". So with
-- "Coach approves" chosen, the owner's Bookings still showed Approve on every
-- request — and in "Coach, then desk" the owner could approve before the coach
-- had said anything, skipping the coach's step altogether. The owner asked:
-- if the coach approves, the coach approves, and the gym just sees it.
--
-- Now, for a PENDING request and for reversing a decided one:
--   coach        the coach decides. The owner and the desk see it (and can
--                remind the coach) but cannot decide or reverse it.
--   coach_desk   the coach first; the owner/desk confirm only a request the
--                coach has accepted (coach_ok_at). A coach's decline is final.
--   desk         the owner/desk decide (unchanged); a coach cannot.
--   instant/off  unchanged.
--
-- The one exception, so nothing can be stranded: when there is no coach to
-- decide — a class with no coach, or a coach who is no longer active at the
-- gym (suspended, archived) — the owner and the desk may decide it.
--
-- Not touched: CANCELLING (0081's cancel_booking, status 'cancelled') — the
-- desk still cancels for a member who asks. Sweeps and expiries run with no
-- signed-in user and are never held back.
-- ============================================================================

-- The coach a booking belongs to, and whether they can still decide it.
create or replace function booking_coach_can_decide(p_gym uuid, p_trainer uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_trainer is not null and exists (
    select 1 from gym_roles
     where gym_id = p_gym and user_id = p_trainer and role = 'trainer' and status = 'active');
$$;
revoke all on function booking_coach_can_decide(uuid, uuid) from public, anon, authenticated;

create or replace function trg_booking_mode_decide() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_kind text := case when tg_table_name = 'bookings' then 'class' else 'pt' end;
        v_mode text; v_what text; v_role text; v_trainer uuid; r record;
begin
  if new.status is not distinct from old.status or new.status not in ('approved', 'rejected') then
    return new;
  end if;
  v_role := role_in_gym(new.gym_id);
  v_mode := booking_approval_mode(new.gym_id, v_kind);

  -- ---- the gym (owner or front desk), signed in: held to the gym's choice ----
  if auth.uid() is not null and v_role in ('admin', 'staff') and v_mode in ('coach', 'coach_desk') then
    if v_kind = 'class' then
      select c.trainer_id into v_trainer from classes c where c.id = new.class_id;
    else
      v_trainer := new.trainer_id;
    end if;
    if booking_coach_can_decide(new.gym_id, v_trainer) then
      if v_mode = 'coach' then
        raise exception 'At this gym the coach decides these bookings — you can see them and remind the coach.'
          using errcode = '42501';
      end if;
      -- coach_desk: confirming waits for the coach's yes; a decided row is the coach's.
      if old.status <> 'pending' or new.status <> 'approved' or old.coach_ok_at is null then
        raise exception 'At this gym the coach accepts first — you confirm once they have.'
          using errcode = '42501';
      end if;
    end if;
    return new;
  end if;

  -- ---- a coach: 0180, unchanged -------------------------------------------------
  if old.status <> 'pending' or v_role is distinct from 'trainer' then
    return new;
  end if;
  if v_mode in ('desk', 'off') then
    raise exception 'At this gym the front desk decides these bookings.' using errcode = '42501';
  end if;
  if v_mode = 'coach_desk' and new.status = 'approved' then
    -- The coach's yes is a step, not the answer: recorded, and the desk asked.
    new.status := 'pending';
    new.approved_at := old.approved_at;
    new.approved_by := old.approved_by;
    new.coach_ok_by := auth.uid();
    new.coach_ok_at := now();
    if v_kind = 'class' then
      select 'class booking: ' || display_name_of(new.member_id) || ' — ' || c.name into v_what
        from classes c where c.id = new.class_id;
    else
      v_what := '1-on-1: ' || display_name_of(new.member_id) || ' — ' ||
        to_char(new.starts_at at time zone 'Asia/Manila', 'Mon DD, FMHH12:MI AM');
    end if;
    for r in select user_id from gym_roles where gym_id = new.gym_id and status = 'active'
               and (role = 'admin' or (role = 'staff' and v_kind = 'pt')) loop
      perform notify_once(r.user_id, 'booking', 'Coach accepted — your turn',
        'The coach accepted this ' || coalesce(v_what, 'booking') || '. Confirm it on Bookings.',
        '/bookings', 'coachok:' || tg_table_name || ':' || new.id, new.gym_id);
    end loop;
  end if;
  return new;
end;
$$;
-- The triggers from 0180 already call this function by name; nothing to re-create.

create or replace function migration_0203_applied() returns boolean
language sql immutable as $marker$ select true $marker$;
revoke all on function migration_0203_applied() from public, anon;
grant execute on function migration_0203_applied() to authenticated;
comment on function migration_0203_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0203.sql
