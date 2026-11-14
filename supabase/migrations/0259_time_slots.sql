-- 0259 — gym styles, phase 3: time slots and a crowd limit, the owner's way (2026-11-15).
--
-- The owner: a gym can cap how many people train at once by booking floor time in slots — and "it should be fully
-- customizable by admin … we adjust to their gym setup, not them adjusting to our system". So every rule here is
-- the owner's setting; the defaults are only a starting point:
--   slots          the gym's weekly grid: per weekday, start – end, a crowd limit. Drawn by hand, or cut from the
--                  opening hours with one length and one limit (fill_slots_from_hours), then edited day by day.
--   slot_door      'reserve'  a booking keeps a place; walk-ins come in while the slot has room (default)
--                  'required' during a slot, only members who booked it get in
--   slot_ahead_days     how far ahead members book (0 = today only … 30; default 7)
--   slot_per_day        slots one member may book in a day (1 … 6; default 1)
--   slot_cancel_minutes how late a member may cancel before the slot starts (0 … 1440; default 0 = until it starts)
--   slot_desk_override  whether the front desk may let someone in anyway when the door says no (default yes) —
--                       an explicit "Let in anyway" (desk_let_in), never the kiosk
-- The switch is `slots` (What you run), OFF at every gym until its owner turns it on, on every plan; "Time slots"
-- joins the gym styles (0256). Every read and write is a definer function; the two tables have no permissive policy.

-- ---- 1. the switch ----------------------------------------------------------------------------------------------
insert into platform_features (key, label, description, sort_order, parent_key)
values ('slots', 'Time slots and crowd limit',
        'Members book a time to come in, and you cap how many train at once. Your slots, your limit, your rules at the door.',
        84, null)
on conflict (key) do nothing;
update platform_features set default_on = false where key = 'slots' and to_regprocedure('migration_0259_applied()') is null;
select sync_platform_plan_features();
update platform_plan_features set enabled = true
 where feature_key = 'slots' and to_regprocedure('migration_0259_applied()') is null;

-- ---- 2. the owner's rules ---------------------------------------------------------------------------------------
alter table gym_settings add column if not exists slot_door text not null default 'reserve';
alter table gym_settings add column if not exists slot_ahead_days int not null default 7;
alter table gym_settings add column if not exists slot_per_day int not null default 1;
alter table gym_settings add column if not exists slot_cancel_minutes int not null default 0;
alter table gym_settings add column if not exists slot_desk_override boolean not null default true;
alter table gym_settings drop constraint if exists gym_settings_slot_rules_check;
alter table gym_settings add constraint gym_settings_slot_rules_check check (
  slot_door in ('reserve', 'required') and slot_ahead_days between 0 and 30 and slot_per_day between 1 and 6
  and slot_cancel_minutes between 0 and 1440);

-- "Time slots" is a gym style (0256).
alter table gym_settings drop constraint if exists gym_settings_gym_styles_check;
alter table gym_settings add constraint gym_settings_gym_styles_check
  check (gym_styles is null or gym_styles <@ array['open_gym', 'classes', 'pt_appointments', 'coaching_packages', 'time_slots']::text[]);

-- ---- 3. the tables ----------------------------------------------------------------------------------------------
create table if not exists slot_templates (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references gyms(id) on delete cascade default acting_gym_id(),
  day_of_week smallint not null check (day_of_week between 0 and 6),   -- 0 = Sunday, as closed_days (0153)
  starts      time not null,
  ends        time not null,
  capacity    int not null check (capacity between 1 and 1000),
  created_at  timestamptz not null default now(),
  check (ends > starts),
  unique (gym_id, day_of_week, starts)
);
alter table slot_templates enable row level security;

create table if not exists slot_bookings (
  id           uuid primary key default gen_random_uuid(),
  gym_id       uuid not null references gyms(id) on delete cascade,
  member_id    uuid not null references profiles(id) on delete cascade,
  slot_date    date not null,
  starts       time not null,
  ends         time not null,
  created_at   timestamptz not null default now(),
  cancelled_at timestamptz
);
alter table slot_bookings enable row level security;
create unique index if not exists slot_bookings_one_live
  on slot_bookings (gym_id, member_id, slot_date, starts) where cancelled_at is null;
create index if not exists slot_bookings_by_slot on slot_bookings (gym_id, slot_date, starts) where cancelled_at is null;

-- ---- 4. reading -------------------------------------------------------------------------------------------------
create or replace function gym_slot_settings() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'on', gym_module_on(current_gym_id(), 'slots'),
    'door', coalesce(gs.slot_door, 'reserve'), 'ahead_days', coalesce(gs.slot_ahead_days, 7),
    'per_day', coalesce(gs.slot_per_day, 1), 'cancel_minutes', coalesce(gs.slot_cancel_minutes, 0),
    'desk_override', coalesce(gs.slot_desk_override, true),
    'opening_time', gs.opening_time, 'closing_time', gs.closing_time, 'closed_days', coalesce(gs.closed_days, '{}'))
    from (select current_gym_id() g) x left join gym_settings gs on gs.gym_id = x.g
   where in_my_gym(x.g);
$$;
revoke all on function gym_slot_settings() from public, anon;
grant execute on function gym_slot_settings() to authenticated;

create or replace function slot_template_list()
returns table (id uuid, day_of_week smallint, starts time, ends time, capacity int)
language sql stable security definer set search_path = public as $$
  select t.id, t.day_of_week, t.starts, t.ends, t.capacity from slot_templates t
   where t.gym_id = current_gym_id() and in_my_gym(t.gym_id)
   order by t.day_of_week, t.starts;
$$;
revoke all on function slot_template_list() from public, anon;
grant execute on function slot_template_list() to authenticated;

-- How full one slot is: its bookings, plus everyone who came in during it without one (there are no check-outs).
create or replace function slot_occupancy(p_gym uuid, p_day date, p_starts time, p_ends time) returns int
language sql stable security definer set search_path = public as $$
  select (select count(*) from slot_bookings b where b.gym_id = p_gym and b.slot_date = p_day and b.starts = p_starts and b.cancelled_at is null)::int
       + (select count(distinct a.member_id) from attendance a
           where a.gym_id = p_gym and (a.check_in_time at time zone 'Asia/Manila')::date = p_day
             and (a.check_in_time at time zone 'Asia/Manila')::time >= p_starts
             and (a.check_in_time at time zone 'Asia/Manila')::time < p_ends
             and not exists (select 1 from slot_bookings b where b.gym_id = p_gym and b.member_id = a.member_id
                               and b.slot_date = p_day and b.starts = p_starts and b.cancelled_at is null))::int;
$$;
revoke all on function slot_occupancy(uuid, date, time, time) from public, anon, authenticated;

-- The slots from a day, with how full each is and the caller's own booking. Closed days have none.
create or replace function gym_slots(p_from date, p_days int)
returns table (slot_date date, starts time, ends time, capacity int, booked int, walk_ins int, my_booking uuid)
language plpgsql stable security definer set search_path = public as $$
declare v_gym uuid := current_gym_id(); v_closed smallint[];
begin
  if v_gym is null or not in_my_gym(v_gym) then return; end if;
  select coalesce(closed_days, '{}') into v_closed from gym_settings where gym_id = v_gym;
  return query
    select d::date, t.starts, t.ends, t.capacity,
           (select count(*) from slot_bookings b where b.gym_id = v_gym and b.slot_date = d::date and b.starts = t.starts and b.cancelled_at is null)::int,
           slot_occupancy(v_gym, d::date, t.starts, t.ends)
             - (select count(*) from slot_bookings b where b.gym_id = v_gym and b.slot_date = d::date and b.starts = t.starts and b.cancelled_at is null)::int,
           (select b.id from slot_bookings b where b.gym_id = v_gym and b.member_id = auth.uid() and b.slot_date = d::date
              and b.starts = t.starts and b.cancelled_at is null limit 1)
      from generate_series(p_from, p_from + greatest(0, least(coalesce(p_days, 7), 31)), interval '1 day') d
      join slot_templates t on t.gym_id = v_gym and t.day_of_week = extract(dow from d)::smallint
     where not (extract(dow from d)::smallint = any(coalesce(v_closed, '{}')))
     order by 1, 2;
end;
$$;
revoke all on function gym_slots(date, int) from public, anon;
grant execute on function gym_slots(date, int) to authenticated;

-- Who booked one day's slots, for the desk.
create or replace function gym_slot_bookings(p_day date)
returns table (id uuid, member_id uuid, member_name text, starts time, ends time, checked_in boolean)
language plpgsql stable security definer set search_path = public as $$
declare v_gym uuid := current_gym_id();
begin
  if role_in_gym(v_gym) is null or role_in_gym(v_gym) not in ('admin', 'staff') then
    raise exception 'Only the owner or the front desk sees who booked.' using errcode = '42501';
  end if;
  return query
    select b.id, b.member_id, display_name_of(b.member_id), b.starts, b.ends,
           exists (select 1 from attendance a where a.gym_id = v_gym and a.member_id = b.member_id
                     and (a.check_in_time at time zone 'Asia/Manila')::date = p_day)
      from slot_bookings b where b.gym_id = v_gym and b.slot_date = p_day and b.cancelled_at is null
     order by b.starts, 3;
end;
$$;
revoke all on function gym_slot_bookings(date) from public, anon;
grant execute on function gym_slot_bookings(date) to authenticated;

-- ---- 5. the owner sets it up ------------------------------------------------------------------------------------
create or replace function slot_owner_only() returns uuid
language plpgsql stable security definer set search_path = public as $$
begin
  if get_my_role() is distinct from 'admin' then
    raise exception 'Only the gym owner sets the time slots.' using errcode = '42501';
  end if;
  return acting_gym_id();
end;
$$;
revoke all on function slot_owner_only() from public, anon, authenticated;

create or replace function set_slot_settings(p_door text, p_ahead_days int, p_per_day int, p_cancel_minutes int, p_desk_override boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_gym uuid := slot_owner_only();
begin
  if p_door is null or p_door not in ('reserve', 'required') then raise exception 'Choose how the door treats a slot.'; end if;
  if p_ahead_days is null or p_ahead_days not between 0 and 30 then raise exception 'Members can book from today up to 30 days ahead.'; end if;
  if p_per_day is null or p_per_day not between 1 and 6 then raise exception 'From 1 to 6 slots a day per member.'; end if;
  if p_cancel_minutes is null or p_cancel_minutes not between 0 and 1440 then raise exception 'Cancel up to 24 hours before at most.'; end if;
  update gym_settings set slot_door = p_door, slot_ahead_days = p_ahead_days, slot_per_day = p_per_day,
         slot_cancel_minutes = p_cancel_minutes, slot_desk_override = coalesce(p_desk_override, true)
   where gym_id = v_gym;
end;
$$;
revoke all on function set_slot_settings(text, int, int, int, boolean) from public, anon;
grant execute on function set_slot_settings(text, int, int, int, boolean) to authenticated;

-- Add or change one slot. Slots on one day may not overlap.
create or replace function save_slot_template(p_id uuid, p_day smallint, p_starts time, p_ends time, p_capacity int)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_gym uuid := slot_owner_only(); v_id uuid;
begin
  if p_day is null or p_day not between 0 and 6 then raise exception 'Pick a day.'; end if;
  if p_starts is null or p_ends is null or p_ends <= p_starts then raise exception 'A slot ends after it starts.'; end if;
  if p_capacity is null or p_capacity not between 1 and 1000 then raise exception 'A limit from 1 to 1000 people.'; end if;
  if exists (select 1 from slot_templates t where t.gym_id = v_gym and t.day_of_week = p_day and t.id is distinct from p_id
               and (t.starts, t.ends) overlaps (p_starts, p_ends)) then
    raise exception 'That overlaps another slot on the same day.';
  end if;
  if p_id is null then
    insert into slot_templates (gym_id, day_of_week, starts, ends, capacity) values (v_gym, p_day, p_starts, p_ends, p_capacity)
    returning id into v_id;
  else
    update slot_templates set day_of_week = p_day, starts = p_starts, ends = p_ends, capacity = p_capacity
     where id = p_id and gym_id = v_gym returning id into v_id;
    if v_id is null then raise exception 'That slot is not here any more.'; end if;
  end if;
  return v_id;
end;
$$;
revoke all on function save_slot_template(uuid, smallint, time, time, int) from public, anon;
grant execute on function save_slot_template(uuid, smallint, time, time, int) to authenticated;

create or replace function delete_slot_template(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_gym uuid := slot_owner_only();
begin
  delete from slot_templates where id = p_id and gym_id = v_gym;
  if not found then raise exception 'That slot is not here any more.'; end if;
end;
$$;
revoke all on function delete_slot_template(uuid) from public, anon;
grant execute on function delete_slot_template(uuid) to authenticated;

-- Cut the week from the opening hours: one length, one limit, every open day. Replaces the grid; bookings stay.
create or replace function fill_slots_from_hours(p_minutes int, p_capacity int) returns int
language plpgsql security definer set search_path = public as $$
declare v_gym uuid := slot_owner_only(); gs record; d smallint; t time; n int := 0; v_end time; v_open time; v_close time;
begin
  if p_minutes is null or p_minutes not between 15 and 480 then raise exception 'A slot from 15 minutes to 8 hours.'; end if;
  if p_capacity is null or p_capacity not between 1 and 1000 then raise exception 'A limit from 1 to 1000 people.'; end if;
  select nullif(opening_time::text, '') o, nullif(closing_time::text, '') c, coalesce(closed_days, '{}') closed into gs
    from gym_settings where gym_id = v_gym;
  v_open := gs.o::time; v_close := gs.c::time;   -- kept as text ('HH:MM') since 0013
  if v_open is null or v_close is null or v_close <= v_open then
    raise exception 'Set your opening hours first (Settings → Hours and closed days).';
  end if;
  delete from slot_templates where gym_id = v_gym;
  for d in 0..6 loop
    continue when d = any(gs.closed);
    t := v_open;
    while t < v_close loop
      v_end := least(v_close, (t + make_interval(mins => p_minutes))::time);
      exit when v_end <= t;   -- past midnight
      insert into slot_templates (gym_id, day_of_week, starts, ends, capacity) values (v_gym, d, t, v_end, p_capacity);
      n := n + 1;
      t := v_end;
    end loop;
  end loop;
  return n;
end;
$$;
revoke all on function fill_slots_from_hours(int, int) from public, anon;
grant execute on function fill_slots_from_hours(int, int) to authenticated;

-- ---- 6. members book --------------------------------------------------------------------------------------------
create or replace function book_slot(p_date date, p_starts time) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid(); v_gym uuid := current_gym_id(); gs record; t slot_templates; m record; v_id uuid; v_now timestamp;
begin
  if v_me is null or role_in_gym(v_gym) is distinct from 'member' then
    raise exception 'Only a member books a time slot.' using errcode = '42501';
  end if;
  if not gym_module_on(v_gym, 'slots') then raise exception 'This gym does not use time slots.'; end if;
  select * into gs from gym_settings where gym_id = v_gym;
  v_now := now() at time zone 'Asia/Manila';
  if p_date < v_now::date or p_date > v_now::date + gs.slot_ahead_days then
    raise exception '%', case when gs.slot_ahead_days = 0 then 'You can book today''s slots only.'
                              else 'You can book up to ' || gs.slot_ahead_days || ' days ahead.' end;
  end if;
  if extract(dow from p_date)::smallint = any(coalesce(gs.closed_days, '{}')) then raise exception 'The gym is closed that day.'; end if;
  select * into t from slot_templates x where x.gym_id = v_gym and x.day_of_week = extract(dow from p_date)::smallint and x.starts = p_starts;
  if t.id is null then raise exception 'There is no slot at that time.'; end if;
  if (p_date + t.ends) <= v_now then raise exception 'That slot is over.'; end if;
  perform act_as_gym(v_gym);
  select * into m from current_membership_of(v_me);
  if m is null or not membership_is_usable(m.status, m.expiry_date, m.never_expires) then
    raise exception 'Your membership is not active. Renew it to book a time.';
  end if;
  perform pg_advisory_xact_lock(hashtext('slot:' || v_gym || ':' || p_date || ':' || p_starts));
  if exists (select 1 from slot_bookings b where b.gym_id = v_gym and b.member_id = v_me and b.slot_date = p_date
               and b.starts = p_starts and b.cancelled_at is null) then
    raise exception 'You already booked this slot.';
  end if;
  if (select count(*) from slot_bookings b where b.gym_id = v_gym and b.member_id = v_me and b.slot_date = p_date and b.cancelled_at is null)
       >= gs.slot_per_day then
    raise exception '%', case when gs.slot_per_day = 1 then 'You already have a slot that day. Cancel it first to pick another.'
                              else 'You already have ' || gs.slot_per_day || ' slots that day — the most this gym allows.' end;
  end if;
  if slot_occupancy(v_gym, p_date, t.starts, t.ends) >= t.capacity then
    raise exception 'That slot is full. Try another time.';
  end if;
  insert into slot_bookings (gym_id, member_id, slot_date, starts, ends) values (v_gym, v_me, p_date, t.starts, t.ends)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function book_slot(date, time) from public, anon;
grant execute on function book_slot(date, time) to authenticated;

-- A member cancels their own (up to the gym's cut-off); the owner or desk cancels any.
create or replace function cancel_slot(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare b slot_bookings; v_role text; v_cut int;
begin
  select * into b from slot_bookings where id = p_id and gym_id = current_gym_id() and cancelled_at is null for update;
  if b.id is null then raise exception 'That booking is not here any more.'; end if;
  v_role := role_in_gym(b.gym_id);
  if v_role in ('admin', 'staff') then
    null;
  elsif b.member_id = auth.uid() then
    select slot_cancel_minutes into v_cut from gym_settings where gym_id = b.gym_id;
    if (b.slot_date + b.starts) - make_interval(mins => coalesce(v_cut, 0)) <= now() at time zone 'Asia/Manila' then
      raise exception '%', case when coalesce(v_cut, 0) = 0 then 'That slot has started — it can no longer be cancelled.'
                                else 'Cancel at least ' || v_cut || ' minutes before the slot. Ask the front desk.' end;
    end if;
  else
    raise exception 'That is not yours to cancel.' using errcode = '42501';
  end if;
  update slot_bookings set cancelled_at = now() where id = p_id;
end;
$$;
revoke all on function cancel_slot(uuid) from public, anon;
grant execute on function cancel_slot(uuid) to authenticated;

-- ---- 7. the door ------------------------------------------------------------------------------------------------
-- Why a member may not come in now because of the slots, or null. Outside every slot: nothing to say.
create or replace function slot_refusal(p_member uuid, p_gym uuid, p_at timestamptz) returns text
language plpgsql stable security definer set search_path = public as $$
declare v_local timestamp := coalesce(p_at, now()) at time zone 'Asia/Manila'; t slot_templates; v_door text;
begin
  if not gym_module_on(p_gym, 'slots') then return null; end if;
  select * into t from slot_templates x where x.gym_id = p_gym and x.day_of_week = extract(dow from v_local::date)::smallint
     and x.starts <= v_local::time and v_local::time < x.ends order by x.starts limit 1;
  if t.id is null then return null; end if;
  if exists (select 1 from slot_bookings b where b.gym_id = p_gym and b.member_id = p_member and b.slot_date = v_local::date
               and b.starts = t.starts and b.cancelled_at is null) then
    return null;   -- they booked it: their place is kept
  end if;
  select slot_door into v_door from gym_settings where gym_id = p_gym;
  if v_door = 'required' then
    return 'The ' || to_char(t.starts, 'FMHH12:MI AM') || '–' || to_char(t.ends, 'FMHH12:MI AM') || ' slot is for members who booked it. '
           || display_name_of(p_member) || ' has not.';
  end if;
  if slot_occupancy(p_gym, v_local::date, t.starts, t.ends) >= t.capacity then
    return 'The ' || to_char(t.starts, 'FMHH12:MI AM') || '–' || to_char(t.ends, 'FMHH12:MI AM') || ' slot is full — only members who booked it get in.';
  end if;
  return null;
end;
$$;
revoke all on function slot_refusal(uuid, uuid, timestamptz) from public, anon, authenticated;

-- 0251's rule, plus the slots after the membership. Same signature; the attendance trigger is unchanged.
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
  return slot_refusal(p_member, p_gym, p_at);   -- 0259: the gym's time slots
end;
$$;
revoke all on function checkin_refusal(uuid, uuid, timestamptz) from public, anon;
grant execute on function checkin_refusal(uuid, uuid, timestamptz) to authenticated;

-- The desk's "Let in anyway" when only the slot said no (the owner's switch). Every other rule still holds.
create or replace function desk_let_in(p_member uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_gym uuid := current_gym_id(); v_why text; v_slot text; v_id uuid;
begin
  if role_in_gym(v_gym) is null or role_in_gym(v_gym) not in ('admin', 'staff') then
    raise exception 'Only the owner or the front desk lets someone in.' using errcode = '42501';
  end if;
  if not coalesce((select slot_desk_override from gym_settings where gym_id = v_gym), true) then
    raise exception 'At this gym the slots are firm — the desk cannot let someone in past them.';
  end if;
  v_slot := slot_refusal(p_member, v_gym, now());
  v_why  := checkin_refusal(p_member, v_gym, now());
  if v_why is not null and v_why is distinct from v_slot then raise exception '%', v_why; end if;   -- not a slot reason
  insert into attendance (member_id, gym_id, method, recorded_by, source) values (p_member, v_gym, 'manual', auth.uid(), 'desk')
  returning id into v_id;
  perform log_activity('checkin.override', 'attendance', v_id, p_member,
    display_name_of(p_member) || ' let in past the time slot', jsonb_build_object('why', v_slot), v_gym);
  return v_id;
end;
$$;
revoke all on function desk_let_in(uuid) from public, anon;
grant execute on function desk_let_in(uuid) to authenticated;

-- ---- 8. "Time slots" in the gym styles (0256's functions, with the slots switch) ----------------------------
-- What these styles would change, setting by setting. Only rows that would change; nothing written.
create or replace function gym_style_changes(p_styles text[])
returns table (setting text, label text, now_value text, next_value text)
language plpgsql stable security definer set search_path = public as $$
declare
  v_gym uuid := acting_gym_id();
  v_classes boolean; v_coaching boolean; v_class text; v_pt text; v_modes text[]; v_slots boolean;
  w_classes boolean; w_coaching boolean; w_class text; w_pt text; w_pick boolean; w_slots boolean;
begin
  if get_my_role() is distinct from 'admin' then
    raise exception 'Only the gym owner sets how the gym works.' using errcode = '42501';
  end if;
  if p_styles is null or cardinality(p_styles) = 0 then
    raise exception 'Pick at least one way your gym works.';
  end if;
  if not (p_styles <@ array['open_gym', 'classes', 'pt_appointments', 'coaching_packages', 'time_slots']::text[]) then
    raise exception 'That is not one of the gym styles.';
  end if;

  v_classes  := gym_module_on(v_gym, 'classes');
  v_coaching := gym_module_on(v_gym, 'coaching');
  v_class    := booking_approval_mode(v_gym, 'class');
  v_pt       := booking_approval_mode(v_gym, 'pt');
  select cs.modes into v_modes from coaching_settings(v_gym) cs;
  v_slots    := gym_module_on(v_gym, 'slots');

  w_classes  := 'classes' = any(p_styles);
  w_coaching := 'pt_appointments' = any(p_styles) or 'coaching_packages' = any(p_styles);
  -- A booking that is on keeps the gym's own approval choice; one that was off starts at the usual default.
  w_class := case when w_classes then (case when v_class = 'off' then 'instant' else v_class end) else 'off' end;
  w_pt    := case when 'pt_appointments' = any(p_styles) then (case when v_pt = 'off' then 'coach' else v_pt end) else 'off' end;
  w_pick  := 'coaching_packages' = any(p_styles);
  w_slots := 'time_slots' = any(p_styles);
  if w_slots and not gym_plan_allows(v_gym, 'slots') then w_slots := v_slots; end if;
  -- A part the gym's Core Fitness plan does not include cannot be switched on; it stays as it is.
  if w_classes and not gym_plan_allows(v_gym, 'classes') then w_classes := v_classes; end if;
  if w_coaching and not gym_plan_allows(v_gym, 'coaching') then w_coaching := v_coaching; end if;

  if w_classes is distinct from v_classes then
    setting := 'classes'; label := 'Classes'; now_value := gym_style_words(case when v_classes then 'on' else 'offpart' end);
    next_value := gym_style_words(case when w_classes then 'on' else 'offpart' end); return next;
  end if;
  if w_class is distinct from v_class then
    setting := 'class_booking'; label := 'Booking a class in the app'; now_value := gym_style_words(v_class);
    next_value := gym_style_words(w_class); return next;
  end if;
  if w_coaching is distinct from v_coaching then
    setting := 'coaching'; label := 'Coaches'; now_value := gym_style_words(case when v_coaching then 'on' else 'offpart' end);
    next_value := gym_style_words(case when w_coaching then 'on' else 'offpart' end); return next;
  end if;
  if w_pt is distinct from v_pt then
    setting := 'pt_booking'; label := 'Booking a 1-on-1 session in the app'; now_value := gym_style_words(v_pt);
    next_value := gym_style_words(w_pt); return next;
  end if;
  if w_pick is distinct from ('pick_pt' = any(coalesce(v_modes, '{}'))) then
    setting := 'pick_pt'; label := 'Members pick their own coach for a package';
    now_value := case when w_pick then 'No' else 'Yes' end; next_value := case when w_pick then 'Yes' else 'No' end; return next;
  end if;
  if w_slots is distinct from v_slots then
    setting := 'slots'; label := 'Time slots and crowd limit'; now_value := gym_style_words(case when v_slots then 'on' else 'offpart' end);
    next_value := gym_style_words(case when w_slots then 'on' else 'offpart' end); return next;
  end if;
  return;
end;
$$;
revoke all on function gym_style_changes(text[]) from public, anon;
grant execute on function gym_style_changes(text[]) to authenticated;

-- The owner's "Apply these": records the styles and makes exactly the changes listed above.
create or replace function apply_gym_styles(p_styles text[]) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_gym uuid := acting_gym_id();
  r record;
  v_class text; v_pt text; v_modes text[]; v_lengths int[]; v_fee text;
begin
  if get_my_role() is distinct from 'admin' then
    raise exception 'Only the gym owner sets how the gym works.' using errcode = '42501';
  end if;
  v_class := booking_approval_mode(v_gym, 'class');
  v_pt    := booking_approval_mode(v_gym, 'pt');
  select cs.modes, cs.lengths, cs.fee_mode into v_modes, v_lengths, v_fee from coaching_settings(v_gym) cs;

  for r in select * from gym_style_changes(p_styles) loop
    if r.setting = 'classes' then perform set_gym_module('classes', r.next_value = 'On');
    elsif r.setting = 'coaching' then perform set_gym_module('coaching', r.next_value = 'On');
    elsif r.setting = 'slots' then perform set_gym_module('slots', r.next_value = 'On');
    elsif r.setting = 'class_booking' then
      v_class := case r.next_value when 'Instant' then 'instant' when 'Coach approves' then 'coach' when 'Desk approves' then 'desk'
                                   when 'Coach, then desk' then 'coach_desk' else 'off' end;
    elsif r.setting = 'pt_booking' then
      v_pt := case r.next_value when 'Instant' then 'instant' when 'Coach approves' then 'coach' when 'Desk approves' then 'desk'
                                when 'Coach, then desk' then 'coach_desk' else 'off' end;
    elsif r.setting = 'pick_pt' then
      v_modes := case when r.next_value = 'Yes'
        then array(select distinct m from unnest(coalesce(v_modes, '{}') || array['pick_pt']) m)
        else array(select m from unnest(coalesce(v_modes, '{}')) m where m <> 'pick_pt') end;
      perform set_coaching_settings(v_modes, v_lengths, v_fee);
    end if;
  end loop;
  perform set_booking_approval(v_class, v_pt);

  update gym_settings set gym_styles = (select array_agg(distinct s order by s) from unnest(p_styles) s)
   where gym_id = v_gym;
  perform log_activity('gym.styles', 'gym_settings', null, null,
    'How the gym works: ' || array_to_string(p_styles, ', '), jsonb_build_object('styles', p_styles), v_gym);
end;
$$;
revoke all on function apply_gym_styles(text[]) from public, anon;
grant execute on function apply_gym_styles(text[]) to authenticated;


-- ---- 9. tenancy: the two new tables are each one gym's ----------------------------------------------------
create or replace function tenancy_gym_tables() returns text[] language sql immutable as $$
  select array['account_status_events','achievement_unlocks','achievements','activity_log',
    'ai_coach_profiles','ai_meal_guides','ai_proposals','ai_usage_days',
    'assistant_conversations','assistant_messages','attendance','body_measurements','bookings',
    'cancellation_reasons','cash_closeouts','challenge_participants','challenges','checkin_picks','class_templates',
    'class_waitlist','classes','coach_checkins','coaching_prices','coaching_standins','coachings','conversations',
    'equipment_exercises','equipment_reports','event_registrations','events','fitness_goals','freemium_trials',
    'goal_templates','guest_visits','guests','gym_equipment','gym_exercise_media','gym_goals','gym_house_rules','gym_invitations','gym_modules','gym_payment_methods','gym_photos','gym_plans',
    'gym_program_days','gym_programs','gym_settings','gym_terms_acceptances','gym_waivers','gym_workout_items','gym_workouts',
    'house_rules_acceptances','invoice_counters','member_profiles','member_share_prefs','membership_events',
    'membership_plans','membership_requests','memberships','messages',
    'notifications','payments','pending_registrations','personal_records','plan_features',
    'point_ledger','point_rules','program_enrolments','progress_photos',
    'pt_sessions','referral_codes','referrals','refund_rules','renewal_requests',
    'reward_redemptions','rewards','room_assignments','room_comments','room_leaves','room_members','room_posts',
    'room_submissions','rooms',
    'saved_resources','season_claims','season_tiers','shop_products','shop_sale_items','shop_sales',
    'squad_members','squad_weeks','squads','staff_permissions','stock_moves','streak_milestones','terms_acceptances',
    'trainer_availability','trainer_credentials','trainer_feedback','trainer_payment_methods','trainer_profiles',
    'trainer_ratings','waiver_acceptances','winback_rules','winback_sends','workout_logs','workout_plans',
    'workout_routine_exercises','workout_routine_versions','workout_routines','workout_sets',
    -- 0235: coaching house rules — each is one gym's.
    'coaching_pauses','coach_cut_settlements','coach_dues_payments',
    -- 0245: reels.
    'gym_reels','reel_likes',
    -- 0246: the gym chat.
    'gym_chat_messages','gym_chat_reactions','gym_chat_people','gym_chat_reports',
    -- 0259: time slots.
    'slot_templates','slot_bookings']::text[]
$$;

create or replace function migration_0259_applied() returns boolean language sql stable as $$ select true $$;
grant execute on function migration_0259_applied() to anon, authenticated;
