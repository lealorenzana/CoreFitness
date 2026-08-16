-- 0025 — trainers get told when someone books them.
--
-- The trainer app has had a notification bell since the shell was written, and
-- it has never once had anything to show. Every `notifyUser` call in the
-- codebase targets a member: the admin notifies on booking approval, payment
-- and membership changes, and a trainer notifies a member when they send a
-- recommendation. Nothing notifies a trainer, so the bell is decoration and the
-- Sound setting in the trainer app would have nothing to chime for.
--
-- The obvious fix — have the member app write the row when it books — is
-- blocked, correctly. `notifications_insert_staff_roles` excludes members on
-- purpose: a member who can write notifications can forge a record of what the
-- gym did. So the write happens in the database, on the same statement that
-- creates the booking, as a SECURITY DEFINER trigger. The member never holds
-- the permission; the row still appears.
--
-- Rows only. Push is a separate channel and deliberately not attempted here:
-- `send-push` accepts admin/staff/trainer callers, so a member's client cannot
-- invoke it, and a trigger has no business making an HTTP call inside a booking
-- transaction anyway. The trainer sees these on their next poll.

-- Display name for a profile, or a neutral fallback. A notification that says
-- "null booked a session" is worse than one that says "A member" did.
create or replace function display_name_of(p_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(nullif(trim(concat(first_name, ' ', last_name)), ''), 'A member')
  from profiles where id = p_id;
$$;

-- ============ 1-ON-1 SESSIONS ============
create or replace function notify_trainer_of_pt_request() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.trainer_id is null then
    return new;
  end if;

  insert into notifications (user_id, type, title, message, action_url)
  values (
    new.trainer_id,
    'booking',
    'New 1-on-1 request',
    display_name_of(new.member_id) || ' requested a session on ' ||
      to_char(new.starts_at at time zone 'Asia/Manila', 'Mon DD') || ' at ' ||
      to_char(new.starts_at at time zone 'Asia/Manila', 'FMHH12:MI AM') || '.',
    '/trainer/bookings'
  );
  return new;
end;
$$;

drop trigger if exists trg_notify_trainer_pt_request on pt_sessions;
create trigger trg_notify_trainer_pt_request
after insert on pt_sessions
for each row execute function notify_trainer_of_pt_request();

-- A member calling off a session the trainer has already planned around is at
-- least as worth knowing about as the booking itself.
create or replace function notify_trainer_of_pt_cancel() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.trainer_id is null or new.status is not distinct from old.status then
    return new;
  end if;
  if new.status <> 'cancelled' then
    return new;
  end if;

  insert into notifications (user_id, type, title, message, action_url)
  values (
    new.trainer_id,
    'booking',
    'Session cancelled',
    display_name_of(new.member_id) || ' cancelled their ' ||
      to_char(new.starts_at at time zone 'Asia/Manila', 'Mon DD') || ' session.',
    '/trainer/bookings'
  );
  return new;
end;
$$;

drop trigger if exists trg_notify_trainer_pt_cancel on pt_sessions;
create trigger trg_notify_trainer_pt_cancel
after update on pt_sessions
for each row execute function notify_trainer_of_pt_cancel();

-- ============ GROUP CLASSES ============
-- The trainer teaching the class is the one who needs the headcount, and
-- `classes.trainer_id` may legitimately be null for an unassigned class.
create or replace function notify_trainer_of_class_booking() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  c record;
begin
  select name, trainer_id, scheduled_at into c from classes where id = new.class_id;
  if c is null or c.trainer_id is null then
    return new;
  end if;

  insert into notifications (user_id, type, title, message, action_url)
  values (
    c.trainer_id,
    'booking',
    'New class booking',
    display_name_of(new.member_id) || ' booked ' || c.name ||
      coalesce(
        ' on ' || to_char(c.scheduled_at at time zone 'Asia/Manila', 'Mon DD'),
        ''
      ) || '.',
    '/trainer/bookings'
  );
  return new;
end;
$$;

drop trigger if exists trg_notify_trainer_class_booking on bookings;
create trigger trg_notify_trainer_class_booking
after insert on bookings
for each row execute function notify_trainer_of_class_booking();
