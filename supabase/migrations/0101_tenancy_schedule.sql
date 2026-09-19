-- 0101 — Classes, bookings, the waitlist, 1-on-1 sessions and trainers stay in
-- one gym.
--
-- Each function is its last definition, changed only where it touches another
-- gym: a role is the actor's role in the row's gym (gym_roles, never the global
-- profiles.role); an id from another gym reads as "not found"; a sweep with no
-- caller runs gym by gym. Deliberately NOT per gym — one body: a coach or a
-- member cannot be in two places at once, so the clash checks
-- (assert_member_free, assert_trainer_free, the overlap triggers, 0068) and
-- the double-booking index stay across gyms. They say "busy", never what or where.
--
-- Plan: docs/superpowers/plans/2026-09-20-saas-part-a-tenancy.md (Task 6)

-- True for system code (no caller: the SQL editor, pg_cron, a trigger fired by
-- one), and for a signed-in caller only when the gym is their current gym.
create or replace function in_my_gym(p_gym uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is null or p_gym = current_gym_id();
$$;

-- The actor's role in a given gym.
create or replace function role_in_gym(p_gym uuid) returns text
language sql stable security definer set search_path = public as $$
  select role::text from gym_roles where user_id = auth.uid() and gym_id = p_gym;
$$;

-- ---- cancelling and deciding ------------------------------------------------------

create or replace function cancel_booking(
  p_kind   text,
  p_id     uuid,
  p_reason text,
  p_note   text default null
) returns void
language plpgsql security definer set search_path = public as $fn$
declare
  v_gym         uuid := current_gym_id();
  v_role        text;
  v_member      uuid;
  v_trainer     uuid;
  v_status      booking_status;
  v_starts_at   timestamptz;
  v_what        text;
  v_needs_note  boolean;
  v_label       text;
  v_applies     text;
  v_actor_role  text;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to cancel a booking.';
  end if;
  if p_kind not in ('class', 'pt') then
    raise exception 'Unknown booking type.';
  end if;

  v_role := get_my_role()::text;

  -- ── The booking, and who it belongs to (this gym's only) ─────────────────
  if p_kind = 'pt' then
    select s.member_id, s.trainer_id, s.status, s.starts_at, 'personal training session'
      into v_member, v_trainer, v_status, v_starts_at, v_what
      from pt_sessions s where s.id = p_id and s.gym_id = v_gym;
  else
    select b.member_id, c.trainer_id, b.status, c.scheduled_at, coalesce(c.name, 'a class')
      into v_member, v_trainer, v_status, v_starts_at, v_what
      from bookings b join classes c on c.id = b.class_id
     where b.id = p_id and b.gym_id = v_gym;
  end if;

  if v_member is null then
    raise exception 'That booking could not be found.';
  end if;

  -- ── May this person cancel it? ───────────────────────────────────────────
  if v_member = auth.uid() then
    v_actor_role := 'member';
  elsif v_trainer is not null and v_trainer = auth.uid() and v_role = 'trainer' then
    v_actor_role := 'trainer';
  elsif is_front_desk() then
    v_actor_role := coalesce(v_role, 'staff');
  else
    raise exception 'You cannot cancel a booking that is not yours.';
  end if;

  -- ── Is it cancellable? ───────────────────────────────────────────────────
  if v_status = 'cancelled' then
    raise exception 'That booking has already been cancelled.';
  end if;
  if v_status = 'rejected' then
    raise exception 'That booking was declined and cannot be cancelled.';
  end if;
  -- A session that has already begun cannot be un-booked: it either happened or
  -- it was a no-show, and both are history rather than a cancellation. The desk
  -- is not exempt — rewriting the past is the thing this rule prevents.
  if v_starts_at is not null and v_starts_at <= now() then
    raise exception
      'That session has already started, so it can no longer be cancelled. Ask the front desk to correct the record.';
  end if;

  -- ── Is the reason real, and complete? (this gym's reasons) ───────────────
  select r.needs_note, r.label, r.applies_to
    into v_needs_note, v_label, v_applies
    from cancellation_reasons r
   where r.gym_id = v_gym and r.key = p_reason and r.is_active;

  if v_label is null then
    raise exception 'Choose a reason for cancelling.';
  end if;
  if v_applies <> 'any' and v_applies <> v_actor_role
     and not (v_applies = 'staff' and v_actor_role in ('admin', 'staff')) then
    raise exception 'That reason is not one you can give for this cancellation.';
  end if;
  -- The note is required for 'other' and is checked HERE, not in the form: a
  -- client that skips the dialog must still not be able to file a blank reason.
  if v_needs_note and coalesce(btrim(p_note), '') = '' then
    raise exception 'Please say why, in your own words.';
  end if;

  -- ── Write it ─────────────────────────────────────────────────────────────
  -- Transaction-local, so it cannot leak into the next statement on this
  -- connection. Tells the 0074 decision guards that this particular update is a
  -- checked cancellation rather than a trainer trying to set a status by hand.
  perform set_config('corefitness.cancelling', 'on', true);

  if p_kind = 'pt' then
    update pt_sessions
       set status = 'cancelled',
           cancelled_at = now(),
           cancelled_by = auth.uid(),
           cancelled_by_role = v_actor_role,
           cancellation_reason = p_reason,
           cancellation_note = nullif(btrim(p_note), '')
     where id = p_id;
  else
    update bookings
       set status = 'cancelled',
           cancelled_at = now(),
           cancelled_by = auth.uid(),
           cancelled_by_role = v_actor_role,
           cancellation_reason = p_reason,
           cancellation_note = nullif(btrim(p_note), '')
     where id = p_id;
  end if;

  -- ── Tell the other side ──────────────────────────────────────────────────
  if v_actor_role = 'member' then
    if v_trainer is not null then
      perform notify_once(
        v_trainer, 'booking',
        'A booking was cancelled',
        'Your member cancelled ' || v_what || '. Reason given: ' || v_label || '.',
        '/trainer/bookings', 'cancel:' || p_id::text || ':trainer');
    end if;
  else
    perform notify_once(
      v_member, 'booking',
      case when v_actor_role = 'trainer'
           then 'Your coach cancelled a session'
           else 'A booking was cancelled' end,
      case when v_actor_role = 'trainer'
           then 'Your coach cancelled ' || v_what || '. Reason given: ' || v_label || '. You can book another time.'
           else 'The front desk cancelled ' || v_what || '. Reason given: ' || v_label || '.' end,
      '/member/bookings', 'cancel:' || p_id::text || ':member');
  end if;
end;
$fn$;

create or replace function trg_stamp_booking_decision() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare
  v_role text := role_in_gym(new.gym_id);
begin
  if v_role = 'trainer' then
    if new.member_id is distinct from old.member_id
       or new.class_id is distinct from old.class_id then
      raise exception 'A trainer may accept or decline a booking, not reassign it.';
    end if;
  end if;

  if new.status is not distinct from old.status then
    return new;   -- not a decision; nothing to stamp
  end if;

  if coalesce(current_setting('corefitness.automated', true), '') = 'on' then
    new.decided_by      := null;
    new.decided_by_role := 'system';
    new.decided_at      := now();
    if new.status = 'rejected' then
      new.rejected_at := coalesce(new.rejected_at, now());
    end if;
    return new;
  end if;

  -- Going through cancel_booking(), which has already checked ownership, the
  -- start time and the reason, and sets the cancellation columns itself.
  if coalesce(current_setting('corefitness.cancelling', true), '') = 'on'
     and new.status = 'cancelled' then
    return new;
  end if;

  if v_role = 'trainer' and new.status not in ('approved', 'rejected') then
    raise exception 'A trainer may accept or decline a booking.';
  end if;

  new.decided_by      := auth.uid();
  new.decided_by_role := v_role;
  new.decided_at      := now();

  if new.status = 'approved' then
    new.approved_at := coalesce(new.approved_at, now());
    new.approved_by := coalesce(new.approved_by, auth.uid());
  elsif new.status = 'rejected' then
    new.rejected_at := coalesce(new.rejected_at, now());
  end if;

  return new;
end;
$fn$;

create or replace function trg_stamp_pt_decision() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare
  v_role text := role_in_gym(new.gym_id);
begin
  if v_role = 'trainer' then
    if new.member_id is distinct from old.member_id
       or new.trainer_id is distinct from old.trainer_id
       or new.starts_at is distinct from old.starts_at then
      raise exception 'A trainer may accept or decline a session, not move it.';
    end if;
  end if;

  if new.status is not distinct from old.status then
    return new;
  end if;

  if coalesce(current_setting('corefitness.automated', true), '') = 'on' then
    new.decided_by      := null;
    new.decided_by_role := 'system';
    new.decided_at      := now();
    return new;
  end if;

  if coalesce(current_setting('corefitness.cancelling', true), '') = 'on'
     and new.status = 'cancelled' then
    return new;
  end if;

  if v_role = 'trainer' and new.status not in ('approved', 'rejected') then
    raise exception 'A trainer may accept or decline a session.';
  end if;

  new.decided_by      := auth.uid();
  new.decided_by_role := v_role;
  new.decided_at      := now();

  if new.status = 'approved' then
    new.approved_at := coalesce(new.approved_at, now());
    new.approved_by := coalesce(new.approved_by, auth.uid());
  end if;

  return new;
end;
$fn$;

create or replace function trg_trainer_class_edit_guard() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare
  v_role text := role_in_gym(new.gym_id);
begin
  if v_role is distinct from 'trainer' then
    return new;   -- the desk may edit anything; this guard is about trainers
  end if;

  if tg_op = 'INSERT' then
    if new.trainer_id is distinct from auth.uid() then
      raise exception 'A trainer can only create classes they teach themselves.';
    end if;
    if new.template_id is not null then
      raise exception 'Timetable classes are generated by the gym.';
    end if;
    if new.scheduled_at is null or new.scheduled_at <= now() then
      raise exception 'Pick a time that has not passed yet.';
    end if;
    if new.capacity is null or new.capacity < 1 then
      raise exception 'A class needs room for at least one person.';
    end if;
    perform assert_trainer_free(
      new.trainer_id, new.scheduled_at,
      new.scheduled_at + make_interval(mins => new.duration_minutes),
      'class', new.id);
    return new;
  end if;

  -- UPDATE
  if new.trainer_id is distinct from old.trainer_id then
    raise exception 'Who teaches a class is set by the gym.';
  end if;
  if new.template_id is distinct from old.template_id then
    raise exception 'Timetable classes are generated by the gym.';
  end if;

  if new.scheduled_at is distinct from old.scheduled_at
     or new.duration_minutes is distinct from old.duration_minutes then
    if old.template_id is not null then
      raise exception
        'This class comes from the gym''s weekly timetable, so its time is set by the gym. You can still change its name, level, size and room.';
    end if;
    if new.scheduled_at is null or new.scheduled_at <= now() then
      raise exception 'Pick a time that has not passed yet.';
    end if;
    perform assert_trainer_free(
      new.trainer_id, new.scheduled_at,
      new.scheduled_at + make_interval(mins => new.duration_minutes),
      'class', new.id);
  end if;

  -- Never below the seats already taken (0071).
  if new.capacity < (
    select count(*) from bookings b
     where b.class_id = new.id and b.status in ('pending', 'approved')
  ) then
    raise exception 'That class already has more members booked than the size you set.';
  end if;
  if new.capacity < 1 then
    raise exception 'A class needs room for at least one person.';
  end if;

  return new;
end;
$fn$;

-- ---- seats and the waitlist ------------------------------------------------------------

create or replace function class_seats_left(p_class uuid) returns int
language sql stable security definer set search_path = public as $$
  select greatest(0, c.capacity - (select count(*) from bookings b
                                    where b.class_id = c.id and b.status in ('pending', 'approved')))::int
    from classes c where c.id = p_class and in_my_gym(c.gym_id);
$$;

create or replace function class_waitlist_status(p_classes uuid[])
returns table (class_id uuid, waiting int, my_position int)
language sql stable security definer set search_path = public as $$
  select w.class_id,
         count(*)::int,
         -- Your place in line, or NULL when you are not on it.
         nullif((select count(*)::int
                   from class_waitlist w2
                   join class_waitlist mine on mine.class_id = w2.class_id and mine.member_id = auth.uid()
                  where w2.class_id = w.class_id and w2.joined_at <= mine.joined_at), 0)
    from class_waitlist w
   where w.class_id = any(p_classes)
     and w.gym_id = current_gym_id()
     and auth.uid() is not null
   group by w.class_id;
$$;

create or replace function join_waitlist(p_class uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  c record;
  pos int;
begin
  if me is null or coalesce(get_my_role()::text, '') <> 'member' then
    raise exception 'Only members can join a waitlist' using errcode = '42501';
  end if;
  select * into c from classes where id = p_class and gym_id = current_gym_id();
  if c.id is null then raise exception 'That class no longer exists'; end if;
  if c.scheduled_at is null or c.scheduled_at <= now() then
    raise exception 'That class has already started';
  end if;
  if exists (select 1 from bookings b where b.class_id = p_class and b.member_id = me
               and b.status in ('pending', 'approved')) then
    raise exception 'You already have a place in this class';
  end if;
  if class_seats_left(p_class) > 0 then
    raise exception 'This class has a free spot — book it instead';
  end if;
  insert into class_waitlist (gym_id, class_id, member_id) values (c.gym_id, p_class, me)
  on conflict do nothing;
  select count(*)::int into pos from class_waitlist w
   where w.class_id = p_class
     and w.joined_at <= (select joined_at from class_waitlist where class_id = p_class and member_id = me);
  return pos;
end;
$$;

-- Offers go out under the class's gym, whoever freed the seat.
create or replace function waitlist_offer(p_class uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  c record;
  w record;
  n int := 0;
  stamp text := to_char(now(), 'YYYYMMDDHH24MISS');
begin
  select * into c from classes where id = p_class;
  if c.id is null or c.scheduled_at is null or c.scheduled_at <= now() then return 0; end if;
  if not in_my_gym(c.gym_id) then return 0; end if;
  if class_seats_left(p_class) = 0 then return 0; end if;
  perform act_as_gym(c.gym_id);
  for w in
    select * from class_waitlist
     where class_id = p_class
       and (notified_at is null or notified_at < now() - interval '30 minutes')
     order by joined_at
  loop
    if notify_once(
      w.member_id, 'booking', 'A spot opened up',
      format('%s on %s has a free spot. Book it before someone else does.',
             c.name, to_char(c.scheduled_at at time zone 'Asia/Manila', 'FMDay, FMMonth FMDD "at" FMHH12:MI AM')),
      '/member/book-class',
      'waitlist:' || p_class || ':' || w.member_id || ':' || stamp
    ) then
      n := n + 1;
    end if;
    update class_waitlist set notified_at = now() where class_id = p_class and member_id = w.member_id;
  end loop;
  return n;
end;
$$;

-- ---- entitlements: the booking's gym, the membership in that gym --------------------

create or replace function enforce_class_booking_entitlement() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  m record;
  p record;
  used int;
  slot_week date;
begin
  perform act_as_gym(new.gym_id);
  select * into m from current_membership_of(new.member_id);
  if m is null then
    raise exception 'You need an active membership to book a class.';
  end if;
  if not membership_is_usable(m.status, m.expiry_date, m.never_expires) then
    raise exception 'Your membership is not active. Please renew at the front desk.';
  end if;

  select * into p from membership_plans where id = m.plan_id;
  if p is null or not p.can_book_classes then
    raise exception 'Your plan does not include class booking. Upgrade at the front desk.';
  end if;

  if p.class_bookings_per_week is not null then
    select date_trunc('week', (c.scheduled_at at time zone 'Asia/Manila'))::date
      into slot_week
      from classes c where c.id = new.class_id;

    select count(*) into used
      from bookings b
      join classes c on c.id = b.class_id
     where b.member_id = new.member_id
       and b.gym_id = new.gym_id
       and b.status in ('pending', 'approved')
       and date_trunc('week', (c.scheduled_at at time zone 'Asia/Manila'))::date = slot_week;

    if used >= p.class_bookings_per_week then
      raise exception 'Your plan allows % class(es) per week. You have already booked that week.',
        p.class_bookings_per_week;
    end if;
  end if;

  return new;
end;
$$;

create or replace function enforce_pt_entitlement() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  m record;
  p record;
  used int;
  slot_month date;
begin
  if is_front_desk() then
    return new;
  end if;

  perform act_as_gym(new.gym_id);
  select * into m from current_membership_of(new.member_id);
  if m is null or not membership_is_usable(m.status, m.expiry_date, m.never_expires) then
    raise exception 'Your membership is not active. Please renew at the front desk.';
  end if;

  select * into p from membership_plans where id = m.plan_id;
  if p is null or not p.can_book_pt then
    raise exception 'Your plan does not include personal training. Upgrade at the front desk.';
  end if;

  if p.pt_sessions_per_month is not null then
    slot_month := date_trunc('month', (new.starts_at at time zone 'Asia/Manila'))::date;

    select count(*) into used
      from pt_sessions s
     where s.member_id = new.member_id
       and s.gym_id = new.gym_id
       and s.status in ('pending', 'approved')
       and date_trunc('month', (s.starts_at at time zone 'Asia/Manila'))::date = slot_month;

    if used >= p.pt_sessions_per_month then
      raise exception 'Your plan allows % personal training session(s) per month.',
        p.pt_sessions_per_month;
    end if;
  end if;

  return new;
end;
$$;

-- ---- the timetable: one gym for a signed-in caller, every gym for pg_cron --------------

drop function if exists generate_class_instances(int);
create function generate_class_instances(weeks_ahead int default 4, p_gym uuid default null)
returns int
language plpgsql security definer set search_path = public as $$
declare
  inserted_count int := 0;
  v_gym uuid := coalesce(p_gym, case when auth.uid() is not null then current_gym_id() end);
begin
  if weeks_ahead < 1 or weeks_ahead > 26 then
    raise exception 'weeks_ahead must be between 1 and 26';
  end if;
  if auth.uid() is not null and v_gym is distinct from current_gym_id() then
    raise exception 'You can only build your own gym''s timetable.';
  end if;

  with slots as (
    select
      t.gym_id,
      t.id  as template_id,
      t.name,
      t.trainer_id,
      t.level,
      t.capacity,
      t.location,
      t.duration_minutes,
      -- Walk forward from today to the horizon, keeping days matching the
      -- template's weekday, then pin the template's start time onto each.
      (d::date + t.start_time) at time zone 'Asia/Manila' as scheduled_at
    from class_templates t
    join gyms g on g.id = t.gym_id and g.status = 'active'
    cross join generate_series(
      current_date,
      current_date + (weeks_ahead * 7),
      interval '1 day'
    ) as d
    where t.active
      and (v_gym is null or t.gym_id = v_gym)
      and extract(dow from d) = t.day_of_week
  )
  insert into classes (gym_id, name, trainer_id, level, capacity, location, scheduled_at, duration_minutes, template_id, class_type)
  select gym_id, name, trainer_id, level, capacity, location, scheduled_at, duration_minutes, template_id, 'group'
  from slots
  where scheduled_at > now()
  on conflict (template_id, scheduled_at) where template_id is not null do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

-- ---- who is whose ----------------------------------------------------------------------

create or replace function is_my_trainee(p_member uuid, p_trainer uuid default null)
returns boolean
language sql stable security definer set search_path = public as $fn$
  select exists (
    select 1 from pt_sessions s
     where s.member_id = p_member
       and s.gym_id = acting_gym_id()
       and s.trainer_id = coalesce(p_trainer, auth.uid())
  ) or exists (
    select 1
      from bookings b
      join classes c on c.id = b.class_id
     where b.member_id = p_member
       and b.gym_id = acting_gym_id()
       and c.trainer_id = coalesce(p_trainer, auth.uid())
  );
$fn$;

-- A member's own schedule spans every gym (one body); the front desk sees only
-- its own gym's part of someone else's.
create or replace function member_commitments(p_member uuid)
returns table (
  source     text,
  ref_id     uuid,
  starts_at  timestamptz,
  ends_at    timestamptz,
  label      text
)
language plpgsql stable security definer set search_path = public as $fn$
declare
  v_all boolean := auth.uid() is null or p_member = auth.uid();
begin
  if auth.uid() is not null
     and p_member is distinct from auth.uid()
     and not is_front_desk() then
    raise exception 'You can only read your own schedule.';
  end if;

  return query
    select 'class'::text, b.id, c.scheduled_at,
           c.scheduled_at + make_interval(mins => c.duration_minutes),
           c.name
      from bookings b
      join classes c on c.id = b.class_id
     where b.member_id = p_member
       and b.status in ('pending', 'approved')
       and (v_all or b.gym_id = current_gym_id())
    union all
    select 'pt'::text, s.id, s.starts_at,
           s.starts_at + make_interval(mins => s.duration_minutes),
           'Personal training'
      from pt_sessions s
     where s.member_id = p_member
       and s.status in ('pending', 'approved')
       and (v_all or s.gym_id = current_gym_id());
end;
$fn$;

create or replace function may_rate_trainer(p_trainer uuid, p_member uuid default null)
returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  target uuid := coalesce(p_member, auth.uid());
  v_gym  uuid := acting_gym_id();
begin
  -- `is distinct from` and not `<>` (see 0039).
  if target is distinct from auth.uid() and not is_front_desk() then
    return false;
  end if;
  if target is null then
    return false;
  end if;

  return exists (
    -- A group class this trainer taught, in this gym, already finished.
    select 1
      from bookings b
      join classes c on c.id = b.class_id
     where b.member_id = target
       and b.gym_id = v_gym
       and c.trainer_id = p_trainer
       and b.status = 'approved'
       and c.scheduled_at is not null
       and c.scheduled_at < now()
  ) or exists (
    -- A 1-on-1 with this trainer, in this gym, already finished.
    select 1
      from pt_sessions s
     where s.member_id = target
       and s.gym_id = v_gym
       and s.trainer_id = p_trainer
       and s.status = 'approved'
       and s.starts_at < now()
  );
end;
$$;

create or replace function trainer_may_see(member uuid, category text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    -- The gym itself is not gated; see 0032's header.
    when get_my_role() in ('admin', 'staff') then true
    -- NULL-safe (0048).
    when get_my_role() is distinct from 'trainer' then false
    else coalesce(
      (
        select case category
          when 'measurements' then p.share_measurements
          when 'goals'        then p.share_goals
          when 'workouts'     then p.share_workouts
          else false
        end
        from member_share_prefs p
        where p.member_id = member
          and p.gym_id = acting_gym_id()
      ),
      -- No preferences row: shared, matching the behaviour 0032 replaced.
      category in ('measurements', 'goals', 'workouts')
    )
  end;
$$;

-- ---- the desk moves and chases 1-on-1s ----------------------------------------------------

create or replace function reassign_pt_session(
  p_session uuid,
  p_trainer uuid
) returns void
language plpgsql security definer set search_path = public as $fn$
declare
  v_gym     uuid;
  v_starts  timestamptz;
  v_minutes int;
  v_current uuid;
  v_member  uuid;
  v_status  booking_status;
  v_name    text;
begin
  if not is_front_desk() then
    raise exception 'Only the front desk can reassign a session.';
  end if;

  select s.gym_id, s.starts_at, s.duration_minutes, s.trainer_id, s.member_id, s.status
    into v_gym, v_starts, v_minutes, v_current, v_member, v_status
    from pt_sessions s where s.id = p_session and in_my_gym(s.gym_id);

  if v_starts is null then
    raise exception 'That session could not be found.';
  end if;
  if v_status not in ('pending', 'approved') then
    raise exception 'That session is already closed, so it cannot be reassigned.';
  end if;
  if v_starts <= now() then
    raise exception 'That session has already started.';
  end if;
  if p_trainer = v_current then
    raise exception 'That is already the trainer on this session.';
  end if;
  -- A coach of this gym, active here.
  if not exists (select 1 from trainer_profiles t
                   join gym_roles r on r.user_id = t.profile_id and r.gym_id = t.gym_id
                  where t.profile_id = p_trainer and t.gym_id = v_gym
                    and r.role = 'trainer' and r.status = 'active') then
    raise exception 'That trainer could not be found.';
  end if;

  -- Re-checked at the moment of the write (0083). Across gyms: one body.
  if exists (
    select 1 from pt_sessions o
     where o.trainer_id = p_trainer
       and o.id <> p_session
       and o.status in ('pending', 'approved')
       and (o.starts_at, o.starts_at + make_interval(mins => o.duration_minutes))
           overlaps (v_starts, v_starts + make_interval(mins => v_minutes))
  ) then
    raise exception 'That trainer is no longer free at this time.';
  end if;

  update pt_sessions
     set previous_trainer_id = v_current,
         trainer_id          = p_trainer,
         reassigned_at       = now(),
         reassigned_by       = auth.uid()
   where id = p_session;

  select trim(first_name || ' ' || last_name) into v_name from profiles where id = p_trainer;

  perform act_as_gym(v_gym);
  perform notify_once(p_trainer, 'booking', 'A session was assigned to you',
    'The front desk moved a personal training request to you. Please accept or decline it.',
    '/trainer/bookings', 'reassign:' || p_session::text || ':' || p_trainer::text);

  perform notify_once(v_member, 'booking', 'Your session moved to another coach',
    'The gym assigned your request to ' || coalesce(v_name, 'another coach')
      || ', who will confirm it shortly.',
    '/member/bookings', 'reassign:' || p_session::text || ':member');

  if v_current is not null then
    perform notify_once(v_current, 'booking', 'A session was moved off your book',
      'The front desk reassigned a request that had not been answered.',
      '/trainer/bookings', 'reassign:' || p_session::text || ':former');
  end if;
end;
$fn$;

create or replace function remind_trainer(p_kind text, p_id uuid)
returns boolean
language plpgsql security definer set search_path = public as $fn$
declare
  v_trainer uuid;
  v_what    text;
  v_when    timestamptz;
begin
  if not is_front_desk() then
    raise exception 'Only the front desk can send a reminder.';
  end if;

  if p_kind = 'pt' then
    select s.trainer_id, 'a personal training request', s.starts_at
      into v_trainer, v_what, v_when
      from pt_sessions s where s.id = p_id and s.status = 'pending' and in_my_gym(s.gym_id);
  elsif p_kind = 'class' then
    select c.trainer_id, coalesce(c.name, 'a class'), c.scheduled_at
      into v_trainer, v_what, v_when
      from bookings b join classes c on c.id = b.class_id
     where b.id = p_id and b.status = 'pending' and in_my_gym(b.gym_id);
  else
    raise exception 'Unknown booking type.';
  end if;

  if v_trainer is null then
    -- Either it is not pending any more, or the class has no trainer. Neither
    -- is an error worth throwing at the desk; there is simply nobody to remind.
    return false;
  end if;

  return notify_once(
    v_trainer, 'booking', 'Please review this booking',
    'A booking for ' || v_what || ' is still waiting on you'
      || case when v_when is not null
              then ', and the session is on ' || to_char(v_when at time zone 'Asia/Manila', 'FMDay FMDD Mon at FMHH12:MI am')
              else '' end
      || '. Please accept or decline it.',
    '/trainer/bookings',
    -- The date is in the key, so one reminder a day and no more.
    'remind:' || p_kind || ':' || p_id::text || ':'
      || to_char(now() at time zone 'Asia/Manila', 'YYYY-MM-DD'));
end;
$fn$;

create or replace function suggest_trainers_for_session(p_session uuid)
returns table (
  trainer_id uuid,
  trainer_name text,
  specialization text,
  /** Overlapping focus areas with what the member said they are here for. */
  shared_focus int,
  /** Sessions already on their book in the next week — a load signal. */
  upcoming_load int
)
language plpgsql stable security definer set search_path = public as $fn$
declare
  v_gym      uuid;
  v_starts   timestamptz;
  v_minutes  int;
  v_current  uuid;
  v_member   uuid;
begin
  if not is_front_desk() then
    raise exception 'Only the front desk can look for another trainer.';
  end if;

  select s.gym_id, s.starts_at, s.duration_minutes, s.trainer_id, s.member_id
    into v_gym, v_starts, v_minutes, v_current, v_member
    from pt_sessions s where s.id = p_session and in_my_gym(s.gym_id);

  if v_starts is null then
    raise exception 'That session could not be found.';
  end if;

  return query
  select
    t.profile_id,
    trim(p.first_name || ' ' || p.last_name),
    t.specialization,
    coalesce(cardinality(
      array(select unnest(coalesce(t.focus_areas, '{}'::text[]))
            intersect
            select unnest(coalesce(m.interests, '{}'::text[])))
    ), 0),
    (select count(*)::int from pt_sessions o
      where o.trainer_id = t.profile_id
        and o.status in ('pending', 'approved')
        and o.starts_at between now() and now() + interval '7 days')
    from trainer_profiles t
    join profiles p on p.id = t.profile_id
    join gym_roles r on r.user_id = t.profile_id and r.gym_id = t.gym_id
                    and r.role = 'trainer' and r.status = 'active'
    left join member_profiles m on m.profile_id = v_member and m.gym_id = v_gym
   where t.gym_id = v_gym
     and t.profile_id is distinct from v_current
     -- Works that weekday here, and the whole session fits inside the window.
     and exists (
       select 1 from trainer_availability a
        where a.trainer_id = t.profile_id
          and a.gym_id = v_gym
          and a.day_of_week = extract(dow from v_starts)::int
          and a.start_time <= v_starts::time
          and a.end_time   >= (v_starts + make_interval(mins => v_minutes))::time
     )
     -- Free then, in any gym. Half-open overlap, never `starts_at = starts_at`.
     and not exists (
       select 1 from pt_sessions o
        where o.trainer_id = t.profile_id
          and o.status in ('pending', 'approved')
          and (o.starts_at, o.starts_at + make_interval(mins => o.duration_minutes))
              overlaps (v_starts, v_starts + make_interval(mins => v_minutes))
     )
     -- And not teaching a class at the same time, in any gym.
     and not exists (
       select 1 from classes c
        where c.trainer_id = t.profile_id
          and c.scheduled_at is not null
          and (c.scheduled_at, c.scheduled_at + make_interval(mins => c.duration_minutes))
              overlaps (v_starts, v_starts + make_interval(mins => v_minutes))
     )
   order by 4 desc, 5 asc, 2;
end;
$fn$;

-- ---- the stale-request sweep: gym by gym ----------------------------------------------------

drop function if exists sweep_stale_requests();
create function sweep_stale_requests(p_gym uuid default null) returns int
language plpgsql security definer set search_path = public as $fn$
declare
  r record;
  g uuid;
  sent int := 0;
  v_admin uuid;
  hours numeric;
begin
  -- Front desk only (0071). `auth.uid() is not null and` first, so pg_cron and
  -- the SQL Editor — the intended automatic callers — are not locked out.
  if auth.uid() is not null and not is_front_desk() then
    raise exception 'Only the front desk can run the booking sweep.';
  end if;
  if auth.uid() is not null and p_gym is not null and p_gym is distinct from current_gym_id() then
    raise exception 'You can only sweep your own gym.';
  end if;

  -- Marks every write below as automatic (0071), transaction-local.
  perform set_config('corefitness.automated', 'on', true);

  -- A signed-in caller sweeps their gym; pg_cron sweeps every active gym.
  for g in
    select id from gyms
     where status = 'active'
       and id = coalesce(p_gym, case when auth.uid() is not null then current_gym_id() end, id)
  loop
    perform act_as_gym(g);

    -- ── PT sessions still pending ────────────────────────────────────────────
    for r in
      select s.id, s.trainer_id, s.member_id, s.starts_at, s.requested_at,
             extract(epoch from (now() - s.requested_at)) / 3600 as waited_hours,
             extract(epoch from (s.starts_at - now())) / 3600    as until_hours,
             trim(p.first_name || ' ' || p.last_name) as member_name
        from pt_sessions s
        join profiles p on p.id = s.member_id
       where s.status = 'pending' and s.gym_id = g
    loop
      -- Past its start and never decided: declined, honestly (0071).
      if r.starts_at < now() then
        update pt_sessions set status = 'rejected' where id = r.id;
        perform notify_once(
          r.member_id, 'booking',
          'Session request expired',
          'Your personal training request was not confirmed before the session time, so it has been closed. Please book another slot — the front desk can help.',
          '/member/bookings', 'pt:' || r.id || ':expired');
        sent := sent + 1;
        continue;
      end if;

      hours := r.waited_hours;

      if r.until_hours < 24 then
        if notify_once(r.trainer_id, 'booking', 'Session tomorrow still unconfirmed',
              r.member_name || ' is waiting on a session that starts in less than a day.',
              '/trainer/bookings', 'pt:' || r.id || ':imminent') then sent := sent + 1; end if;
        if notify_once(r.member_id, 'booking', 'Still waiting on your coach',
              'Your session is less than a day away and has not been confirmed yet. The gym has been notified.',
              '/member/bookings', 'pt:' || r.id || ':imminent:member') then sent := sent + 1; end if;
        for v_admin in select user_id from gym_roles where gym_id = g and role = 'admin' and status = 'active' loop
          if notify_once(v_admin, 'booking', 'Unconfirmed session within 24 hours',
                r.member_name || ' has a personal training request starting soon that the trainer has not answered.',
                '/bookings', 'pt:' || r.id || ':imminent:admin:' || v_admin) then sent := sent + 1; end if;
        end loop;

      elsif hours >= 72 then
        for v_admin in select user_id from gym_roles where gym_id = g and role = 'admin' and status = 'active' loop
          if notify_once(v_admin, 'booking', 'Booking request unanswered for 3 days',
                r.member_name || ' requested a session three days ago and the trainer has not responded.',
                '/bookings', 'pt:' || r.id || ':72h:' || v_admin) then sent := sent + 1; end if;
        end loop;

      elsif hours >= 48 then
        if notify_once(r.member_id, 'booking', 'Your request is still pending',
              'Your coach has not confirmed yet. You can wait, or book a different trainer for the same time.',
              '/member/book', 'pt:' || r.id || ':48h') then sent := sent + 1; end if;

      elsif hours >= 24 then
        if notify_once(r.trainer_id, 'booking', 'A member is waiting',
              r.member_name || ' asked for a session a day ago. Accept or decline so they can plan.',
              '/trainer/bookings', 'pt:' || r.id || ':24h') then sent := sent + 1; end if;
      end if;
    end loop;

    -- ── Class bookings still pending ─────────────────────────────────────────
    for r in
      select b.id, b.member_id, c.trainer_id, c.scheduled_at, c.name,
             extract(epoch from (now() - b.requested_at)) / 3600 as waited_hours,
             trim(p.first_name || ' ' || p.last_name) as member_name
        from bookings b
        join classes c on c.id = b.class_id
        join profiles p on p.id = b.member_id
       where b.status = 'pending' and c.scheduled_at is not null and b.gym_id = g
    loop
      if r.scheduled_at < now() then
        update bookings set status = 'rejected' where id = r.id;
        perform notify_once(
          r.member_id, 'booking', 'Class booking expired',
          'Your booking for ' || r.name || ' was not confirmed before the class ran.',
          '/member/bookings', 'cls:' || r.id || ':expired');
        sent := sent + 1;
        continue;
      end if;

      if r.waited_hours >= 24 and r.trainer_id is not null then
        if notify_once(r.trainer_id, 'booking', 'Seat request waiting',
              r.member_name || ' asked for a seat in ' || r.name || ' a day ago.',
              '/trainer/bookings', 'cls:' || r.id || ':24h') then sent := sent + 1; end if;
      end if;

      if r.waited_hours >= 48 then
        for v_admin in select user_id from gym_roles where gym_id = g and role = 'admin' and status = 'active' loop
          if notify_once(v_admin, 'booking', 'Class booking unanswered',
                r.member_name || ' has been waiting two days for a seat in ' || r.name || '.',
                '/bookings', 'cls:' || r.id || ':48h:' || v_admin) then sent := sent + 1; end if;
        end loop;
      end if;
    end loop;
  end loop;

  perform act_as_gym(null);
  return sent;
end;
$fn$;

-- ---- trainer figures: this gym's ---------------------------------------------------------

create or replace function trainer_month_summary(p_month date)
returns table (trainer_id uuid, first_name text, last_name text,
               pt_sessions int, pt_hours numeric, classes_led int, class_attendees int, distinct_members int)
language plpgsql stable security definer set search_path = public as $$
declare
  v_gym   uuid := current_gym_id();
  m_start date := date_trunc('month', p_month)::date;
  m_end   date := (date_trunc('month', p_month) + interval '1 month')::date;
begin
  if auth.uid() is null or not is_front_desk() then
    raise exception 'Only the gym can see trainer totals' using errcode = '42501';
  end if;
  return query
  with pt as (
    select s.trainer_id, s.member_id, s.duration_minutes
      from pt_sessions s
     where s.gym_id = v_gym
       and s.status = 'approved' and s.starts_at < now()
       and (s.starts_at at time zone 'Asia/Manila')::date >= m_start
       and (s.starts_at at time zone 'Asia/Manila')::date <  m_end
  ), cl as (
    select c.trainer_id, c.id,
           (select count(*) from bookings b where b.class_id = c.id and b.status = 'approved')::int as n
      from classes c
     where c.gym_id = v_gym
       and c.scheduled_at < now()
       and (c.scheduled_at at time zone 'Asia/Manila')::date >= m_start
       and (c.scheduled_at at time zone 'Asia/Manila')::date <  m_end
  ), members as (
    select pt.trainer_id, pt.member_id from pt
    union
    select c.trainer_id, b.member_id
      from classes c join bookings b on b.class_id = c.id and b.status = 'approved'
     where c.gym_id = v_gym
       and c.scheduled_at < now()
       and (c.scheduled_at at time zone 'Asia/Manila')::date >= m_start
       and (c.scheduled_at at time zone 'Asia/Manila')::date <  m_end
  )
  select t.profile_id, p.first_name::text, p.last_name::text,
         (select count(*) from pt where pt.trainer_id = t.profile_id)::int,
         round(coalesce((select sum(pt.duration_minutes) from pt where pt.trainer_id = t.profile_id), 0) / 60.0, 1),
         -- A class nobody attended was not led (0028's definition).
         (select count(*) from cl where cl.trainer_id = t.profile_id and cl.n > 0)::int,
         coalesce((select sum(cl.n) from cl where cl.trainer_id = t.profile_id), 0)::int,
         (select count(distinct mm.member_id) from members mm where mm.trainer_id = t.profile_id)::int
    from trainer_profiles t
    join profiles p on p.id = t.profile_id
    join gym_roles r on r.user_id = t.profile_id and r.gym_id = t.gym_id and r.status = 'active'
   where t.gym_id = v_gym
   order by p.first_name, p.last_name;
end;
$$;

-- A coach's record in the acting gym (the badges and level of that gym read it).
create or replace function trainer_stats(uid uuid)
returns table (
  sessions_delivered  int,
  distinct_members    int,
  classes_led         int,
  notes_sent          int,
  availability_windows int,
  profile_complete    boolean,
  days_active         int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*) from pt_sessions p
      where p.trainer_id = uid and p.gym_id = acting_gym_id()
        and p.status = 'approved' and p.starts_at < now())::int,
    (select count(distinct p.member_id) from pt_sessions p
      where p.trainer_id = uid and p.gym_id = acting_gym_id()
        and p.status = 'approved' and p.starts_at < now())::int,
    -- Classes that ran *and* somebody came to (0028).
    (select count(distinct c.id) from classes c
       join bookings b on b.class_id = c.id and b.status = 'approved'
      where c.trainer_id = uid and c.gym_id = acting_gym_id() and c.scheduled_at < now())::int,
    (select count(*) from notifications n
      where n.gym_id = acting_gym_id()
        and n.type in ('recommendation', 'trainer_recommendation', 'trainer_feedback')
        and n.metadata ->> 'from_trainer_id' = uid::text)::int,
    (select count(*) from trainer_availability t where t.trainer_id = uid and t.gym_id = acting_gym_id())::int,
    coalesce((select coalesce(trim(tp.specialization), '') <> ''
        and coalesce(trim(tp.bio), '') <> ''
        and pr.photo_url is not null
       from trainer_profiles tp join profiles pr on pr.id = tp.profile_id
      where tp.profile_id = uid and tp.gym_id = acting_gym_id()), false),
    (select greatest(0, (current_date - pr.created_at::date))::int
       from profiles pr where pr.id = uid);
$$;

-- Clashes are real across gyms (one body), so they are listed — but the other
-- gym's side says only "At another gym". Only this gym's coaches, and only
-- pairs with at least one side here.
create or replace function trainer_schedule_conflicts()
returns table (
  trainer_id uuid,
  a_kind text, a_id uuid, a_label text, a_starts_at timestamptz,
  b_kind text, b_id uuid, b_label text, b_starts_at timestamptz
)
language sql stable security definer set search_path = public as $fn$
  with mine as (
    select user_id from gym_roles where gym_id = acting_gym_id() and role = 'trainer'
  ), held as (
    select c.trainer_id, 'class'::text as kind, c.id,
           case when c.gym_id = acting_gym_id() then c.name else 'At another gym' end as label,
           c.gym_id = acting_gym_id() as here,
           c.scheduled_at as starts_at,
           c.scheduled_at + make_interval(mins => c.duration_minutes) as ends_at
      from classes c
     where c.trainer_id in (select user_id from mine)
       and c.scheduled_at is not null
       and c.scheduled_at > now() - interval '1 day'
    union all
    select s.trainer_id, 'pt', s.id,
           case when s.gym_id = acting_gym_id() then 'Personal training' else 'At another gym' end,
           s.gym_id = acting_gym_id(),
           s.starts_at, s.starts_at + make_interval(mins => s.duration_minutes)
      from pt_sessions s
     where s.trainer_id in (select user_id from mine)
       and s.status in ('pending', 'approved')
       and s.starts_at > now() - interval '1 day'
  )
  select a.trainer_id,
         a.kind, case when a.here then a.id end, a.label, a.starts_at,
         b.kind, case when b.here then b.id end, b.label, b.starts_at
    from held a
    join held b
      on b.trainer_id = a.trainer_id
     and (a.kind, a.id) < (b.kind, b.id)   -- each pair once, never a row with itself
     and (a.starts_at, a.ends_at) overlaps (b.starts_at, b.ends_at)
   where a.here or b.here
   order by a.starts_at;
$fn$;

create or replace function trainer_credential_summary()
returns table (trainer_id uuid, total int, verified int, pending int, rejected int)
language sql stable security definer set search_path = public as $fn$
  select c.trainer_id,
         count(*)::int,
         count(*) filter (where c.status = 'verified')::int,
         count(*) filter (where c.status = 'pending')::int,
         count(*) filter (where c.status = 'rejected')::int
    from trainer_credentials c
   where get_my_role() = 'admin'
     and c.gym_id = current_gym_id()
   group by c.trainer_id;
$fn$;

create or replace function gym_traffic(p_days int default 30)
returns table (dow int, band text, visits int, weeks int)
language sql stable security definer set search_path = public as $fn$
  with w as (
    select (now() at time zone 'Asia/Manila')::date as today,
           greatest(7, least(coalesce(p_days, 30), 180)) as days
  ),
  hits as (
    select extract(dow from (a.check_in_time at time zone 'Asia/Manila'))::int as dow,
           extract(hour from (a.check_in_time at time zone 'Asia/Manila'))::int as h
      from attendance a, w
     where auth.uid() is not null
       and a.gym_id = current_gym_id()
       and (a.check_in_time at time zone 'Asia/Manila')::date > w.today - w.days
       and (a.check_in_time at time zone 'Asia/Manila')::date <= w.today
  ),
  banded as (
    select dow, case when h < 8 then '6am' when h < 11 then '9am' when h < 14 then '12pm'
                     when h < 17 then '3pm' when h < 20 then '6pm' else '9pm' end as band
      from hits
  ),
  days as (
    select extract(dow from d)::int as dow, count(*)::int as n
      from w, generate_series(w.today - w.days + 1, w.today, interval '1 day') d
     group by 1
  )
  select b.dow, b.band, count(*)::int, coalesce(max(days.n), 0)
    from banded b left join days on days.dow = b.dow
   group by b.dow, b.band
$fn$;

create or replace function migration_0101_applied() returns boolean
language sql immutable as $fn$ select true $fn$;
revoke all on function migration_0101_applied() from public, anon;
grant execute on function migration_0101_applied() to authenticated;
comment on function migration_0101_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0101.sql
