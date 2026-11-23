-- ============================================================================
-- 0268 : the page-load sweep is not held back by "who approves" (2026-11-23)
-- ============================================================================
--
-- 0203 promised "sweeps and expiries run with no signed-in user and are never
-- held back". But pg_cron is optional, so sweep_stale_requests() also runs on
-- page load, signed in as the owner or the desk. At a gym whose bookings are
-- "Coach approves" or "Coach, then desk", the sweep's expiry of a past, never
-- decided request (status 'rejected') hit 0203's guard as if the owner had
-- declined in the coach's place: 403/42501 on every Personal training load,
-- and stale requests at those gyms never expired.
--
-- The sweep already marks its writes with the transaction-local setting
-- corefitness.automated (0071, set only inside the SECURITY DEFINER sweep; a
-- client cannot reach set_config through PostgREST), and 0071/0074/0081's
-- guards already let it through. Now 0203's guard does too. A person deciding
-- by hand is held to the gym's choice exactly as before.
-- ============================================================================

create or replace function trg_booking_mode_decide() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_kind text := case when tg_table_name = 'bookings' then 'class' else 'pt' end;
        v_mode text; v_what text; v_role text; v_trainer uuid; r record;
begin
  if new.status is not distinct from old.status or new.status not in ('approved', 'rejected') then
    return new;
  end if;
  -- 0268: the sweep's own expiry, whoever's page load ran it.
  if coalesce(current_setting('corefitness.automated', true), '') = 'on' then
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

create or replace function migration_0268_applied() returns boolean language sql stable as $$ select true $$;
revoke all on function migration_0268_applied() from public, anon;
grant execute on function migration_0268_applied() to authenticated;

-- VERIFICATION: scripts/sql/approval-means-who.mjs (the 0268 block)
