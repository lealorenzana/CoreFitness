-- 0103 — Notifications, reminders, the activity log and crash reports are per gym.
--
-- The last function group. A notification is filed in the gym it is about;
-- its dedupe key is per gym (one message per gym for the same event, never
-- one swallowed by another gym's); the reminder sweeps run gym by gym and read
-- the recipient's status in that gym. The activity-log triggers are their
-- 0037 bodies verbatim with one first line: act in the row's gym, so the log
-- line lands there even when system code with no caller wrote the row.
--
-- Plan: docs/superpowers/plans/2026-09-20-saas-part-a-tenancy.md (Task 8)

-- ---- notify_once: filed per gym, deduped per gym ------------------------------------

drop function if exists notify_once(uuid, text, text, text, text, text);
create function notify_once(
  p_user uuid, p_type text, p_title text, p_message text,
  p_action_url text, p_dedupe text, p_gym uuid default null
) returns boolean
language plpgsql security definer set search_path = public as $fn$
begin
  insert into notifications (gym_id, user_id, type, title, message, action_url, metadata)
  values (coalesce(p_gym, acting_gym_id()), p_user, p_type, p_title, p_message, p_action_url,
          jsonb_build_object('dedupe', p_dedupe))
  on conflict do nothing;
  return found;
end;
$fn$;

-- The old per-person dedupe key goes: from here on, per gym (0098's index).
drop index if exists notifications_dedupe_transition;

create or replace function notify_trainer_of_class_booking() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  c record;
begin
  select name, trainer_id, scheduled_at into c from classes where id = new.class_id;
  if c is null or c.trainer_id is null then
    return new;
  end if;

  insert into notifications (gym_id, user_id, type, title, message, action_url)
  values (
    new.gym_id,
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

create or replace function notify_trainer_of_pt_cancel() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.trainer_id is null or new.status is not distinct from old.status then
    return new;
  end if;
  if new.status <> 'cancelled' then
    return new;
  end if;

  insert into notifications (gym_id, user_id, type, title, message, action_url)
  values (
    new.gym_id,
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
    'New 1-on-1 request',
    display_name_of(new.member_id) || ' requested a session on ' ||
      to_char(new.starts_at at time zone 'Asia/Manila', 'Mon DD') || ' at ' ||
      to_char(new.starts_at at time zone 'Asia/Manila', 'FMHH12:MI AM') || '.',
    '/trainer/bookings'
  );
  return new;
end;
$$;

create or replace function trg_notify_achievement() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare
  a record;
begin
  -- `title`, not `name` (0038); this gym's catalogue.
  select title, description into a from achievements
   where gym_id = new.gym_id and key = new.achievement_key;
  perform notify_once(
    new.user_id, 'success', 'Badge unlocked',
    coalesce(a.title, 'You unlocked a new badge') ||
      coalesce(' — ' || a.description, '.'),
    '/member/achievements',
    'badge:' || new.id::text,
    new.gym_id
  );
  return null;
end;
$fn$;

create or replace function trg_notify_goal_reached() returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  if new.achieved_on is not null and old.achieved_on is null then
    perform notify_once(
      new.member_id, 'success', 'Goal reached',
      'You hit your goal: ' || new.title || '.',
      '/member/progress?tab=goals',
      'goal:' || new.id::text,
      new.gym_id
    );
  end if;
  return null;
end;
$fn$;

create or replace function trg_notify_trainer_feedback() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare
  v_name text;
begin
  select nullif(btrim(p.first_name || ' ' || p.last_name), '')
    into v_name
    from profiles p where p.id = new.trainer_id;

  perform notify_once(
    new.member_id, 'system',
    'Feedback from your coach',
    coalesce(v_name, 'Your coach') || ' left you a note after your session.',
    '/member/progress',
    'feedback:' || new.id,
    new.gym_id);
  return new;
end;
$fn$;

-- ---- crash reports: capped and pruned per gym ---------------------------------------------
-- One gym's broken screen must not use up another gym's (or the platform's) allowance.

create or replace function client_errors_cap() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from client_errors
       where created_at > now() - interval '1 hour'
         and gym_id is not distinct from new.gym_id) >= 300 then
    return null;
  end if;
  return new;
end;
$$;

create or replace function prune_client_errors() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if auth.uid() is null or coalesce(get_my_role()::text, '') <> 'admin' then
    return 0;
  end if;
  delete from client_errors
   where created_at < now() - interval '60 days' and gym_id = current_gym_id();
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ---- reminder sweeps: gym by gym ------------------------------------------------------------
-- pg_cron (no caller) covers every gym; a signed-in caller's page-load run, their gym.

create or replace function send_due_gym_reminders()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  now_manila timestamp := (now() at time zone 'Asia/Manila');
  today date := now_manila::date;
  today_dow int := extract(dow from now_manila)::int;
  sent int := 0;
  p record;
  v_only uuid := case when auth.uid() is not null then current_gym_id() end;
begin
  for p in
    select g.id, g.gym_id, g.member_id, g.remind_at, r.name as routine_name
    from gym_plans g
    join gym_roles gr on gr.user_id = g.member_id and gr.gym_id = g.gym_id and gr.status = 'active'
    join gyms gy on gy.id = g.gym_id and gy.status = 'active'
    left join workout_routines r on r.id = g.routine_id
    where g.active
      and (v_only is null or g.gym_id = v_only)
      and g.day_of_week = today_dow
      and (g.last_reminded_on is null or g.last_reminded_on < today)
      and now_manila >= (today + g.remind_at)
      and now_manila <  (today + g.remind_at + interval '3 hours')
      and not exists (
        select 1 from attendance a
        where a.member_id = g.member_id
          and a.gym_id = g.gym_id
          and (a.check_in_time at time zone 'Asia/Manila')::date = today
      )
  loop
    insert into notifications (gym_id, user_id, type, title, message, action_url)
    values (
      p.gym_id,
      p.member_id,
      'gym_plan',
      coalesce(p.routine_name, 'Training day'),
      case when p.routine_name is not null
        then 'You planned ' || p.routine_name || ' today at '
        else 'You planned to train today at '
      end
        || to_char(p.remind_at, 'FMHH12:MI AM')
        || '. You have not checked in yet.',
      '/member/gym-plan'
    );

    update gym_plans set last_reminded_on = today where id = p.id;
    sent := sent + 1;
  end loop;

  return sent;
end;
$$;

create or replace function send_membership_expiry_reminders() returns int
language plpgsql security definer set search_path = public as $fn$
declare
  today date := (now() at time zone 'Asia/Manila')::date;
  sent int := 0;
  m record;
  d int;
  v_only uuid := case when auth.uid() is not null then current_gym_id() end;
begin
  for m in
    select ms.id, ms.gym_id, ms.member_id, ms.expiry_date, mp.name as plan_name,
           (ms.expiry_date - today) as days_left
      from memberships ms
      join gym_roles gr on gr.user_id = ms.member_id and gr.gym_id = ms.gym_id and gr.status = 'active'
      join gyms gy on gy.id = ms.gym_id and gy.status = 'active'
      join membership_plans mp on mp.id = ms.plan_id
     where ms.status = 'active'
       and (v_only is null or ms.gym_id = v_only)
       and not ms.never_expires
       and ms.expiry_date is not null
       and (ms.expiry_date - today) in (7, 3, 1)
       -- Only the newest membership row in that gym (0053): a member who renewed
       -- early has an old row expiring next week and a new one running on.
       and ms.created_at = (select max(m2.created_at) from memberships m2
                             where m2.member_id = ms.member_id and m2.gym_id = ms.gym_id)
  loop
    d := m.days_left;
    if notify_once(
      m.member_id, 'expiry',
      case when d = 1 then 'Your membership ends tomorrow'
           else 'Your membership ends in ' || d || ' days' end,
      'Your ' || m.plan_name || ' membership runs to ' ||
        to_char(m.expiry_date, 'FMMon FMDD') ||
        '. Renew at the front desk to keep your access.',
      '/member/renew',
      'expiry:' || m.id::text || ':' || d::text,
      m.gym_id
    ) then
      sent := sent + 1;
    end if;
  end loop;
  return sent;
end;
$fn$;

create or replace function send_upcoming_session_reminders() returns int
language plpgsql security definer set search_path = public as $fn$
declare
  tomorrow date := (now() at time zone 'Asia/Manila')::date + 1;
  sent int := 0;
  r record;
  v_only uuid := case when auth.uid() is not null then current_gym_id() end;
begin
  for r in
    select b.id, b.gym_id, b.member_id, c.name as title, c.scheduled_at as at
      from bookings b
      join classes c on c.id = b.class_id
      join gym_roles gr on gr.user_id = b.member_id and gr.gym_id = b.gym_id and gr.status = 'active'
     where b.status = 'approved'
       and (v_only is null or b.gym_id = v_only)
       and (c.scheduled_at at time zone 'Asia/Manila')::date = tomorrow
  loop
    if notify_once(
      r.member_id, 'booking', 'Class tomorrow',
      r.title || ' at ' ||
        to_char(r.at at time zone 'Asia/Manila', 'FMHH12:MI AM') || '.',
      '/member/booking-history',
      'session:booking:' || r.id::text,
      r.gym_id
    ) then
      sent := sent + 1;
    end if;
  end loop;

  for r in
    select p.id, p.gym_id, p.member_id, p.starts_at as at,
           pr2.first_name || ' ' || pr2.last_name as coach
      from pt_sessions p
      join gym_roles gr on gr.user_id = p.member_id and gr.gym_id = p.gym_id and gr.status = 'active'
      join profiles pr2 on pr2.id = p.trainer_id
     where p.status = 'approved'
       and (v_only is null or p.gym_id = v_only)
       and (p.starts_at at time zone 'Asia/Manila')::date = tomorrow
  loop
    if notify_once(
      r.member_id, 'booking', 'Training session tomorrow',
      'With ' || r.coach || ' at ' ||
        to_char(r.at at time zone 'Asia/Manila', 'FMHH12:MI AM') || '.',
      '/member/booking-history',
      'session:pt:' || r.id::text,
      r.gym_id
    ) then
      sent := sent + 1;
    end if;
  end loop;

  return sent;
end;
$fn$;

-- ---- the activity log: each line in its row's gym ---------------------------------------------

-- log_attendance_activity: 0037_activity_log.sql, verbatim but for the first line of the body.
create or replace function log_attendance_activity() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform act_as_gym(case when tg_op = 'DELETE' then old.gym_id else new.gym_id end);
  if tg_op = 'INSERT' then
    perform log_activity('checkin.recorded', 'attendance', new.id, new.member_id,
      coalesce(activity_member_name(new.member_id), 'A member') || ' checked in'
        || case when new.method = 'qr' then ' by QR' else ' at the desk' end
        || coalesce(' for ' || new.activity, ''),
      jsonb_build_object('method', new.method, 'activity', new.activity,
                         'check_in_time', new.check_in_time));
    return new;
  end if;

  -- 0035 allows a same-day delete so the desk can undo a mis-scan. That undo is
  -- exactly the kind of correction an owner would want to see.
  perform log_activity('checkin.undone', 'attendance', old.id, old.member_id,
    'Undid a check-in for ' || coalesce(activity_member_name(old.member_id), 'a member'),
    jsonb_build_object('method', old.method, 'check_in_time', old.check_in_time));
  return old;
end;
$$;

-- log_booking_activity: 0037_activity_log.sql, verbatim but for the first line of the body.
create or replace function log_booking_activity() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_class text;
  v_who   text;
begin
  perform act_as_gym(case when tg_op = 'DELETE' then old.gym_id else new.gym_id end);
  -- NEW only, never `coalesce(new.x, old.x)`. This trigger fires on INSERT and
  -- UPDATE, and on an INSERT `OLD` is an *unassigned* record — reading a field
  -- off it raises "record \"old\" is not assigned yet" and aborts the statement.
  -- That would have made every new booking fail. NEW is populated for both
  -- operations, so the coalesce was never needed in the first place.
  select c.name into v_class from classes c where c.id = new.class_id;
  v_who := coalesce(activity_member_name(new.member_id), 'A member');

  if tg_op = 'INSERT' then
    perform log_activity('booking.requested', 'booking', new.id, new.member_id,
      v_who || ' requested a spot in ' || coalesce(v_class, 'a class'),
      jsonb_build_object('class_id', new.class_id, 'class_name', v_class));
    return new;
  end if;

  -- Only a real status transition is an event. Any other column changing is
  -- bookkeeping and does not deserve a line.
  if new.status is distinct from old.status then
    perform log_activity(
      'booking.' || new.status::text, 'booking', new.id, new.member_id,
      case new.status
        when 'approved'  then v_who || '''s booking for ' || coalesce(v_class, 'a class') || ' was approved'
        when 'rejected'  then v_who || '''s booking for ' || coalesce(v_class, 'a class') || ' was rejected'
        -- The line this whole migration exists for. `auth.uid()` is the only
        -- thing that can tell these two apart, and it is gone the instant the
        -- statement finishes.
        when 'cancelled' then
          case when auth.uid() = new.member_id
               then v_who || ' cancelled their own booking for ' || coalesce(v_class, 'a class')
               else v_who || '''s booking for ' || coalesce(v_class, 'a class') || ' was cancelled by the front desk'
          end
        else v_who || '''s booking became ' || new.status::text
      end,
      jsonb_build_object(
        'from', old.status, 'to', new.status,
        'class_id', new.class_id, 'class_name', v_class,
        'self_service', auth.uid() = new.member_id));
  end if;
  return new;
end;
$$;

-- log_class_template_activity: 0037_activity_log.sql, verbatim but for the first line of the body.
create or replace function log_class_template_activity() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform act_as_gym(case when tg_op = 'DELETE' then old.gym_id else new.gym_id end);
  if tg_op = 'INSERT' then
    perform log_activity('class.template_created', 'class_template', new.id, null,
      'Added ' || new.name || ' to the weekly timetable', to_jsonb(new));
    return new;
  end if;

  if tg_op = 'DELETE' then
    perform log_activity('class.template_deleted', 'class_template', old.id, null,
      'Removed ' || old.name || ' from the weekly timetable', null);
    return old;
  end if;

  if new.active is distinct from old.active then
    perform log_activity('class.template_' || case when new.active then 'resumed' else 'paused' end,
      'class_template', new.id, null,
      new.name || ' was ' || case when new.active then 'resumed' else 'paused' end, null);
  end if;
  return new;
end;
$$;

-- log_event_activity: 0037_activity_log.sql, verbatim but for the first line of the body.
create or replace function log_event_activity() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform act_as_gym(case when tg_op = 'DELETE' then old.gym_id else new.gym_id end);
  if tg_op = 'INSERT' then
    perform log_activity('event.created', 'event', new.id, null,
      'Created the event "' || new.title || '"',
      jsonb_build_object('starts_at', new.starts_at, 'capacity', new.capacity));
    return new;
  end if;

  -- 0014 stores only cancellation; everything else about an event's status is
  -- derived from `starts_at`. So cancellation is the only state worth logging.
  if new.cancelled is distinct from old.cancelled then
    perform log_activity('event.' || case when new.cancelled then 'cancelled' else 'reinstated' end,
      'event', new.id, null,
      '"' || new.title || '" was ' || case when new.cancelled then 'cancelled' else 'reinstated' end,
      jsonb_build_object('starts_at', new.starts_at));
  end if;
  return new;
end;
$$;

-- log_membership_activity: 0037_activity_log.sql, verbatim but for the first line of the body.
create or replace function log_membership_activity() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_member text;
  v_plan   text;
begin
  perform act_as_gym(case when tg_op = 'DELETE' then old.gym_id else new.gym_id end);
  -- NEW only — see the note in log_booking_activity(). Insert-or-update trigger.
  v_member := coalesce(activity_member_name(new.member_id), 'A member');
  select p.name into v_plan from membership_plans p where p.id = new.plan_id;

  if tg_op = 'INSERT' then
    perform log_activity('membership.created', 'membership', new.id, new.member_id,
      v_member || ' was put on the ' || coalesce(v_plan, 'a') || ' plan',
      jsonb_build_object('plan_id', new.plan_id, 'plan_name', v_plan,
                         'status', new.status, 'expiry_date', new.expiry_date));
    return new;
  end if;

  if new.status is distinct from old.status then
    perform log_activity('membership.' || new.status::text, 'membership', new.id, new.member_id,
      v_member || '''s membership is now ' || new.status::text,
      jsonb_build_object('from', old.status, 'to', new.status,
                         'plan_name', v_plan, 'freeze_count', new.freeze_count));
  end if;

  -- An expiry moving is a renewal or an extension — money changed hands, or
  -- somebody granted days. Either way it is worth a line of its own.
  if new.expiry_date is distinct from old.expiry_date then
    perform log_activity('membership.expiry_changed', 'membership', new.id, new.member_id,
      v_member || '''s membership expiry moved from '
        || coalesce(old.expiry_date::text, 'none') || ' to '
        || coalesce(new.expiry_date::text, 'none'),
      jsonb_build_object('from', old.expiry_date, 'to', new.expiry_date, 'plan_name', v_plan));
  end if;

  if new.plan_id is distinct from old.plan_id then
    perform log_activity('membership.plan_changed', 'membership', new.id, new.member_id,
      v_member || ' moved to the ' || coalesce(v_plan, 'a') || ' plan',
      jsonb_build_object('from_plan', old.plan_id, 'to_plan', new.plan_id, 'plan_name', v_plan));
  end if;
  return new;
end;
$$;

-- log_payment_activity: 0037_activity_log.sql, verbatim but for the first line of the body.
create or replace function log_payment_activity() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform act_as_gym(case when tg_op = 'DELETE' then old.gym_id else new.gym_id end);
  if tg_op = 'INSERT' then
    perform log_activity('payment.recorded', 'payment', new.id, new.member_id,
      'Recorded a ' || ('₱' || to_char(new.amount, 'FM999,999,990.00')) || ' ' || new.method
        || ' payment for ' || coalesce(activity_member_name(new.member_id), 'a member'),
      -- `paid_on` and `created_at` are different questions (0008) and both
      -- belong here: the desk can record yesterday's cash this morning.
      jsonb_build_object('amount', new.amount, 'method', new.method,
                         'paid_on', new.paid_on, 'invoice_number', new.invoice_number));
    return new;
  end if;

  if tg_op = 'DELETE' then
    perform log_activity('payment.deleted', 'payment', old.id, old.member_id,
      'Deleted a ' || ('₱' || to_char(old.amount, 'FM999,999,990.00')) || ' payment for '
        || coalesce(activity_member_name(old.member_id), 'a member'),
      jsonb_build_object('amount', old.amount, 'method', old.method, 'paid_on', old.paid_on));
    return old;
  end if;

  if new.amount is distinct from old.amount or new.status is distinct from old.status then
    perform log_activity('payment.amended', 'payment', new.id, new.member_id,
      'Amended a payment for ' || coalesce(activity_member_name(new.member_id), 'a member'),
      jsonb_build_object('amount_from', old.amount, 'amount_to', new.amount,
                         'status_from', old.status, 'status_to', new.status));
  end if;
  return new;
end;
$$;

-- log_plan_activity: 0037_activity_log.sql, verbatim but for the first line of the body.
create or replace function log_plan_activity() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform act_as_gym(case when tg_op = 'DELETE' then old.gym_id else new.gym_id end);
  if tg_op = 'INSERT' then
    perform log_activity('plan.created', 'plan', new.id, null,
      'Created the ' || new.name || ' plan at ' || ('₱' || to_char(new.price, 'FM999,999,990.00')),
      jsonb_build_object('price', new.price, 'tier', new.tier, 'duration_days', new.duration_days));
    return new;
  end if;

  if tg_op = 'DELETE' then
    perform log_activity('plan.deleted', 'plan', old.id, null,
      'Deleted the ' || old.name || ' plan', jsonb_build_object('price', old.price));
    return old;
  end if;

  -- A price change is the single most consequential edit in the admin app and
  -- had no record at all before this.
  if new.price is distinct from old.price then
    perform log_activity('plan.price_changed', 'plan', new.id, null,
      new.name || ' repriced from ' || ('₱' || to_char(old.price, 'FM999,999,990.00'))
        || ' to ' || ('₱' || to_char(new.price, 'FM999,999,990.00')),
      jsonb_build_object('from', old.price, 'to', new.price));
  end if;

  if new.is_active is distinct from old.is_active then
    perform log_activity('plan.' || case when new.is_active then 'activated' else 'retired' end,
      'plan', new.id, null,
      new.name || ' was ' || case when new.is_active then 'made available again' else 'retired' end,
      jsonb_build_object('is_active', new.is_active));
  end if;
  return new;
end;
$$;

-- log_pt_activity: 0037_activity_log.sql, verbatim but for the first line of the body.
create or replace function log_pt_activity() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_member  text;
  v_trainer text;
begin
  perform act_as_gym(case when tg_op = 'DELETE' then old.gym_id else new.gym_id end);
  -- NEW only — see the note in log_booking_activity(). Insert-or-update trigger.
  v_member  := coalesce(activity_member_name(new.member_id), 'A member');
  v_trainer := activity_member_name(new.trainer_id);

  if tg_op = 'INSERT' then
    perform log_activity('pt.requested', 'pt_session', new.id, new.member_id,
      v_member || ' requested a personal training session'
        || coalesce(' with ' || v_trainer, ''),
      jsonb_build_object('trainer_id', new.trainer_id, 'starts_at', new.starts_at));
    return new;
  end if;

  if new.status is distinct from old.status then
    perform log_activity('pt.' || new.status::text, 'pt_session', new.id, new.member_id,
      v_member || '''s PT session' || coalesce(' with ' || v_trainer, '') || ' was ' || new.status::text,
      jsonb_build_object('from', old.status, 'to', new.status,
                         'trainer_id', new.trainer_id, 'starts_at', new.starts_at));
  end if;
  return new;
end;
$$;

create or replace function migration_0103_applied() returns boolean
language sql immutable as $fn$ select true $fn$;
revoke all on function migration_0103_applied() from public, anon;
grant execute on function migration_0103_applied() to authenticated;
comment on function migration_0103_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0103.sql
