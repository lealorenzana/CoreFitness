-- ============================================================================
-- 0180 — Who approves a booking: the gym chooses, per kind
-- ============================================================================
--
-- 0071 fixed one rule for every gym: the coach decides. A gym now picks, for
-- CLASSES and for 1-ON-1 SESSIONS separately:
--
--   instant      a member's booking is confirmed at once (0017's quota, 0068's
--                clashes and the class's seats still apply — they run on insert)
--   coach        the coach accepts or declines (0071; the default, so every
--                existing gym keeps exactly what it has today)
--   desk         only the gym decides — the owner for classes, the owner or the
--                front desk for 1-on-1 (as their policies always allowed); a coach cannot
--   coach_desk   the coach accepts first, then the desk confirms. A coach's
--                "accept" is recorded (coach_ok_by/at) and the row stays
--                pending until the desk approves; a coach's decline is final
--   off          members cannot book that kind in the app (the screens hide it);
--                the front desk can still book a 1-on-1 for them
--
-- The desk and the owner can always approve, decline or reverse.
--
-- And a gap closed on the way: the member's insert policies (0006, 0015) check
-- only member_id = auth.uid(), never status — a crafted request could insert
-- its own booking already 'approved'. The insert trigger below sets a member's
-- status itself, from the gym's choice; the client's value is ignored.
-- ============================================================================

alter table gym_settings add column if not exists class_booking_approval text not null default 'coach';
alter table gym_settings add column if not exists pt_booking_approval text not null default 'coach';
alter table gym_settings drop constraint if exists gym_settings_class_booking_approval_check;
alter table gym_settings add constraint gym_settings_class_booking_approval_check
  check (class_booking_approval in ('instant', 'coach', 'desk', 'coach_desk', 'off'));
alter table gym_settings drop constraint if exists gym_settings_pt_booking_approval_check;
alter table gym_settings add constraint gym_settings_pt_booking_approval_check
  check (pt_booking_approval in ('instant', 'coach', 'desk', 'coach_desk', 'off'));

alter table bookings    add column if not exists coach_ok_by uuid references profiles(id);
alter table bookings    add column if not exists coach_ok_at timestamptz;
alter table pt_sessions add column if not exists coach_ok_by uuid references profiles(id);
alter table pt_sessions add column if not exists coach_ok_at timestamptz;

-- The gym's choice for one kind ('class' | 'pt'). A gym with no settings row
-- reads as 'coach', which is what 0071 always did.
create or replace function booking_approval_mode(p_gym uuid, p_kind text) returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select case when p_kind = 'class' then gs.class_booking_approval else gs.pt_booking_approval end
                     from gym_settings gs where gs.gym_id = p_gym), 'coach');
$$;
revoke all on function booking_approval_mode(uuid, text) from public, anon;
grant execute on function booking_approval_mode(uuid, text) to authenticated;

-- What the member and trainer screens need: both choices for the current gym.
create or replace function my_booking_modes() returns table (class_mode text, pt_mode text)
language sql stable security definer set search_path = public as $$
  select booking_approval_mode(current_gym_id(), 'class'), booking_approval_mode(current_gym_id(), 'pt');
$$;
revoke all on function my_booking_modes() from public, anon;
grant execute on function my_booking_modes() to authenticated;

-- The owner sets both together.
create or replace function set_booking_approval(p_class text, p_pt text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if get_my_role() is distinct from 'admin' then
    raise exception 'Only the gym owner can change how bookings are approved.' using errcode = '42501';
  end if;
  if p_class not in ('instant', 'coach', 'desk', 'coach_desk', 'off')
     or p_pt not in ('instant', 'coach', 'desk', 'coach_desk', 'off') then
    raise exception 'Choose instant, coach, desk, coach then desk, or off.';
  end if;
  update gym_settings set class_booking_approval = p_class, pt_booking_approval = p_pt
   where gym_id = acting_gym_id();
end;
$$;
revoke all on function set_booking_approval(text, text) from public, anon;
grant execute on function set_booking_approval(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- A member's own booking: the gym's choice sets its status.
-- Named a_* so it runs before 0017/0068's checks (BEFORE triggers fire in name
-- order): "this gym does not take bookings here" is the first thing to say.
-- ---------------------------------------------------------------------------
create or replace function trg_booking_mode_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_kind text := case when tg_table_name = 'bookings' then 'class' else 'pt' end;
        v_mode text;
begin
  -- Only a member booking for themselves. The desk, definer functions (the AI
  -- coach's Apply, seeds) and the table owner keep the status they give.
  if auth.uid() is null or auth.uid() is distinct from new.member_id
     or role_in_gym(new.gym_id) is distinct from 'member' then
    return new;
  end if;
  v_mode := booking_approval_mode(new.gym_id, v_kind);
  if v_mode = 'off' then
    raise exception '%', case when v_kind = 'class'
      then 'This gym takes class bookings at the front desk, not in the app.'
      else 'This gym books 1-on-1 sessions at the front desk, not in the app.' end
      using errcode = '42501';
  end if;
  new.coach_ok_by := null;
  new.coach_ok_at := null;
  if v_mode = 'instant' then
    new.status := 'approved';
    new.decided_by := null;
    new.decided_by_role := 'system';
    new.decided_at := now();
    new.approved_at := now();
    new.approved_by := null;
  else
    new.status := 'pending';
    new.decided_by := null;
    new.decided_by_role := null;
    new.decided_at := null;
    new.approved_at := null;
    new.approved_by := null;
  end if;
  return new;
end;
$$;

drop trigger if exists a_booking_mode_insert on bookings;
create trigger a_booking_mode_insert before insert on bookings
  for each row execute function trg_booking_mode_insert();
drop trigger if exists a_booking_mode_insert on pt_sessions;
create trigger a_booking_mode_insert before insert on pt_sessions
  for each row execute function trg_booking_mode_insert();

-- ---------------------------------------------------------------------------
-- A coach's decision, held to the gym's choice. Runs before 0071's stamp.
-- ---------------------------------------------------------------------------
create or replace function trg_booking_mode_decide() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_kind text := case when tg_table_name = 'bookings' then 'class' else 'pt' end;
        v_mode text; v_what text; r record;
begin
  if new.status is not distinct from old.status or old.status <> 'pending'
     or new.status not in ('approved', 'rejected')
     or role_in_gym(new.gym_id) is distinct from 'trainer' then
    return new;
  end if;
  v_mode := booking_approval_mode(new.gym_id, v_kind);
  if v_mode in ('desk', 'off') then
    raise exception 'At this gym the front desk decides these bookings.' using errcode = '42501';
  end if;
  if v_mode = 'coach_desk' and new.status = 'approved' then
    -- The coach's yes is a step, not the answer: recorded, and the desk asked.
    new.status := 'pending';
    new.approved_at := old.approved_at;   -- the app sends these with "approved";
    new.approved_by := old.approved_by;   -- a pending row must not carry them
    new.coach_ok_by := auth.uid();
    new.coach_ok_at := now();
    if v_kind = 'class' then
      select 'class booking: ' || display_name_of(new.member_id) || ' — ' || c.name into v_what
        from classes c where c.id = new.class_id;
    else
      v_what := '1-on-1: ' || display_name_of(new.member_id) || ' — ' ||
        to_char(new.starts_at at time zone 'Asia/Manila', 'Mon DD, FMHH12:MI AM');
    end if;
    -- Asked of whoever may confirm it: the owner for classes (the front desk has
    -- never had an update policy on bookings, 0006/0012), owner and desk for 1-on-1.
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

drop trigger if exists a_booking_mode_decide on bookings;
create trigger a_booking_mode_decide before update on bookings
  for each row execute function trg_booking_mode_decide();
drop trigger if exists a_booking_mode_decide on pt_sessions;
create trigger a_booking_mode_decide before update on pt_sessions
  for each row execute function trg_booking_mode_decide();

-- The coach's 1-on-1 alert says what actually happened: a confirmed booking
-- under 'instant', a request otherwise (0025/0103's body otherwise unchanged).
create or replace function notify_trainer_of_pt_request() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.trainer_id is null then
    return new;
  end if;
  insert into notifications (gym_id, user_id, type, title, message, action_url)
  values (
    new.gym_id,
    new.trainer_id,
    'booking',
    case when new.status = 'approved' then 'New 1-on-1 booked' else 'New 1-on-1 request' end,
    display_name_of(new.member_id) || case when new.status = 'approved' then ' booked a session on ' else ' requested a session on ' end ||
      to_char(new.starts_at at time zone 'Asia/Manila', 'Mon DD') || ' at ' ||
      to_char(new.starts_at at time zone 'Asia/Manila', 'FMHH12:MI AM') || '.',
    '/trainer/bookings'
  );
  return new;
end;
$$;

create or replace function migration_0180_applied() returns boolean
language sql immutable as $marker$ select true $marker$;
revoke all on function migration_0180_applied() from public, anon;
grant execute on function migration_0180_applied() to authenticated;
comment on function migration_0180_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0180.sql
