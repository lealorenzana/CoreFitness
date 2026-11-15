-- 0260 — gym styles, phase 4: repeat bookings, no-shows and late cancels, every rule the owner's (2026-11-15).
-- Spec: docs/superpowers/specs/2026-11-15-phase4-repeats-noshows-design.md
--
-- The owner: "fully customizable by admin — we adjust to their gym setup, not them adjusting to our system."
--   repeats   (switch, off at every gym) who may set a repeat (member / coach / desk, any mix) and how it repeats
--             (a number of weeks, up to the owner's maximum, or until stopped). Every week is its own booking,
--             booked as the person who set the repeat would book it; a refused week is recorded, never skipped.
--   late      a "cancel up to N minutes before" per kind (classes, 1-on-1, slots — 0259's slot_cancel_minutes is
--             the slot one), all 0 = until it starts. Inside it a member's cancel is blocked, or goes through
--             marked late (counts toward the pause), or goes through marked late and never counts. The desk and
--             the coach are never late.
--   noshows   (switch, off at every gym) auto by check-in within a window around the session / by hand / auto for
--             classes and slots and the coach for 1-on-1 / off. Only sessions that start after the owner turned it
--             on are judged. A 1-on-1 the coach has not answered stays unmarked and the coach is reminded.
--             Effects, each the owner's: record and tell; counts as used (today's quota behaviour); a booking
--             pause after N in M days for D days. Never points. Packages use nothing up (they are monthly).
--             Undoing a no-show undoes its effects.

-- ---- 1. the two switches ----------------------------------------------------------------------------------------
insert into platform_features (key, label, description, sort_order, parent_key) values
  ('repeats', 'Repeat bookings', 'A booking repeats every week — the same class, coach or time. You choose who sets it up and for how long.', 85, null),
  ('noshows', 'No-shows and late cancels', 'Mark who came and who did not, and decide what happens after a no-show. Your rules.', 86, null)
on conflict (key) do nothing;
update platform_features set default_on = false
 where key in ('repeats', 'noshows') and to_regprocedure('migration_0260_applied()') is null;
select sync_platform_plan_features();
update platform_plan_features set enabled = true
 where feature_key in ('repeats', 'noshows') and to_regprocedure('migration_0260_applied()') is null;

-- ---- 2. the owner's rules ---------------------------------------------------------------------------------------
alter table gym_settings add column if not exists repeat_who text[] not null default '{member}';
alter table gym_settings add column if not exists repeat_kind text not null default 'weeks';
alter table gym_settings add column if not exists repeat_max_weeks int not null default 4;
alter table gym_settings add column if not exists repeat_ahead_days int not null default 7;
alter table gym_settings add column if not exists class_cancel_minutes int not null default 0;
alter table gym_settings add column if not exists pt_cancel_minutes int not null default 0;
alter table gym_settings add column if not exists late_cancel_mode text not null default 'mark';
alter table gym_settings add column if not exists noshow_mode text not null default 'auto_coach';
alter table gym_settings add column if not exists noshow_window_minutes int not null default 60;
alter table gym_settings add column if not exists noshow_tell boolean not null default true;
alter table gym_settings add column if not exists noshow_counts_used boolean not null default true;
alter table gym_settings add column if not exists noshow_pause boolean not null default false;
alter table gym_settings add column if not exists noshow_pause_count int not null default 3;
alter table gym_settings add column if not exists noshow_pause_within_days int not null default 30;
alter table gym_settings add column if not exists noshow_pause_days int not null default 7;
alter table gym_settings add column if not exists noshow_since timestamptz;
alter table gym_settings drop constraint if exists gym_settings_phase4_rules_check;
alter table gym_settings add constraint gym_settings_phase4_rules_check check (
  repeat_who <@ array['member', 'coach', 'desk']::text[]
  and repeat_kind in ('weeks', 'until_stopped') and repeat_max_weeks between 2 and 12 and repeat_ahead_days between 1 and 28
  and class_cancel_minutes between 0 and 1440 and pt_cancel_minutes between 0 and 1440
  and late_cancel_mode in ('block', 'mark', 'mark_free')
  and noshow_mode in ('auto', 'hand', 'auto_coach', 'off') and noshow_window_minutes between 0 and 240
  and noshow_pause_count between 1 and 10 and noshow_pause_within_days between 7 and 180 and noshow_pause_days between 1 and 60);

-- ---- 3. the marks, on each kind of booking ----------------------------------------------------------------------
create table if not exists booking_repeats (
  id               uuid primary key default gen_random_uuid(),
  gym_id           uuid not null references gyms(id) on delete cascade,
  member_id        uuid not null references profiles(id) on delete cascade,
  kind             text not null check (kind in ('class', 'pt', 'slot')),
  template_id      uuid,
  trainer_id       uuid references profiles(id) on delete set null,
  weekday          smallint not null check (weekday between 0 and 6),
  starts           time not null,
  duration_minutes int,
  first_date       date not null,
  weeks            int check (weeks is null or weeks between 2 and 12),   -- null = until stopped
  created_by       uuid not null references profiles(id) on delete cascade,
  created_by_role  text not null check (created_by_role in ('member', 'coach', 'desk')),
  created_at       timestamptz not null default now(),
  stopped_at       timestamptz,
  stopped_by       uuid references profiles(id) on delete set null,
  stop_reason      text,
  unique (gym_id, id),
  foreign key (gym_id, template_id) references class_templates (gym_id, id) on delete cascade
);
alter table booking_repeats enable row level security;
create index if not exists booking_repeats_live on booking_repeats (gym_id) where stopped_at is null;

create table if not exists booking_repeat_weeks (
  repeat_id  uuid not null,
  gym_id     uuid not null references gyms(id) on delete cascade,
  week_date  date not null,
  booking_id uuid,
  outcome    text not null check (outcome in ('booked', 'refused')),
  message    text,
  created_at timestamptz not null default now(),
  primary key (repeat_id, week_date),
  foreign key (gym_id, repeat_id) references booking_repeats (gym_id, id) on delete cascade
);
alter table booking_repeat_weeks enable row level security;

create table if not exists booking_pauses (
  id            uuid primary key default gen_random_uuid(),
  gym_id        uuid not null references gyms(id) on delete cascade,
  member_id     uuid not null references profiles(id) on delete cascade,
  since         timestamptz not null,           -- the counting window this pause came from
  created_at    timestamptz not null default now(),
  until         timestamptz not null,
  reason        text not null,
  auto          boolean not null default true,
  lifted_at     timestamptz,
  lifted_by     uuid references profiles(id) on delete set null,
  lifted_reason text
);
alter table booking_pauses enable row level security;
create index if not exists booking_pauses_by_member on booking_pauses (gym_id, member_id);

alter table bookings      add column if not exists attended text check (attended in ('came', 'no_show'));
alter table bookings      add column if not exists attended_at timestamptz;
alter table bookings      add column if not exists attended_by uuid references profiles(id) on delete set null;
alter table bookings      add column if not exists attended_by_role text;
alter table bookings      add column if not exists late_cancel boolean not null default false;
alter table bookings      add column if not exists repeat_id uuid;
alter table pt_sessions   add column if not exists attended text check (attended in ('came', 'no_show'));
alter table pt_sessions   add column if not exists attended_at timestamptz;
alter table pt_sessions   add column if not exists attended_by uuid references profiles(id) on delete set null;
alter table pt_sessions   add column if not exists attended_by_role text;
alter table pt_sessions   add column if not exists late_cancel boolean not null default false;
alter table pt_sessions   add column if not exists repeat_id uuid;
alter table slot_bookings add column if not exists attended text check (attended in ('came', 'no_show'));
alter table slot_bookings add column if not exists attended_at timestamptz;
alter table slot_bookings add column if not exists attended_by uuid references profiles(id) on delete set null;
alter table slot_bookings add column if not exists attended_by_role text;
alter table slot_bookings add column if not exists late_cancel boolean not null default false;
alter table slot_bookings add column if not exists repeat_id uuid;
alter table slot_bookings add column if not exists cancelled_by_role text;
-- Tenancy (0097): a gym-to-gym key carries gym_id. Deleting a repeat clears only repeat_id (PG 15+).
alter table bookings drop constraint if exists bookings_repeat_fk;
alter table bookings add constraint bookings_repeat_fk foreign key (gym_id, repeat_id)
  references booking_repeats (gym_id, id) on delete set null (repeat_id);
alter table pt_sessions drop constraint if exists pt_sessions_repeat_fk;
alter table pt_sessions add constraint pt_sessions_repeat_fk foreign key (gym_id, repeat_id)
  references booking_repeats (gym_id, id) on delete set null (repeat_id);
alter table slot_bookings drop constraint if exists slot_bookings_repeat_fk;
alter table slot_bookings add constraint slot_bookings_repeat_fk foreign key (gym_id, repeat_id)
  references booking_repeats (gym_id, id) on delete set null (repeat_id);

-- The app cannot write a mark: members may update their own booking row (0016) and RLS filters rows, not columns.
-- SECURITY INVOKER on purpose — inside the definer functions below, current_user is the owner and passes.
create or replace function trg_booking_marks_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if tg_op = 'INSERT' then
    new.attended := null; new.attended_at := null; new.attended_by := null; new.attended_by_role := null;
    new.late_cancel := false; new.repeat_id := null;
    return new;
  end if;
  if new.attended is distinct from old.attended or new.attended_at is distinct from old.attended_at
     or new.attended_by is distinct from old.attended_by or new.attended_by_role is distinct from old.attended_by_role
     or new.late_cancel is distinct from old.late_cancel or new.repeat_id is distinct from old.repeat_id then
    raise exception 'Whether someone came is set by their coach or the front desk.' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists a0_booking_marks_guard on bookings;
create trigger a0_booking_marks_guard before insert or update on bookings
  for each row execute function trg_booking_marks_guard();
drop trigger if exists a0_booking_marks_guard on pt_sessions;
create trigger a0_booking_marks_guard before insert or update on pt_sessions
  for each row execute function trg_booking_marks_guard();

-- ---- 4. small helpers (closed to every role) --------------------------------------------------------------------
-- Did they check in between these two moments? Never "any check-in that day".
create or replace function came_in_between(p_gym uuid, p_member uuid, p_from timestamptz, p_to timestamptz) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from attendance a where a.gym_id = p_gym and a.member_id = p_member
                   and a.check_in_time >= p_from and a.check_in_time < p_to);
$$;
revoke all on function came_in_between(uuid, uuid, timestamptz, timestamptz) from public, anon, authenticated;

-- One booking, whatever its kind: who, the coach, when, and words for it.
create or replace function booking_facts(p_kind text, p_id uuid)
returns table (gym_id uuid, member_id uuid, coach_id uuid, starts_at timestamptz, ends_at timestamptz,
               live boolean, attended text, what text)
language plpgsql stable security definer set search_path = public as $$
begin
  if p_kind = 'class' then
    return query select b.gym_id, b.member_id, c.trainer_id, c.scheduled_at,
      c.scheduled_at + make_interval(mins => coalesce(c.duration_minutes, 60)), b.status = 'approved', b.attended,
      coalesce(c.name, 'a class') || ' on ' || to_char(c.scheduled_at at time zone 'Asia/Manila', 'Mon DD, FMHH12:MI AM')
      from bookings b join classes c on c.id = b.class_id where b.id = p_id;
  elsif p_kind = 'pt' then
    return query select s.gym_id, s.member_id, s.trainer_id, s.starts_at,
      s.starts_at + make_interval(mins => coalesce(s.duration_minutes, 60)), s.status = 'approved', s.attended,
      '1-on-1 with ' || coalesce(display_name_of(s.trainer_id), 'your coach') || ' on '
        || to_char(s.starts_at at time zone 'Asia/Manila', 'Mon DD, FMHH12:MI AM')
      from pt_sessions s where s.id = p_id;
  elsif p_kind = 'slot' then
    return query select b.gym_id, b.member_id, null::uuid, (b.slot_date + b.starts) at time zone 'Asia/Manila',
      (b.slot_date + b.ends) at time zone 'Asia/Manila', b.cancelled_at is null, b.attended,
      'the ' || to_char(b.starts, 'FMHH12:MI AM') || '–' || to_char(b.ends, 'FMHH12:MI AM') || ' slot on '
        || to_char(b.slot_date, 'Mon DD')
      from slot_bookings b where b.id = p_id;
  end if;
end;
$$;
revoke all on function booking_facts(text, uuid) from public, anon, authenticated;

-- The no-shows and counted late cancels of one member in (p_from, p_to].
create or replace function counted_misses(p_gym uuid, p_member uuid, p_from timestamptz, p_to timestamptz) returns int
language plpgsql stable security definer set search_path = public as $$
declare v_late boolean := coalesce((select late_cancel_mode = 'mark' from gym_settings where gym_id = p_gym), true);
begin
  return
      (select count(*) from bookings b join classes c on c.id = b.class_id
        where b.gym_id = p_gym and b.member_id = p_member and b.attended = 'no_show'
          and c.scheduled_at > p_from and c.scheduled_at <= p_to)
    + (select count(*) from pt_sessions s
        where s.gym_id = p_gym and s.member_id = p_member and s.attended = 'no_show'
          and s.starts_at > p_from and s.starts_at <= p_to)
    + (select count(*) from slot_bookings b
        where b.gym_id = p_gym and b.member_id = p_member and b.attended = 'no_show'
          and ((b.slot_date + b.starts) at time zone 'Asia/Manila') > p_from
          and ((b.slot_date + b.starts) at time zone 'Asia/Manila') <= p_to)
    + case when v_late then
        (select count(*) from bookings b where b.gym_id = p_gym and b.member_id = p_member and b.late_cancel
            and b.cancelled_at > p_from and b.cancelled_at <= p_to)
      + (select count(*) from pt_sessions s where s.gym_id = p_gym and s.member_id = p_member and s.late_cancel
            and s.cancelled_at > p_from and s.cancelled_at <= p_to)
      + (select count(*) from slot_bookings b where b.gym_id = p_gym and b.member_id = p_member and b.late_cancel
            and b.cancelled_at > p_from and b.cancelled_at <= p_to)
      else 0 end;
end;
$$;
revoke all on function counted_misses(uuid, uuid, timestamptz, timestamptz) from public, anon, authenticated;

-- Why this member may not book for themselves now, or null.
create or replace function booking_pause_refusal(p_member uuid, p_gym uuid) returns text
language sql stable security definer set search_path = public as $$
  select 'You can''t book in the app until ' || to_char(p.until at time zone 'Asia/Manila', 'Mon DD, FMHH12:MI AM')
         || ' — ' || p.reason || '. The front desk can still book for you.'
    from booking_pauses p
   where p.gym_id = p_gym and p.member_id = p_member and p.lifted_at is null and p.until > now()
   order by p.until desc limit 1;
$$;
revoke all on function booking_pause_refusal(uuid, uuid) from public, anon, authenticated;

-- After a no-show or a counted late cancel: a pause, if the owner uses one and the count is reached.
create or replace function consider_booking_pause(p_gym uuid, p_member uuid) returns void
language plpgsql security definer set search_path = public as $$
declare gs gym_settings; v_from timestamptz; v_n int; v_reason text; v_until timestamptz;
begin
  select * into gs from gym_settings where gym_id = p_gym;
  if gs.gym_id is null or not gs.noshow_pause or not gym_module_on(p_gym, 'noshows') or gs.noshow_mode = 'off' then return; end if;
  if booking_pause_refusal(p_member, p_gym) is not null then return; end if;
  -- Counting starts again after each pause.
  v_from := greatest(now() - make_interval(days => gs.noshow_pause_within_days),
                     coalesce((select max(created_at) from booking_pauses where gym_id = p_gym and member_id = p_member
                                 and lifted_reason is distinct from 'A no-show was undone'), '-infinity'));
  v_n := counted_misses(p_gym, p_member, v_from, now());
  if v_n < gs.noshow_pause_count then return; end if;
  v_reason := v_n || case when gs.late_cancel_mode = 'mark' then ' no-shows or late cancels' else ' no-shows' end
              || ' in ' || gs.noshow_pause_within_days || ' days';
  v_until := now() + make_interval(days => gs.noshow_pause_days);
  insert into booking_pauses (gym_id, member_id, since, until, reason, auto) values (p_gym, p_member, v_from, v_until, v_reason, true);
  perform notify_once(p_member, 'booking', 'Booking in the app is paused',
    'After ' || v_reason || ', you can''t book in the app until '
      || to_char(v_until at time zone 'Asia/Manila', 'Mon DD, FMHH12:MI AM') || '. The front desk can still book for you.',
    '/member/bookings', 'pause:' || p_member || ':' || to_char(now(), 'YYYYMMDDHH24MISS'), p_gym);
  perform log_activity('booking.pause', 'booking_pauses', null, p_member,
    display_name_of(p_member) || ': booking paused — ' || v_reason, jsonb_build_object('until', v_until), p_gym);
end;
$$;
revoke all on function consider_booking_pause(uuid, uuid) from public, anon, authenticated;

-- A booking was just marked a no-show: tell (if the owner says so), then the pause.
create or replace function noshow_effects(p_kind text, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare f record; v_tell boolean;
begin
  select * into f from booking_facts(p_kind, p_id);
  if f.member_id is null then return; end if;
  v_tell := coalesce((select noshow_tell from gym_settings where gym_id = f.gym_id), true);
  if v_tell then
    perform notify_once(f.member_id, 'booking', 'Marked as a no-show',
      'You were booked for ' || f.what || ' and did not come. If you were there, tell the front desk or your coach.',
      '/member/bookings', 'noshow:' || p_kind || ':' || p_id || ':' || to_char(now(), 'YYYYMMDDHH24MISS'), f.gym_id);
    if f.coach_id is not null then
      perform notify_once(f.coach_id, 'booking', 'A no-show',
        display_name_of(f.member_id) || ' did not come to ' || f.what || '.',
        '/trainer/pt/' || f.member_id, 'noshow-coach:' || p_kind || ':' || p_id || ':' || to_char(now(), 'YYYYMMDDHH24MISS'), f.gym_id);
    end if;
  end if;
  perform consider_booking_pause(f.gym_id, f.member_id);
end;
$$;
revoke all on function noshow_effects(text, uuid) from public, anon, authenticated;

-- A no-show was undone: an automatic pause it helped cause is lifted if the count no longer reaches it.
create or replace function undo_noshow_effects(p_kind text, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare f record; gs gym_settings; p booking_pauses;
begin
  select * into f from booking_facts(p_kind, p_id);
  select * into gs from gym_settings where gym_id = f.gym_id;
  if coalesce(gs.noshow_tell, true) then
    perform notify_once(f.member_id, 'booking', 'No-show removed',
      'You were marked as there for ' || f.what || '. The no-show is off your record.',
      '/member/bookings', 'noshow-undo:' || p_kind || ':' || p_id || ':' || to_char(now(), 'YYYYMMDDHH24MISS'), f.gym_id);
  end if;
  for p in select * from booking_pauses where gym_id = f.gym_id and member_id = f.member_id and auto
             and lifted_at is null and until > now() loop
    if counted_misses(f.gym_id, f.member_id, p.since, p.created_at) < gs.noshow_pause_count then
      update booking_pauses set lifted_at = now(), lifted_by = auth.uid(), lifted_reason = 'A no-show was undone'
       where id = p.id;
      perform notify_once(f.member_id, 'booking', 'You can book again',
        'A no-show was undone, so booking in the app is open again.', '/member/bookings', 'unpause:' || p.id, f.gym_id);
    end if;
  end loop;
end;
$$;
revoke all on function undo_noshow_effects(text, uuid) from public, anon, authenticated;

-- ---- 5. reading: the gym's rules, for Settings, the booking screens and the Terms --------------------------------
create or replace function gym_booking_rules() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'repeats_on', gym_module_on(x.g, 'repeats'), 'noshows_on', gym_module_on(x.g, 'noshows'),
    'repeat_who', coalesce(gs.repeat_who, '{member}'), 'repeat_kind', coalesce(gs.repeat_kind, 'weeks'),
    'repeat_max_weeks', coalesce(gs.repeat_max_weeks, 4), 'repeat_ahead_days', coalesce(gs.repeat_ahead_days, 7),
    'class_cancel_minutes', coalesce(gs.class_cancel_minutes, 0), 'pt_cancel_minutes', coalesce(gs.pt_cancel_minutes, 0),
    'slot_cancel_minutes', coalesce(gs.slot_cancel_minutes, 0), 'late_cancel_mode', coalesce(gs.late_cancel_mode, 'mark'),
    'noshow_mode', coalesce(gs.noshow_mode, 'auto_coach'), 'noshow_window_minutes', coalesce(gs.noshow_window_minutes, 60),
    'noshow_tell', coalesce(gs.noshow_tell, true), 'noshow_counts_used', coalesce(gs.noshow_counts_used, true),
    'noshow_pause', coalesce(gs.noshow_pause, false), 'noshow_pause_count', coalesce(gs.noshow_pause_count, 3),
    'noshow_pause_within_days', coalesce(gs.noshow_pause_within_days, 30), 'noshow_pause_days', coalesce(gs.noshow_pause_days, 7),
    'my_pause', (select jsonb_build_object('until', p.until, 'reason', p.reason) from booking_pauses p
                  where p.gym_id = x.g and p.member_id = auth.uid() and p.lifted_at is null and p.until > now()
                  order by p.until desc limit 1))
    from (select current_gym_id() g) x left join gym_settings gs on gs.gym_id = x.g
   where in_my_gym(x.g);
$$;
revoke all on function gym_booking_rules() from public, anon;
grant execute on function gym_booking_rules() to authenticated;

-- A member's no-shows, late cancels and active pause: the member themself, the desk, or one of their coaches.
create or replace function booking_record(p_member uuid, p_days int default 90)
returns table (kind text, id uuid, what text, starts_at timestamptz, mark text, marked_by_role text, marked_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare v_gym uuid := current_gym_id(); v_role text := role_in_gym(v_gym); v_from timestamptz;
begin
  if p_member is null or not (p_member = auth.uid() or v_role in ('admin', 'staff')
                              or (v_role = 'trainer' and is_my_trainee(p_member))) then
    raise exception 'That record is not yours to see.' using errcode = '42501';
  end if;
  v_from := now() - make_interval(days => greatest(1, least(coalesce(p_days, 90), 366)));
  return query
    select 'class'::text, b.id, f.what, f.starts_at,
           case when b.late_cancel then 'late_cancel' else b.attended end,
           case when b.late_cancel then b.cancelled_by_role else b.attended_by_role end,
           case when b.late_cancel then b.cancelled_at else b.attended_at end
      from bookings b join classes c on c.id = b.class_id, lateral booking_facts('class', b.id) f
     where b.gym_id = v_gym and b.member_id = p_member and (b.attended is not null or b.late_cancel) and c.scheduled_at >= v_from
    union all
    select 'pt', s.id, f.what, f.starts_at,
           case when s.late_cancel then 'late_cancel' else s.attended end,
           case when s.late_cancel then s.cancelled_by_role else s.attended_by_role end,
           case when s.late_cancel then s.cancelled_at else s.attended_at end
      from pt_sessions s, lateral booking_facts('pt', s.id) f
     where s.gym_id = v_gym and s.member_id = p_member and (s.attended is not null or s.late_cancel) and s.starts_at >= v_from
    union all
    select 'slot', b.id, f.what, f.starts_at,
           case when b.late_cancel then 'late_cancel' else b.attended end,
           case when b.late_cancel then b.cancelled_by_role else b.attended_by_role end,
           case when b.late_cancel then b.cancelled_at else b.attended_at end
      from slot_bookings b, lateral booking_facts('slot', b.id) f
     where b.gym_id = v_gym and b.member_id = p_member and (b.attended is not null or b.late_cancel) and b.slot_date >= v_from::date
     order by 4 desc;
end;
$$;
revoke all on function booking_record(uuid, int) from public, anon;
grant execute on function booking_record(uuid, int) to authenticated;

create or replace function booking_pause_of(p_member uuid)
returns table (id uuid, until timestamptz, reason text, auto boolean)
language plpgsql stable security definer set search_path = public as $$
declare v_gym uuid := current_gym_id(); v_role text := role_in_gym(v_gym);
begin
  if p_member is null or not (p_member = auth.uid() or v_role in ('admin', 'staff')
                              or (v_role = 'trainer' and is_my_trainee(p_member))) then
    raise exception 'That record is not yours to see.' using errcode = '42501';
  end if;
  return query select p.id, p.until, p.reason, p.auto from booking_pauses p
    where p.gym_id = v_gym and p.member_id = p_member and p.lifted_at is null and p.until > now() order by p.until desc;
end;
$$;
revoke all on function booking_pause_of(uuid) from public, anon;
grant execute on function booking_pause_of(uuid) to authenticated;

-- ---- 6. the owner sets the rules --------------------------------------------------------------------------------
create or replace function phase4_owner_only() returns uuid
language plpgsql stable security definer set search_path = public as $$
begin
  if get_my_role() is distinct from 'admin' then
    raise exception 'Only the gym owner sets the booking rules.' using errcode = '42501';
  end if;
  return acting_gym_id();
end;
$$;
revoke all on function phase4_owner_only() from public, anon, authenticated;

create or replace function set_repeat_rules(p_who text[], p_kind text, p_max_weeks int, p_ahead_days int) returns void
language plpgsql security definer set search_path = public as $$
declare v_gym uuid := phase4_owner_only();
begin
  if p_who is null or not (p_who <@ array['member', 'coach', 'desk']::text[]) or cardinality(p_who) = 0 then
    raise exception 'Choose who can set a repeat: members, coaches, the front desk, or any mix.';
  end if;
  if p_kind is null or p_kind not in ('weeks', 'until_stopped') then raise exception 'Choose a number of weeks or until stopped.'; end if;
  if p_max_weeks is null or p_max_weeks not between 2 and 12 then raise exception 'Repeat for 2 to 12 weeks at most.'; end if;
  if p_ahead_days is null or p_ahead_days not between 1 and 28 then raise exception 'Book ahead 1 to 28 days.'; end if;
  update gym_settings set repeat_who = (select array_agg(distinct w order by w) from unnest(p_who) w),
         repeat_kind = p_kind, repeat_max_weeks = p_max_weeks, repeat_ahead_days = p_ahead_days
   where gym_id = v_gym;
end;
$$;
revoke all on function set_repeat_rules(text[], text, int, int) from public, anon;
grant execute on function set_repeat_rules(text[], text, int, int) to authenticated;

create or replace function set_cancel_rules(p_class int, p_pt int, p_slot int, p_mode text) returns void
language plpgsql security definer set search_path = public as $$
declare v_gym uuid := phase4_owner_only();
begin
  if p_class is null or p_pt is null or p_slot is null
     or p_class not between 0 and 1440 or p_pt not between 0 and 1440 or p_slot not between 0 and 1440 then
    raise exception 'Cancel up to 24 hours before at most (0 = until it starts).';
  end if;
  if p_mode is null or p_mode not in ('block', 'mark', 'mark_free') then raise exception 'Choose what a late cancel does.'; end if;
  update gym_settings set class_cancel_minutes = p_class, pt_cancel_minutes = p_pt, slot_cancel_minutes = p_slot,
         late_cancel_mode = p_mode
   where gym_id = v_gym;
end;
$$;
revoke all on function set_cancel_rules(int, int, int, text) from public, anon;
grant execute on function set_cancel_rules(int, int, int, text) to authenticated;

create or replace function set_noshow_rules(p_mode text, p_window int, p_tell boolean, p_counts_used boolean,
                                            p_pause boolean, p_count int, p_within_days int, p_days int) returns void
language plpgsql security definer set search_path = public as $$
declare v_gym uuid := phase4_owner_only(); v_old text;
begin
  if p_mode is null or p_mode not in ('auto', 'hand', 'auto_coach', 'off') then raise exception 'Choose how a no-show is decided.'; end if;
  if p_window is null or p_window not between 0 and 240 then raise exception 'A check-in counts from 0 to 240 minutes before.'; end if;
  if p_count is null or p_count not between 1 and 10 then raise exception 'Pause after 1 to 10.'; end if;
  if p_within_days is null or p_within_days not between 7 and 180 then raise exception 'Count within 7 to 180 days.'; end if;
  if p_days is null or p_days not between 1 and 60 then raise exception 'Pause for 1 to 60 days.'; end if;
  select noshow_mode into v_old from gym_settings where gym_id = v_gym;
  update gym_settings set noshow_mode = p_mode, noshow_window_minutes = p_window, noshow_tell = coalesce(p_tell, true),
         noshow_counts_used = coalesce(p_counts_used, true), noshow_pause = coalesce(p_pause, false),
         noshow_pause_count = p_count, noshow_pause_within_days = p_within_days, noshow_pause_days = p_days,
         -- Judging starts now when it was off: never history.
         noshow_since = case when v_old = 'off' or noshow_since is null then now() else noshow_since end
   where gym_id = v_gym;
end;
$$;
revoke all on function set_noshow_rules(text, int, boolean, boolean, boolean, int, int, int) from public, anon;
grant execute on function set_noshow_rules(text, int, boolean, boolean, boolean, int, int, int) to authenticated;

-- ---- 7. marking who came ---------------------------------------------------------------------------------------
-- The sweep: judges every ended session of one gym that started after the owner turned no-shows on. Re-runnable.
create or replace function settle_no_shows_for(p_gym uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  gs gym_settings; v_since timestamptz; v_win interval; v_auto boolean; v_auto_pt boolean; r record; v_mark text; n int := 0;
begin
  if p_gym is null or not gym_module_on(p_gym, 'noshows') then return 0; end if;
  select * into gs from gym_settings where gym_id = p_gym;
  if gs.gym_id is null or gs.noshow_mode = 'off' then return 0; end if;
  -- Judged from the later of: the owner's last "on" for the switch, and the rules leaving 'off'.
  v_since := greatest(coalesce(gs.noshow_since, '-infinity'),
                      coalesce((select changed_at from gym_modules where gym_id = p_gym and feature_key = 'noshows'), now()));
  v_win := make_interval(mins => gs.noshow_window_minutes);
  v_auto := gs.noshow_mode in ('auto', 'auto_coach');
  v_auto_pt := gs.noshow_mode = 'auto';

  for r in select b.id, b.member_id, c.id class_id, c.trainer_id, c.name, c.scheduled_at s,
                  c.scheduled_at + make_interval(mins => coalesce(c.duration_minutes, 60)) e
             from bookings b join classes c on c.id = b.class_id
            where b.gym_id = p_gym and b.status = 'approved' and b.attended is null and c.scheduled_at >= v_since
              and c.scheduled_at + make_interval(mins => coalesce(c.duration_minutes, 60)) <= now() loop
    if v_auto then
      v_mark := case when came_in_between(p_gym, r.member_id, r.s - v_win, r.e) then 'came' else 'no_show' end;
      update bookings set attended = v_mark, attended_at = now(), attended_by = null, attended_by_role = 'system' where id = r.id;
      if v_mark = 'no_show' then perform noshow_effects('class', r.id); end if;
      n := n + 1;
    elsif r.trainer_id is not null then
      perform notify_once(r.trainer_id, 'booking', 'Who came to your class?',
        'Mark who came to ' || coalesce(r.name, 'your class') || ' on ' || to_char(r.s at time zone 'Asia/Manila', 'Mon DD, FMHH12:MI AM') || '.',
        '/trainer/schedule', 'noshow-ask:class:' || r.class_id, p_gym);
    end if;
  end loop;

  for r in select s.id, s.member_id, s.trainer_id, s.starts_at s,
                  s.starts_at + make_interval(mins => coalesce(s.duration_minutes, 60)) e
             from pt_sessions s
            where s.gym_id = p_gym and s.status = 'approved' and s.attended is null and s.starts_at >= v_since
              and s.starts_at + make_interval(mins => coalesce(s.duration_minutes, 60)) <= now() loop
    if v_auto_pt then
      v_mark := case when came_in_between(p_gym, r.member_id, r.s - v_win, r.e) then 'came' else 'no_show' end;
      update pt_sessions set attended = v_mark, attended_at = now(), attended_by = null, attended_by_role = 'system' where id = r.id;
      if v_mark = 'no_show' then perform noshow_effects('pt', r.id); end if;
      n := n + 1;
    elsif r.trainer_id is not null then
      -- Never a no-show by silence: it stays unmarked, and the coach is asked once.
      perform notify_once(r.trainer_id, 'booking', 'Did ' || display_name_of(r.member_id) || ' come?',
        'Say whether ' || display_name_of(r.member_id) || ' came to your 1-on-1 on '
          || to_char(r.s at time zone 'Asia/Manila', 'Mon DD, FMHH12:MI AM') || '.',
        '/trainer/pt/' || r.member_id, 'noshow-ask:pt:' || r.id, p_gym);
    end if;
  end loop;

  if v_auto then
    for r in select b.id, b.member_id, (b.slot_date + b.starts) at time zone 'Asia/Manila' s,
                    (b.slot_date + b.ends) at time zone 'Asia/Manila' e
               from slot_bookings b
              where b.gym_id = p_gym and b.cancelled_at is null and b.attended is null
                and ((b.slot_date + b.starts) at time zone 'Asia/Manila') >= v_since
                and ((b.slot_date + b.ends) at time zone 'Asia/Manila') <= now() loop
      v_mark := case when came_in_between(p_gym, r.member_id, r.s - v_win, r.e) then 'came' else 'no_show' end;
      update slot_bookings set attended = v_mark, attended_at = now(), attended_by = null, attended_by_role = 'system' where id = r.id;
      if v_mark = 'no_show' then perform noshow_effects('slot', r.id); end if;
      n := n + 1;
    end loop;
  end if;
  return n;
end;
$$;
revoke all on function settle_no_shows_for(uuid) from public, anon, authenticated;

-- Page load (anyone in the gym) and pg_cron (optional).
create or replace function settle_no_shows() returns int
language plpgsql security definer set search_path = public as $$
declare v_gym uuid := current_gym_id();
begin
  if v_gym is null or not in_my_gym(v_gym) then return 0; end if;
  return settle_no_shows_for(v_gym);
end;
$$;
revoke all on function settle_no_shows() from public, anon;
grant execute on function settle_no_shows() to authenticated;

create or replace function settle_no_shows_all() returns int
language plpgsql security definer set search_path = public as $$
declare g uuid; n int := 0;
begin
  for g in select gym_id from gym_modules where feature_key = 'noshows' and enabled loop
    n := n + settle_no_shows_for(g);
  end loop;
  return n;
end;
$$;
revoke all on function settle_no_shows_all() from public, anon, authenticated;
grant execute on function settle_no_shows_all() to service_role;

-- The coach (their own sessions and classes) or the desk: came / didn't come. Changing a no-show undoes its effects.
create or replace function mark_attendance(p_kind text, p_id uuid, p_came boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v_gym uuid := current_gym_id(); v_role text := role_in_gym(v_gym); f record; v_new text;
begin
  if p_kind is null or p_kind not in ('class', 'pt', 'slot') or p_came is null then raise exception 'Say whether they came.'; end if;
  if not gym_module_on(v_gym, 'noshows')
     or coalesce((select noshow_mode from gym_settings where gym_id = v_gym), 'off') = 'off' then
    raise exception 'This gym does not track no-shows.';
  end if;
  select * into f from booking_facts(p_kind, p_id);
  if f.member_id is null or f.gym_id is distinct from v_gym then raise exception 'That booking could not be found.'; end if;
  if not (v_role in ('admin', 'staff') or (v_role = 'trainer' and p_kind <> 'slot' and f.coach_id = auth.uid())) then
    raise exception 'Only their coach or the front desk says whether someone came.' using errcode = '42501';
  end if;
  if not f.live then raise exception 'That booking was cancelled or never confirmed.'; end if;
  if f.starts_at > now() then raise exception 'You can mark it once it has started.'; end if;
  v_new := case when p_came then 'came' else 'no_show' end;
  if f.attended is not distinct from v_new then return; end if;

  if p_kind = 'class' then
    update bookings set attended = v_new, attended_at = now(), attended_by = auth.uid(), attended_by_role = v_role where id = p_id;
  elsif p_kind = 'pt' then
    update pt_sessions set attended = v_new, attended_at = now(), attended_by = auth.uid(), attended_by_role = v_role where id = p_id;
  else
    update slot_bookings set attended = v_new, attended_at = now(), attended_by = auth.uid(), attended_by_role = v_role where id = p_id;
  end if;
  if v_new = 'no_show' then
    perform noshow_effects(p_kind, p_id);
  elsif f.attended = 'no_show' then
    perform undo_noshow_effects(p_kind, p_id);
  end if;
  perform log_activity('booking.attendance', p_kind, p_id, f.member_id,
    display_name_of(f.member_id) || case when p_came then ' came to ' else ' did not come to ' end || f.what,
    jsonb_build_object('was', f.attended, 'now', v_new), v_gym);
end;
$$;
revoke all on function mark_attendance(text, uuid, boolean) from public, anon;
grant execute on function mark_attendance(text, uuid, boolean) to authenticated;

-- The desk lifts a pause early.
create or replace function lift_booking_pause(p_member uuid, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_gym uuid := current_gym_id();
begin
  if role_in_gym(v_gym) is null or role_in_gym(v_gym) not in ('admin', 'staff') then
    raise exception 'Only the owner or the front desk lifts a pause.' using errcode = '42501';
  end if;
  update booking_pauses set lifted_at = now(), lifted_by = auth.uid(), lifted_reason = coalesce(nullif(btrim(p_reason), ''), 'Lifted by the front desk')
   where gym_id = v_gym and member_id = p_member and lifted_at is null and until > now();
  if not found then raise exception 'There is no pause to lift.'; end if;
  perform notify_once(p_member, 'booking', 'You can book again', 'The front desk lifted the pause on booking in the app.',
    '/member/bookings', 'unpause-desk:' || p_member || ':' || to_char(now(), 'YYYYMMDDHH24MISS'), v_gym);
  perform log_activity('booking.unpause', 'booking_pauses', null, p_member,
    display_name_of(p_member) || ': booking pause lifted', null, v_gym);
end;
$$;
revoke all on function lift_booking_pause(uuid, text) from public, anon;
grant execute on function lift_booking_pause(uuid, text) to authenticated;

-- ---- 8. the pause at booking time, and quotas that follow the owner's "counts as used" -------------------------
create or replace function trg_booking_pause() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_why text;
begin
  if auth.uid() is null or auth.uid() is distinct from new.member_id or role_in_gym(new.gym_id) is distinct from 'member' then
    return new;   -- the desk, a coach, a definer write: they may book for the member
  end if;
  v_why := booking_pause_refusal(new.member_id, new.gym_id);
  if v_why is not null then raise exception '%', v_why using errcode = '42501'; end if;
  return new;
end;
$$;
revoke all on function trg_booking_pause() from public, anon, authenticated;
drop trigger if exists b_booking_pause on bookings;
create trigger b_booking_pause before insert on bookings for each row execute function trg_booking_pause();
drop trigger if exists b_booking_pause on pt_sessions;
create trigger b_booking_pause before insert on pt_sessions for each row execute function trg_booking_pause();

-- 0194's body; the only change: a no-show stops counting when the owner says so.
create or replace function enforce_class_booking_entitlement() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  m record;
  p record;
  used int;
  slot_week date;
  block text;
  v_counts boolean := coalesce((select s.noshow_counts_used from gym_settings s where s.gym_id = new.gym_id), true);
begin
  perform act_as_gym(new.gym_id);
  select * into m from current_membership_of(new.member_id);
  -- 0194: a day-pass guest books a class on the pass's own day, where the owner allows it — no plan, no quota.
  if (m is null or not membership_is_usable(m.status, m.expiry_date, m.never_expires))
     and coalesce((select s.day_pass_classes from gym_settings s where s.gym_id = new.gym_id), false)
     and has_day_pass(new.member_id, new.gym_id,
                      (select (c.scheduled_at at time zone 'Asia/Manila')::date from classes c where c.id = new.class_id)) then
    block := waiver_blocks(new.member_id, new.gym_id);
    if block is not null then raise exception '%', block; end if;
    return new;
  end if;
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
       and (v_counts or b.attended is distinct from 'no_show')
       and date_trunc('week', (c.scheduled_at at time zone 'Asia/Manila'))::date = slot_week;

    if used >= p.class_bookings_per_week then
      raise exception 'Your plan allows % class(es) per week. You have already booked that week.',
        p.class_bookings_per_week;
    end if;
  end if;

  -- 0119, last: a member with no plan hears about the plan first.
  block := waiver_blocks(new.member_id, new.gym_id);
  if block is not null then raise exception '%', block; end if;

  return new;
end;
$$;

-- 0119's body; the only change: a no-show stops counting when the owner says so.
create or replace function enforce_pt_entitlement() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  m record;
  p record;
  used int;
  slot_month date;
  block text;
  v_counts boolean := coalesce((select s.noshow_counts_used from gym_settings s where s.gym_id = new.gym_id), true);
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
       and (v_counts or s.attended is distinct from 'no_show')
       and date_trunc('month', (s.starts_at at time zone 'Asia/Manila'))::date = slot_month;

    if used >= p.pt_sessions_per_month then
      raise exception 'Your plan allows % personal training session(s) per month.',
        p.pt_sessions_per_month;
    end if;
  end if;

  -- 0119, last, and note the `is_front_desk()` early return above: the desk
  -- booking somebody in is never refused over a waiver.
  block := waiver_blocks(new.member_id, new.gym_id);
  if block is not null then raise exception '%', block; end if;

  return new;
end;
$$;

-- ---- 9. late cancels -------------------------------------------------------------------------------------------
-- 0101's cancel_booking; added: a member's cancel inside the gym's window is blocked or marked late (the owner's
-- choice). The coach and the desk are never late.
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
  v_cut         int;
  v_mode        text;
  v_late        boolean := false;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to cancel a booking.';
  end if;
  if p_kind not in ('class', 'pt') then
    raise exception 'Unknown booking type.';
  end if;

  v_role := get_my_role()::text;

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

  if v_member = auth.uid() then
    v_actor_role := 'member';
  elsif v_trainer is not null and v_trainer = auth.uid() and v_role = 'trainer' then
    v_actor_role := 'trainer';
  elsif is_front_desk() then
    v_actor_role := coalesce(v_role, 'staff');
  else
    raise exception 'You cannot cancel a booking that is not yours.';
  end if;

  if v_status = 'cancelled' then
    raise exception 'That booking has already been cancelled.';
  end if;
  if v_status = 'rejected' then
    raise exception 'That booking was declined and cannot be cancelled.';
  end if;
  -- A session that has already begun cannot be un-booked: it either happened or
  -- it was a no-show, and both are history rather than a cancellation.
  if v_starts_at is not null and v_starts_at <= now() then
    raise exception
      'That session has already started, so it can no longer be cancelled. Ask the front desk to correct the record.';
  end if;

  -- 0260: the gym's late window, for the member only. A request still pending is never late.
  if v_actor_role = 'member' and v_status = 'approved' then
    select case when p_kind = 'pt' then gs.pt_cancel_minutes else gs.class_cancel_minutes end, gs.late_cancel_mode
      into v_cut, v_mode from gym_settings gs where gs.gym_id = v_gym;
    if coalesce(v_cut, 0) > 0 and v_starts_at - make_interval(mins => v_cut) <= now() then
      if v_mode = 'block' then
        raise exception 'This gym asks you to cancel at least % minutes before. Ask the front desk.', v_cut;
      end if;
      v_late := true;
    end if;
  end if;

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
  if v_needs_note and coalesce(btrim(p_note), '') = '' then
    raise exception 'Please say why, in your own words.';
  end if;

  perform set_config('corefitness.cancelling', 'on', true);

  if p_kind = 'pt' then
    update pt_sessions
       set status = 'cancelled',
           cancelled_at = now(),
           cancelled_by = auth.uid(),
           cancelled_by_role = v_actor_role,
           cancellation_reason = p_reason,
           cancellation_note = nullif(btrim(p_note), ''),
           late_cancel = v_late
     where id = p_id;
  else
    update bookings
       set status = 'cancelled',
           cancelled_at = now(),
           cancelled_by = auth.uid(),
           cancelled_by_role = v_actor_role,
           cancellation_reason = p_reason,
           cancellation_note = nullif(btrim(p_note), ''),
           late_cancel = v_late
     where id = p_id;
  end if;

  if v_actor_role = 'member' then
    if v_trainer is not null then
      perform notify_once(
        v_trainer, 'booking',
        case when v_late then 'A late cancel' else 'A booking was cancelled' end,
        'Your member cancelled ' || v_what || case when v_late then ' late (inside the gym''s ' || v_cut || '-minute window)' else '' end
          || '. Reason given: ' || v_label || '.',
        '/trainer/bookings', 'cancel:' || p_id::text || ':trainer');
    end if;
    if v_late then perform consider_booking_pause(v_gym, v_member); end if;
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

-- 0259's cancel_slot; the slot window now follows the same late-cancel choice. The desk is never late.
create or replace function cancel_slot(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare b slot_bookings; v_role text; v_cut int; v_mode text; v_late boolean := false;
begin
  select * into b from slot_bookings where id = p_id and gym_id = current_gym_id() and cancelled_at is null for update;
  if b.id is null then raise exception 'That booking is not here any more.'; end if;
  v_role := role_in_gym(b.gym_id);
  if v_role in ('admin', 'staff') then
    null;
  elsif b.member_id = auth.uid() then
    if (b.slot_date + b.starts) <= now() at time zone 'Asia/Manila' then
      raise exception 'That slot has started — it can no longer be cancelled.';
    end if;
    select slot_cancel_minutes, late_cancel_mode into v_cut, v_mode from gym_settings where gym_id = b.gym_id;
    if coalesce(v_cut, 0) > 0 and (b.slot_date + b.starts) - make_interval(mins => v_cut) <= now() at time zone 'Asia/Manila' then
      if coalesce(v_mode, 'mark') = 'block' then
        raise exception 'Cancel at least % minutes before the slot. Ask the front desk.', v_cut;
      end if;
      v_late := true;
    end if;
  else
    raise exception 'That is not yours to cancel.' using errcode = '42501';
  end if;
  update slot_bookings set cancelled_at = now(), late_cancel = v_late,
         cancelled_by_role = case when v_role in ('admin', 'staff') then v_role else 'member' end
   where id = p_id;
  if v_late then perform consider_booking_pause(b.gym_id, b.member_id); end if;
end;
$$;
revoke all on function cancel_slot(uuid) from public, anon;
grant execute on function cancel_slot(uuid) to authenticated;

-- 0259's book_slot, split so a repeat can book a slot for a member; adds the pause for a member's own booking.
create or replace function slot_book_for(p_gym uuid, p_member uuid, p_date date, p_starts time, p_by_desk boolean) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := p_member; v_gym uuid := p_gym; gs record; t slot_templates; m record; v_id uuid; v_now timestamp; v_why text;
begin
  if not gym_module_on(v_gym, 'slots') then raise exception 'This gym does not use time slots.'; end if;
  if not coalesce(p_by_desk, false) then
    v_why := booking_pause_refusal(v_me, v_gym);
    if v_why is not null then raise exception '%', v_why using errcode = '42501'; end if;
  end if;
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
revoke all on function slot_book_for(uuid, uuid, date, time, boolean) from public, anon, authenticated;

create or replace function book_slot(p_date date, p_starts time) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_gym uuid := current_gym_id();
begin
  if auth.uid() is null or role_in_gym(v_gym) is distinct from 'member' then
    raise exception 'Only a member books a time slot.' using errcode = '42501';
  end if;
  return slot_book_for(v_gym, auth.uid(), p_date, p_starts, false);
end;
$$;
revoke all on function book_slot(date, time) from public, anon;
grant execute on function book_slot(date, time) to authenticated;

-- ---- 10. repeats -----------------------------------------------------------------------------------------------
-- Books the weeks a repeat has not booked yet, each AS the person who set it up would book it (their approval,
-- limits, clashes, seats, pause), by acting as them for that one insert. A refused week is recorded with its reason.
create or replace function extend_repeat(p_id uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  r booking_repeats; gs gym_settings; v_last date; d date; v_class uuid; v_bid uuid; v_msg text; v_wait boolean;
  v_prev_sub text; v_prev_gym text; v_status booking_status; v_start timestamptz; n int := 0;
begin
  select * into r from booking_repeats where id = p_id for update;
  if r.id is null or r.stopped_at is not null then return 0; end if;
  if not gym_module_on(r.gym_id, 'repeats') then return 0; end if;   -- switched off: nothing new is booked
  if not exists (select 1 from gym_roles where gym_id = r.gym_id and user_id = r.member_id and role = 'member' and status = 'active')
     or not exists (select 1 from gym_roles where gym_id = r.gym_id and user_id = r.created_by and status = 'active'
                      and role = case r.created_by_role when 'member' then 'member' when 'coach' then 'trainer' else role end
                      and (r.created_by_role <> 'desk' or role in ('admin', 'staff'))) then
    update booking_repeats set stopped_at = now(), stop_reason = 'The person who set it up is no longer at the gym.' where id = r.id;
    return 0;
  end if;
  select * into gs from gym_settings where gym_id = r.gym_id;
  v_last := case when r.weeks is not null then r.first_date + 7 * (r.weeks - 1) else manila_today() + gs.repeat_ahead_days end;
  d := r.first_date + 7;
  while d <= v_last loop
    if not exists (select 1 from booking_repeat_weeks w where w.repeat_id = r.id and w.week_date = d) then
      v_bid := null; v_msg := null; v_wait := false;
      v_start := (d + r.starts) at time zone 'Asia/Manila';
      if v_start <= now() then
        v_msg := 'That week has passed.';
      else
        v_prev_sub := current_setting('request.jwt.claim.sub', true);
        v_prev_gym := current_setting('cf.acting_gym', true);
        perform set_config('request.jwt.claim.sub', r.created_by::text, true);
        perform act_as_gym(r.gym_id);
        begin
          -- A member's own: their gym's approval decides (0180's trigger). The desk: confirmed. A coach: confirmed
          -- unless the gym has the desk decide.
          v_status := case when r.created_by_role = 'desk' then 'approved'
                           when r.created_by_role = 'coach'
                                and booking_approval_mode(r.gym_id, case when r.kind = 'pt' then 'pt' else 'class' end) in ('desk', 'coach_desk')
                             then 'pending'
                           when r.created_by_role = 'coach' then 'approved'
                           else 'pending' end;
          if r.kind = 'class' then
            select c.id into v_class from classes c
             where c.template_id = r.template_id and c.gym_id = r.gym_id
               and (c.scheduled_at at time zone 'Asia/Manila')::date = d limit 1;
            if v_class is null then
              v_wait := true;   -- the timetable has not reached that week: tried again later
            else
              insert into bookings (member_id, class_id, gym_id, status, repeat_id)
              values (r.member_id, v_class, r.gym_id, v_status, r.id) returning id into v_bid;
            end if;
          elsif r.kind = 'pt' then
            insert into pt_sessions (trainer_id, member_id, starts_at, duration_minutes, status, gym_id, repeat_id)
            values (r.trainer_id, r.member_id, v_start, coalesce(r.duration_minutes, 60), v_status, r.gym_id, r.id)
            returning id into v_bid;
          else
            v_bid := slot_book_for(r.gym_id, r.member_id, d, r.starts, r.created_by_role = 'desk');
            update slot_bookings set repeat_id = r.id where id = v_bid;
          end if;
        exception when others then
          v_msg := sqlerrm; v_bid := null;
        end;
        perform set_config('request.jwt.claim.sub', coalesce(v_prev_sub, ''), true);
        perform set_config('cf.acting_gym', coalesce(v_prev_gym, ''), true);
      end if;
      if not v_wait then
        insert into booking_repeat_weeks (repeat_id, gym_id, week_date, booking_id, outcome, message)
        values (r.id, r.gym_id, d, v_bid, case when v_bid is null then 'refused' else 'booked' end, v_msg);
        if v_bid is not null then n := n + 1; end if;
      end if;
    end if;
    d := d + 7;
  end loop;
  return n;
end;
$$;
revoke all on function extend_repeat(uuid) from public, anon, authenticated;

-- Start a repeat from a live booking (its first week). Returns the repeat's id.
create or replace function repeat_booking(p_kind text, p_id uuid, p_weeks int default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_gym uuid := current_gym_id(); v_role text := role_in_gym(v_gym); gs gym_settings;
  v_member uuid; v_coach uuid; v_live boolean; v_tpl uuid; v_start timestamptz; v_len int; v_local timestamp;
  v_as text; v_weeks int; v_id uuid;
begin
  if p_kind is null or p_kind not in ('class', 'pt', 'slot') then raise exception 'Unknown booking type.'; end if;
  if not gym_module_on(v_gym, 'repeats') then raise exception 'This gym does not repeat bookings.'; end if;
  select * into gs from gym_settings where gym_id = v_gym;
  if p_kind = 'class' then
    select b.member_id, c.trainer_id, b.status in ('pending', 'approved'), c.template_id, c.scheduled_at, c.duration_minutes
      into v_member, v_coach, v_live, v_tpl, v_start, v_len
      from bookings b join classes c on c.id = b.class_id where b.id = p_id and b.gym_id = v_gym;
  elsif p_kind = 'pt' then
    select s.member_id, s.trainer_id, s.status in ('pending', 'approved'), null, s.starts_at, s.duration_minutes
      into v_member, v_coach, v_live, v_tpl, v_start, v_len
      from pt_sessions s where s.id = p_id and s.gym_id = v_gym;
  else
    select b.member_id, null, b.cancelled_at is null, null, (b.slot_date + b.starts) at time zone 'Asia/Manila', null
      into v_member, v_coach, v_live, v_tpl, v_start, v_len
      from slot_bookings b where b.id = p_id and b.gym_id = v_gym;
  end if;
  if v_member is null then raise exception 'That booking could not be found.'; end if;
  if not v_live then raise exception 'Only a booking that is still on can repeat.'; end if;

  v_as := case when v_role = 'member' and v_member = auth.uid() then 'member'
               when v_role = 'trainer' and p_kind <> 'slot' and v_coach = auth.uid() then 'coach'
               when v_role in ('admin', 'staff') then 'desk' end;
  if v_as is null then raise exception 'That booking is not yours to repeat.' using errcode = '42501'; end if;
  if not (v_as = any(gs.repeat_who)) then
    raise exception 'At this gym, repeat bookings are set up by %.',
      array_to_string(array(select case w when 'member' then 'members' when 'coach' then 'coaches' else 'the front desk' end
                              from unnest(gs.repeat_who) w), ' or ') using errcode = '42501';
  end if;
  if p_kind = 'class' and v_tpl is null then raise exception 'Only a class on the gym''s weekly timetable repeats.'; end if;
  if gs.repeat_kind = 'weeks' then
    if p_weeks is null or p_weeks not between 2 and gs.repeat_max_weeks then
      raise exception 'Repeat for 2 to % weeks.', gs.repeat_max_weeks;
    end if;
    v_weeks := p_weeks;
  end if;
  v_local := v_start at time zone 'Asia/Manila';
  if exists (select 1 from booking_repeats x where x.gym_id = v_gym and x.member_id = v_member and x.kind = p_kind
               and x.stopped_at is null and x.weekday = extract(dow from v_local)::smallint and x.starts = v_local::time
               and x.template_id is not distinct from v_tpl
               and (p_kind <> 'pt' or x.trainer_id is not distinct from v_coach)
               and (x.weeks is null or x.first_date + 7 * (x.weeks - 1) >= v_local::date)) then
    raise exception 'This booking already repeats.';
  end if;

  insert into booking_repeats (gym_id, member_id, kind, template_id, trainer_id, weekday, starts, duration_minutes,
                               first_date, weeks, created_by, created_by_role)
  values (v_gym, v_member, p_kind, v_tpl, v_coach, extract(dow from v_local)::smallint, v_local::time, v_len,
          v_local::date, v_weeks, auth.uid(), v_as)
  returning id into v_id;
  insert into booking_repeat_weeks (repeat_id, gym_id, week_date, booking_id, outcome) values (v_id, v_gym, v_local::date, p_id, 'booked');
  if p_kind = 'class' then update bookings set repeat_id = v_id where id = p_id;
  elsif p_kind = 'pt' then update pt_sessions set repeat_id = v_id where id = p_id;
  else update slot_bookings set repeat_id = v_id where id = p_id; end if;
  perform extend_repeat(v_id);
  perform log_activity('booking.repeat', 'booking_repeats', v_id, v_member,
    display_name_of(v_member) || ': a booking repeats weekly' || coalesce(' for ' || v_weeks || ' weeks', ' until stopped'),
    jsonb_build_object('kind', p_kind, 'by', v_as), v_gym);
  return v_id;
end;
$$;
revoke all on function repeat_booking(text, uuid, int) from public, anon;
grant execute on function repeat_booking(text, uuid, int) to authenticated;

-- The member, the coach of it, or the desk stops it. The weeks already booked stay.
create or replace function stop_repeat(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_gym uuid := current_gym_id(); v_role text := role_in_gym(v_gym); r booking_repeats;
begin
  select * into r from booking_repeats where id = p_id and gym_id = v_gym and stopped_at is null for update;
  if r.id is null then raise exception 'That repeat is not running any more.'; end if;
  if not (r.member_id = auth.uid() or v_role in ('admin', 'staff') or (v_role = 'trainer' and r.trainer_id = auth.uid())) then
    raise exception 'That repeat is not yours to stop.' using errcode = '42501';
  end if;
  update booking_repeats set stopped_at = now(), stopped_by = auth.uid(), stop_reason = 'Stopped' where id = p_id;
end;
$$;
revoke all on function stop_repeat(uuid) from public, anon;
grant execute on function stop_repeat(uuid) to authenticated;

-- Page load (anyone in the gym) and pg_cron (optional): book what the running repeats have not booked yet.
create or replace function extend_repeats() returns int
language plpgsql security definer set search_path = public as $$
declare v_gym uuid := current_gym_id(); x uuid; n int := 0;
begin
  if v_gym is null or not in_my_gym(v_gym) or not gym_module_on(v_gym, 'repeats') then return 0; end if;
  for x in select id from booking_repeats where gym_id = v_gym and stopped_at is null loop
    n := n + extend_repeat(x);
  end loop;
  return n;
end;
$$;
revoke all on function extend_repeats() from public, anon;
grant execute on function extend_repeats() to authenticated;

create or replace function extend_repeats_all() returns int
language plpgsql security definer set search_path = public as $$
declare x uuid; n int := 0;
begin
  for x in select id from booking_repeats where stopped_at is null loop n := n + extend_repeat(x); end loop;
  return n;
end;
$$;
revoke all on function extend_repeats_all() from public, anon, authenticated;
grant execute on function extend_repeats_all() to service_role;

-- The repeats a person may see: their own (member), the ones with them (coach), the gym's (desk; one member or all).
create or replace function booking_repeats_for(p_member uuid default null)
returns table (id uuid, member_id uuid, member_name text, kind text, what text, weekday smallint, starts time,
               weeks int, first_date date, created_by_role text, stopped_at timestamptz, stop_reason text, week_list jsonb)
language plpgsql stable security definer set search_path = public as $$
declare v_gym uuid := current_gym_id(); v_role text := role_in_gym(v_gym);
begin
  if v_role is null then return; end if;
  return query
    select r.id, r.member_id, display_name_of(r.member_id), r.kind,
           case r.kind when 'class' then coalesce((select t.name from class_templates t where t.id = r.template_id), 'A class')
                       when 'pt' then '1-on-1 with ' || coalesce(display_name_of(r.trainer_id), 'a coach')
                       else 'Time slot' end,
           r.weekday, r.starts, r.weeks, r.first_date, r.created_by_role, r.stopped_at, r.stop_reason,
           coalesce((select jsonb_agg(jsonb_build_object('date', w.week_date, 'outcome', w.outcome, 'message', w.message,
                                                         'booking_id', w.booking_id) order by w.week_date)
                       from booking_repeat_weeks w where w.repeat_id = r.id), '[]'::jsonb)
      from booking_repeats r
     where r.gym_id = v_gym
       and case when v_role in ('admin', 'staff') then p_member is null or r.member_id = p_member
                when v_role = 'trainer' then r.trainer_id = auth.uid() and (p_member is null or r.member_id = p_member)
                else r.member_id = auth.uid() end
     order by r.stopped_at nulls first, r.created_at desc;
end;
$$;
revoke all on function booking_repeats_for(uuid) from public, anon;
grant execute on function booking_repeats_for(uuid) to authenticated;

-- ---- 11. tenancy: the three new tables are each one gym's ------------------------------------------------------
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
    'slot_templates','slot_bookings',
    -- 0260: repeats and pauses.
    'booking_repeats','booking_repeat_weeks','booking_pauses']::text[]
$$;

create or replace function migration_0260_applied() returns boolean language sql stable as $$ select true $$;
grant execute on function migration_0260_applied() to anon, authenticated;
