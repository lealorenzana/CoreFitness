-- 0129: COACHING ROOMS, PART 2 — classwork, hand-ins and monitoring
--
-- Spec: docs/superpowers/specs/2026-09-27-coaching-rooms-design.md
--
-- The trainer sets classwork in a room; each member turns it in; the trainer
-- returns it with a comment. Two kinds:
--   workout — one of the gym's workouts (0122). Turned in by the DATABASE when
--             the member finishes logging it: proof, not a tick box.
--   checkin — a question to answer, a body weight, or a note. Turned in through
--             `submit_checkin()`, which checks the answer fits the kind.
--
-- Rules:
--   * No write policy on assignments or submissions — functions only.
--   * Status (turned in / late / missing / assigned) is computed, never stored.
--     "On time" is turned in by the end of the due date in Manila.
--   * Points: the rule `classwork_on_time` exists in every gym **switched off**;
--     the owner turns it on in Rewards. Once per assignment, never when late,
--     behind the member's plan (`points_earn`), with act_as_gym first (0125).
--   * A member reads only their own hand-ins; the room's trainer and the gym's
--     owner and desk read the room's.
--   * Classwork needs `coaching_rooms` on the member's plan (0128). Without it
--     the member is not a target — they see the lock, not the work.

-- ---- 1. tables -----------------------------------------------------------------------------------

create table if not exists room_assignments (
  id             uuid primary key default gen_random_uuid(),
  gym_id         uuid not null default acting_gym_id() references gyms(id),
  room_id        uuid not null,
  kind           text not null check (kind in ('workout', 'checkin')),
  gym_workout_id uuid,
  checkin_type   text check (checkin_type in ('question', 'weight', 'note')),
  title          text not null check (length(btrim(title)) between 1 and 120),
  instructions   text check (instructions is null or length(instructions) <= 2000),
  due_on         date not null,
  -- NULL = everyone in the room; otherwise just these members.
  assigned_to    uuid[],
  created_by     uuid not null default auth.uid() references profiles(id),
  created_at     timestamptz not null default now(),
  unique (gym_id, id),
  foreign key (gym_id, room_id) references rooms (gym_id, id) on delete cascade,
  foreign key (gym_id, gym_workout_id) references gym_workouts (gym_id, id) on delete cascade,
  check ((kind = 'workout') = (gym_workout_id is not null)),
  check ((kind = 'checkin') = (checkin_type is not null))
);
create index if not exists room_assignments_room_idx on room_assignments (room_id, due_on);

create table if not exists room_submissions (
  id             uuid primary key default gen_random_uuid(),
  gym_id         uuid not null default acting_gym_id() references gyms(id),
  assignment_id  uuid not null,
  member_id      uuid not null references profiles(id) on delete cascade,
  turned_in_at   timestamptz not null default now(),
  workout_log_id uuid,
  answer_text    text check (answer_text is null or length(answer_text) <= 2000),
  answer_number  numeric(6, 2),
  returned_at    timestamptz,
  return_comment text check (return_comment is null or length(return_comment) <= 2000),
  points_awarded int not null default 0,
  unique (assignment_id, member_id),
  unique (gym_id, id),
  foreign key (gym_id, assignment_id) references room_assignments (gym_id, id) on delete cascade,
  foreign key (gym_id, workout_log_id) references workout_logs (gym_id, id) on delete set null (workout_log_id)
);
create index if not exists room_submissions_member_idx on room_submissions (gym_id, member_id);

alter table room_assignments enable row level security;
alter table room_submissions enable row level security;
grant select on room_assignments, room_submissions to authenticated;

-- The rule, switched off: the owner decides (conversation, 2026-09-27).
insert into point_rules (gym_id, key, label, points, is_active, sort_order)
select g.id, 'classwork_on_time', 'Turned in classwork on time', 10, false, 12 from gyms g
on conflict (gym_id, key) do nothing;

-- ---- 2. who a piece of classwork is for ----------------------------------------------------------

create or replace function assignment_targets(p_assignment uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  select m from room_assignments a, room_member_ids(a.room_id) m
   where a.id = p_assignment
     and (a.assigned_to is null or m = any(a.assigned_to))
     and room_full_access(m);
$$;

create or replace function is_assignment_target(p_assignment uuid, p_member uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from assignment_targets(p_assignment) t where t = p_member);
$$;

-- Turned in by the end of the due date, Manila time.
create or replace function turned_in_on_time(p_at timestamptz, p_due date) returns boolean
language sql immutable as $$
  select (p_at at time zone 'Asia/Manila')::date <= p_due;
$$;

create or replace function manila_today() returns date
language sql stable as $$ select (now() at time zone 'Asia/Manila')::date $$;

drop policy if exists room_assignments_read on room_assignments;
create policy room_assignments_read on room_assignments for select to authenticated
  using (may_see_room(room_id)
         and (storage_role_here() in ('admin', 'staff')
              or exists (select 1 from rooms r where r.id = room_id and r.trainer_id = auth.uid())
              or is_assignment_target(id, auth.uid())));

drop policy if exists room_submissions_read on room_submissions;
create policy room_submissions_read on room_submissions for select to authenticated
  using (member_id = auth.uid()
         or exists (select 1 from room_assignments a join rooms r on r.id = a.room_id
                     where a.id = assignment_id and r.gym_id = current_gym_id()
                       and (r.trainer_id = auth.uid() or storage_role_here() in ('admin', 'staff'))));

-- A member may open a workout their coach set them, as well as a program's.
create or replace function member_may_see_workout(p_workout uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from gym_program_days d
     where d.workout_id = p_workout
       and program_open_to_members(d.program_id)
       and program_unlocked(d.program_id))
  or exists (
    select 1 from room_assignments a
     where a.gym_workout_id = p_workout and a.gym_id = current_gym_id()
       and is_assignment_target(a.id, auth.uid()));
$$;

-- ---- 3. the trainer sets and removes classwork ---------------------------------------------------

create or replace function create_assignment(
  p_room uuid, p_kind text, p_workout uuid, p_checkin_type text, p_title text,
  p_instructions text, p_due_on date, p_assigned_to uuid[] default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare r rooms; v_id uuid; v_to uuid[]; m uuid;
begin
  select * into r from rooms where id = p_room and gym_id = current_gym_id();
  if r.id is null or r.trainer_id is distinct from auth.uid() or not gym_writable() then
    raise exception 'Only this room''s trainer can set classwork here.' using errcode = '42501';
  end if;
  if r.archived_at is not null then raise exception 'This room is closed.'; end if;
  if p_due_on is null or p_due_on < manila_today() then
    raise exception 'Pick a due date from today on.';
  end if;
  if p_kind = 'workout' and not exists (
       select 1 from gym_workouts w where w.id = p_workout and w.gym_id = r.gym_id
         and (w.published or w.created_by = auth.uid())) then
    raise exception 'Pick one of the gym''s workouts, or one of yours.';
  end if;
  -- Only people who are in the room.
  if p_assigned_to is not null and cardinality(p_assigned_to) > 0 then
    foreach m in array p_assigned_to loop
      if not is_in_room(p_room, m) then raise exception 'Everyone you pick must be in this room.'; end if;
    end loop;
    v_to := p_assigned_to;
  end if;
  insert into room_assignments (gym_id, room_id, kind, gym_workout_id, checkin_type, title, instructions, due_on, assigned_to)
  values (r.gym_id, p_room, p_kind, case when p_kind = 'workout' then p_workout end,
          case when p_kind = 'checkin' then p_checkin_type end,
          btrim(p_title), nullif(btrim(coalesce(p_instructions, '')), ''), p_due_on, v_to)
  returning id into v_id;

  for m in select assignment_targets(v_id) loop
    perform notify_once(m, 'coaching', 'New classwork: ' || btrim(p_title),
      'Due ' || to_char(p_due_on, 'Dy DD Mon') || ' · ' || r.name,
      '/member/rooms/' || p_room, 'classwork_new:' || v_id || ':' || m, r.gym_id);
  end loop;
  return v_id;
end;
$$;

create or replace function delete_assignment(p_assignment uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from room_assignments a using rooms r
   where a.id = p_assignment and r.id = a.room_id and r.trainer_id = auth.uid()
     and r.gym_id = current_gym_id() and gym_writable();
  if not found then raise exception 'Only this room''s trainer can remove it.' using errcode = '42501'; end if;
end;
$$;

-- ---- 4. turning in -------------------------------------------------------------------------------

-- Points for one hand-in: the rule on, the plan allows it, on time, once.
create or replace function award_classwork(p_submission uuid) returns int
language plpgsql security definer set search_path = public as $$
declare s record; v_pts int; v_prev text := current_setting('cf.acting_gym', true);
begin
  select sb.id, sb.gym_id, sb.member_id, sb.turned_in_at, a.due_on into s
    from room_submissions sb join room_assignments a on a.id = sb.assignment_id where sb.id = p_submission;
  if s.id is null or not turned_in_on_time(s.turned_in_at, s.due_on) then return 0; end if;
  perform act_as_gym(s.gym_id);
  select points into v_pts from point_rules where gym_id = s.gym_id and key = 'classwork_on_time' and is_active;
  if v_pts is not null and plan_allows(s.member_id, 'points_earn') then
    insert into point_ledger (gym_id, member_id, rule_key, points, source_table, source_id)
    values (s.gym_id, s.member_id, 'classwork_on_time', v_pts, 'room_submissions', s.id)
    on conflict (gym_id, member_id, rule_key, source_table, source_id) do nothing;
    if found then update room_submissions set points_awarded = v_pts where id = s.id; else v_pts := 0; end if;
  else
    v_pts := 0;
  end if;
  perform set_config('cf.acting_gym', coalesce(v_prev, ''), true);
  return v_pts;
end;
$$;

-- Tell the trainer, once per piece of classwork per day, however many turn it in.
create or replace function notify_trainer_of_handin(p_assignment uuid) returns void
language plpgsql security definer set search_path = public as $$
declare a record; n int;
begin
  select ra.id, ra.title, ra.gym_id, r.trainer_id, r.id as room_id, r.name as room into a
    from room_assignments ra join rooms r on r.id = ra.room_id where ra.id = p_assignment;
  select count(*) into n from room_submissions where assignment_id = p_assignment and returned_at is null;
  perform notify_once(a.trainer_id, 'coaching', a.title || ': ' || n || ' to review',
    'Turned in, in ' || a.room, '/trainer/rooms/' || a.room_id,
    'classwork_in:' || a.id || ':' || manila_today(), a.gym_id);
end;
$$;

-- A workout log finished: every open workout assignment for it is turned in.
create or replace function trg_workout_turns_in() returns trigger
language plpgsql security definer set search_path = public as $$
declare a record; v_sub uuid;
begin
  if new.completed_at is null or new.gym_workout_id is null then return new; end if;
  if tg_op = 'UPDATE' and old.completed_at is not null then return new; end if;
  for a in
    select ra.id from room_assignments ra
     where ra.gym_id = new.gym_id and ra.kind = 'workout' and ra.gym_workout_id = new.gym_workout_id
       and ra.created_at <= new.completed_at
       and is_assignment_target(ra.id, new.member_id)
       and not exists (select 1 from room_submissions s where s.assignment_id = ra.id and s.member_id = new.member_id)
  loop
    insert into room_submissions (gym_id, assignment_id, member_id, turned_in_at, workout_log_id)
    values (new.gym_id, a.id, new.member_id, new.completed_at, new.id)
    on conflict (assignment_id, member_id) do nothing
    returning id into v_sub;
    if v_sub is not null then
      perform award_classwork(v_sub);
      perform notify_trainer_of_handin(a.id);
    end if;
  end loop;
  return new;
end;
$$;
drop trigger if exists workout_turns_in on workout_logs;
create trigger workout_turns_in after insert or update of completed_at on workout_logs
  for each row execute function trg_workout_turns_in();

-- The member opens the workout their coach set, in the ordinary player.
create or replace function start_assignment(p_assignment uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare a record; v_log uuid;
begin
  select ra.id, ra.gym_id, ra.gym_workout_id, w.name into a
    from room_assignments ra join gym_workouts w on w.id = ra.gym_workout_id
   where ra.id = p_assignment and ra.gym_id = current_gym_id() and ra.kind = 'workout';
  if a.id is null then raise exception 'That classwork is not a workout here.'; end if;
  if not is_assignment_target(a.id, auth.uid()) then
    raise exception 'That classwork is not set for you.' using errcode = '42501';
  end if;
  insert into workout_logs (member_id, gym_id, activity, gym_workout_id)
  values (auth.uid(), a.gym_id, a.name, a.gym_workout_id)
  returning id into v_log;
  return v_log;
end;
$$;

-- A check-in: the answer must fit the kind. Can be changed until it is returned.
create or replace function submit_checkin(p_assignment uuid, p_text text default null, p_number numeric default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare a room_assignments; v_sub uuid; v_text text := nullif(btrim(coalesce(p_text, '')), '');
begin
  select * into a from room_assignments where id = p_assignment and gym_id = current_gym_id();
  if a.id is null or a.kind <> 'checkin' then raise exception 'That is not a check-in here.'; end if;
  if not is_assignment_target(a.id, auth.uid()) or not gym_writable() then
    raise exception 'That check-in is not set for you.' using errcode = '42501';
  end if;
  if a.checkin_type = 'weight' and (p_number is null or p_number < 20 or p_number > 400) then
    raise exception 'Enter your body weight in kilograms (20 to 400).';
  end if;
  if a.checkin_type in ('question', 'note') and v_text is null then
    raise exception 'Write your answer first.';
  end if;
  if exists (select 1 from room_submissions where assignment_id = a.id and member_id = auth.uid() and returned_at is not null) then
    raise exception 'Your coach already returned this one.';
  end if;
  insert into room_submissions (gym_id, assignment_id, member_id, answer_text, answer_number)
  values (a.gym_id, a.id, auth.uid(), v_text, case when a.checkin_type = 'weight' then p_number end)
  on conflict (assignment_id, member_id) do update
     set answer_text = excluded.answer_text, answer_number = excluded.answer_number
  returning id into v_sub;
  perform award_classwork(v_sub);
  perform notify_trainer_of_handin(a.id);
  return v_sub;
end;
$$;

create or replace function return_submission(p_submission uuid, p_comment text) returns void
language plpgsql security definer set search_path = public as $$
declare s record;
begin
  select sb.id, sb.member_id, a.title, a.room_id, r.trainer_id, r.gym_id, r.name into s
    from room_submissions sb join room_assignments a on a.id = sb.assignment_id join rooms r on r.id = a.room_id
   where sb.id = p_submission and r.gym_id = current_gym_id();
  if s.id is null or s.trainer_id is distinct from auth.uid() or not gym_writable() then
    raise exception 'Only this room''s trainer can return work.' using errcode = '42501';
  end if;
  if coalesce(btrim(p_comment), '') = '' then raise exception 'Write a comment to return it with.'; end if;
  update room_submissions set returned_at = now(), return_comment = btrim(p_comment) where id = p_submission;
  perform notify_once(s.member_id, 'coaching', 'Your coach returned ' || s.title,
    left(btrim(p_comment), 140), '/member/rooms/' || s.room_id,
    'classwork_returned:' || s.id || ':' || extract(epoch from now())::bigint, s.gym_id);
end;
$$;

-- ---- 5. reminders (a sweep: elapsed time fires no trigger) ------------------------------------------

create or replace function classwork_due_sweep() returns int
language plpgsql security definer set search_path = public as $$
declare a record; m uuid; n int := 0;
begin
  if current_gym_id() is null then return 0; end if;
  for a in select ra.id, ra.title, ra.room_id, ra.gym_id from room_assignments ra join rooms r on r.id = ra.room_id
            where ra.gym_id = current_gym_id() and ra.due_on = manila_today() + 1 and r.archived_at is null loop
    for m in select t from assignment_targets(a.id) t
              where not exists (select 1 from room_submissions s where s.assignment_id = a.id and s.member_id = t) loop
      if notify_once(m, 'coaching', 'Due tomorrow: ' || a.title, 'Your coach set this. Tap to do it.',
                     '/member/rooms/' || a.room_id, 'classwork_due:' || a.id || ':' || m, a.gym_id) then
        n := n + 1;
      end if;
    end loop;
  end loop;
  return n;
end;
$$;

-- ---- 6. what the screens read -------------------------------------------------------------------

-- A room's classwork. The trainer (and staff) get the counts; a member gets
-- their own status and answer.
create or replace function room_classwork(p_room uuid)
returns table (id uuid, kind text, checkin_type text, title text, instructions text, due_on date,
               gym_workout_id uuid, workout_name text, created_at timestamptz, whole_room boolean,
               targets int, turned_in int, late int, missing int, to_review int,
               my_status text, my_answer_text text, my_answer_number numeric, my_return_comment text,
               my_points int)
language sql stable security definer set search_path = public as $$
  with a as (
    select ra.*, w.name as wname from room_assignments ra left join gym_workouts w on w.id = ra.gym_workout_id
     where ra.room_id = p_room and may_see_room(p_room)
       and (storage_role_here() in ('admin', 'staff')
            or exists (select 1 from rooms r where r.id = p_room and r.trainer_id = auth.uid())
            or is_assignment_target(ra.id, auth.uid()))
  )
  select a.id, a.kind, a.checkin_type, a.title, a.instructions, a.due_on, a.gym_workout_id, a.wname, a.created_at,
         a.assigned_to is null,
         (select count(*)::int from assignment_targets(a.id)),
         (select count(*)::int from room_submissions s where s.assignment_id = a.id),
         (select count(*)::int from room_submissions s where s.assignment_id = a.id and not turned_in_on_time(s.turned_in_at, a.due_on)),
         case when a.due_on < manila_today() then
           (select count(*)::int from assignment_targets(a.id) t
             where not exists (select 1 from room_submissions s where s.assignment_id = a.id and s.member_id = t)) else 0 end,
         (select count(*)::int from room_submissions s where s.assignment_id = a.id and s.returned_at is null),
         case when mine.id is not null then
                case when mine.returned_at is not null then 'returned'
                     when turned_in_on_time(mine.turned_in_at, a.due_on) then 'turned_in' else 'late' end
              when is_assignment_target(a.id, auth.uid()) then
                case when a.due_on < manila_today() then 'missing' else 'assigned' end
         end,
         mine.answer_text, mine.answer_number, mine.return_comment, mine.points_awarded
    from a left join room_submissions mine on mine.assignment_id = a.id and mine.member_id = auth.uid()
   order by (a.due_on < manila_today()), a.due_on, a.created_at;
$$;

-- One piece of classwork, member by member, with what each turned in.
create or replace function assignment_detail(p_assignment uuid)
returns table (member_id uuid, name text, photo_url text, status text, submission_id uuid,
               turned_in_at timestamptz, answer_text text, answer_number numeric,
               return_comment text, returned_at timestamptz, workout jsonb)
language sql stable security definer set search_path = public as $$
  with a as (
    select ra.* from room_assignments ra join rooms r on r.id = ra.room_id
     where ra.id = p_assignment and r.gym_id = current_gym_id()
       and (r.trainer_id = auth.uid() or storage_role_here() in ('admin', 'staff'))
  )
  select p.id, btrim(p.first_name || ' ' || p.last_name), p.photo_url,
         case when s.id is null then case when (select due_on from a) < manila_today() then 'missing' else 'assigned' end
              when s.returned_at is not null then 'returned'
              when turned_in_on_time(s.turned_in_at, (select due_on from a)) then 'turned_in' else 'late' end,
         s.id, s.turned_in_at, s.answer_text, s.answer_number, s.return_comment, s.returned_at,
         -- The logged workout the member handed in: what they did, set by set.
         case when s.workout_log_id is not null then (
           select jsonb_agg(jsonb_build_object('exercise', coalesce(e.name, ws.custom_name), 'set', ws.set_number,
                    'reps', ws.reps, 'kg', ws.weight_kg, 'seconds', ws.duration_seconds) order by ws.set_number)
             from workout_sets ws left join exercises e on e.id = ws.exercise_id
            where ws.log_id = s.workout_log_id) end
    from a, assignment_targets(a.id) t
    join profiles p on p.id = t
    left join room_submissions s on s.assignment_id = (select id from a) and s.member_id = t
   order by (s.id is null), (s.returned_at is not null), 2;
$$;

-- The grade book: members down the side, with the figures a coach acts on.
create or replace function room_progress(p_room uuid)
returns table (member_id uuid, name text, photo_url text, assigned int, on_time int, late int, missing int,
               last_workout_at timestamptz, classes_booked int, classes_attended int, latest_weight numeric,
               cells jsonb, flags text[])
language sql stable security definer set search_path = public as $$
  with r as (
    select * from rooms where id = p_room and gym_id = current_gym_id()
       and (trainer_id = auth.uid() or storage_role_here() in ('admin', 'staff'))
  ),
  mem as (select m from r, room_member_ids(r.id) m),
  work as (
    select ra.id, ra.due_on, ra.created_at from room_assignments ra where ra.room_id = (select id from r)
  ),
  per as (
    select mem.m,
           count(w.id) filter (where is_assignment_target(w.id, mem.m))::int as assigned,
           count(s.id) filter (where turned_in_on_time(s.turned_in_at, w.due_on))::int as on_time,
           count(s.id) filter (where not turned_in_on_time(s.turned_in_at, w.due_on))::int as late,
           count(w.id) filter (where s.id is null and w.due_on < manila_today() and is_assignment_target(w.id, mem.m))::int as missing,
           coalesce(jsonb_agg(jsonb_build_object('assignment', w.id,
             'status', case when s.id is not null then case when turned_in_on_time(s.turned_in_at, w.due_on) then 'on_time' else 'late' end
                            when not is_assignment_target(w.id, mem.m) then 'none'
                            when w.due_on < manila_today() then 'missing' else 'assigned' end)
             order by w.due_on, w.created_at) filter (where w.id is not null), '[]'::jsonb) as cells
      from mem left join work w on true
      left join room_submissions s on s.assignment_id = w.id and s.member_id = mem.m
     group by mem.m
  ),
  cls as (
    -- The last eight of this class the member was booked into (approved, past).
    -- Attended = they checked in at the gym that Manila day; there is no
    -- "no-show" status, so an approved booking alone proves nothing.
    select mem.m,
           count(*)::int as booked,
           count(*) filter (where b.checked)::int as attended,
           bool_and(not b.checked) filter (where b.rn <= 3) as missed_last3,
           count(*) filter (where b.rn <= 3)::int as last3
      from mem
      join lateral (
        select exists (select 1 from attendance at
                        where at.member_id = mem.m and at.gym_id::text = c.gym_id::text
                          and (at.check_in_time at time zone 'Asia/Manila')::date
                              = (c.scheduled_at at time zone 'Asia/Manila')::date) as checked,
               row_number() over (order by c.scheduled_at desc) as rn
          from bookings b join classes c on c.id = b.class_id
         where b.member_id = mem.m and c.template_id = (select template_id from r)
           and c.scheduled_at < now() and b.status = 'approved'
         order by c.scheduled_at desc limit 8
      ) b on true
     group by mem.m
  )
  select p.id, btrim(p.first_name || ' ' || p.last_name), p.photo_url,
         per.assigned, per.on_time, per.late, per.missing,
         (select max(l.completed_at) from workout_logs l where l.member_id = p.id and l.gym_id = (select gym_id from r)),
         cls.booked, cls.attended,
         (select s.answer_number from room_submissions s join room_assignments ra on ra.id = s.assignment_id
           where s.member_id = p.id and ra.room_id = (select id from r) and s.answer_number is not null
           order by s.turned_in_at desc limit 1),
         per.cells,
         array_remove(array[
           case when per.missing >= 2 then 'missing_work' end,
           case when coalesce((select max(l.completed_at) from workout_logs l where l.member_id = p.id
                                and l.gym_id = (select gym_id from r)), '-infinity'::timestamptz)
                     < now() - interval '10 days' then 'inactive' end,
           case when cls.last3 = 3 and cls.missed_last3 then 'missed_classes' end
         ], null)
    from per join profiles p on p.id = per.m
    left join cls on cls.m = per.m
   order by coalesce(array_length(array_remove(array[
             case when per.missing >= 2 then 1 end], null), 1), 0) desc, 2;
$$;

-- Everything waiting for the trainer, across their rooms.
create or replace function trainer_review_queue()
returns table (submission_id uuid, assignment_id uuid, room_id uuid, room_name text, title text,
               member_name text, turned_in_at timestamptz, late boolean)
language sql stable security definer set search_path = public as $$
  select s.id, a.id, r.id, r.name, a.title, btrim(p.first_name || ' ' || p.last_name), s.turned_in_at,
         not turned_in_on_time(s.turned_in_at, a.due_on)
    from room_submissions s
    join room_assignments a on a.id = s.assignment_id
    join rooms r on r.id = a.room_id
    join profiles p on p.id = s.member_id
   where r.trainer_id = auth.uid() and r.gym_id = current_gym_id() and s.returned_at is null
   order by s.turned_in_at;
$$;

-- Per room: waiting to be returned, and due in the next 7 days (for the cards).
create or replace function room_badges()
returns table (room_id uuid, to_review int, due_soon int)
language sql stable security definer set search_path = public as $$
  select r.id,
         case when r.trainer_id = auth.uid() then
           (select count(*)::int from room_submissions s join room_assignments a on a.id = s.assignment_id
             where a.room_id = r.id and s.returned_at is null) else 0 end,
         (select count(*)::int from room_assignments a
           where a.room_id = r.id and a.due_on between manila_today() and manila_today() + 6
             and (r.trainer_id = auth.uid()
                  or (is_assignment_target(a.id, auth.uid())
                      and not exists (select 1 from room_submissions s where s.assignment_id = a.id and s.member_id = auth.uid()))))
    from rooms r
   where may_see_room(r.id) and r.archived_at is null;
$$;

-- The member's Today strip: open classwork due within a week, every room.
create or replace function my_due_classwork()
returns table (assignment_id uuid, room_id uuid, room_name text, title text, kind text, due_on date)
language sql stable security definer set search_path = public as $$
  select a.id, r.id, r.name, a.title, a.kind, a.due_on
    from room_assignments a join rooms r on r.id = a.room_id
   where r.gym_id = current_gym_id() and r.archived_at is null
     and a.due_on between manila_today() and manila_today() + 6
     and is_assignment_target(a.id, auth.uid())
     and not exists (select 1 from room_submissions s where s.assignment_id = a.id and s.member_id = auth.uid())
   order by a.due_on, a.created_at;
$$;

-- The owner's member drawer: this member's classwork record.
create or replace function member_classwork_record(p_member uuid)
returns table (assigned int, on_time int, late int, missing int)
language sql stable security definer set search_path = public as $$
  with a as (
    select ra.id, ra.due_on from room_assignments ra join rooms r on r.id = ra.room_id
     where r.gym_id = current_gym_id()
       and (storage_role_here() in ('admin', 'staff') or r.trainer_id = auth.uid())
       and is_assignment_target(ra.id, p_member)
  )
  select count(*)::int,
         count(s.id) filter (where turned_in_on_time(s.turned_in_at, a.due_on))::int,
         count(s.id) filter (where not turned_in_on_time(s.turned_in_at, a.due_on))::int,
         count(*) filter (where s.id is null and a.due_on < manila_today())::int
    from a left join room_submissions s on s.assignment_id = a.id and s.member_id = p_member;
$$;

-- ---- 7. tenancy ------------------------------------------------------------------------------------

create or replace function tenancy_gym_tables() returns text[] language sql immutable as $$
  select array['account_status_events','achievement_unlocks','achievements','activity_log',
    'assistant_conversations','assistant_messages','attendance','body_measurements','bookings',
    'cancellation_reasons','cash_closeouts','challenge_participants','challenges','class_templates',
    'class_waitlist','classes','event_registrations','events','fitness_goals','freemium_trials',
    'goal_templates','gym_exercise_media','gym_goals','gym_invitations','gym_modules','gym_photos','gym_plans',
    'gym_program_days','gym_programs','gym_settings','gym_waivers','gym_workout_items','gym_workouts',
    'invoice_counters','member_profiles','member_share_prefs','membership_events',
    'membership_plans','membership_requests','memberships',
    'notifications','payments','pending_registrations','personal_records','plan_features',
    'point_ledger','point_rules',
    'program_enrolments','pt_sessions','referral_codes','referrals','refund_rules','renewal_requests',
    'reward_redemptions','rewards','room_assignments','room_comments','room_members','room_posts',
    'room_submissions','rooms',
    'saved_resources','season_claims','season_tiers','squad_members','squad_weeks','squads',
    'trainer_availability','trainer_credentials','trainer_feedback','trainer_profiles',
    'trainer_ratings','waiver_acceptances','workout_logs','workout_plans',
    'workout_routine_exercises','workout_routines','workout_sets']::text[]
$$;

do $$
declare t text;
begin
  foreach t in array array['room_assignments', 'room_submissions'] loop
    execute format('drop policy if exists tenant_select on %I', t);
    execute format('drop policy if exists tenant_insert on %I', t);
    execute format('drop policy if exists tenant_update on %I', t);
    execute format('drop policy if exists tenant_delete on %I', t);
    execute format('create policy tenant_select on %I as restrictive for select to anon, authenticated
                      using (gym_id = current_gym_id())', t);
    execute format('create policy tenant_insert on %I as restrictive for insert to anon, authenticated
                      with check (gym_id = current_gym_id() and gym_writable())', t);
    execute format('create policy tenant_update on %I as restrictive for update to anon, authenticated
                      using (gym_id = current_gym_id() and gym_writable())
                      with check (gym_id = current_gym_id())', t);
    execute format('create policy tenant_delete on %I as restrictive for delete to anon, authenticated
                      using (gym_id = current_gym_id() and gym_writable())', t);
  end loop;
end $$;

-- ---- 8. grants ------------------------------------------------------------------------------------

revoke all on function assignment_targets(uuid), is_assignment_target(uuid, uuid), manila_today(),
  create_assignment(uuid, text, uuid, text, text, text, date, uuid[]), delete_assignment(uuid),
  award_classwork(uuid), notify_trainer_of_handin(uuid), trg_workout_turns_in(), start_assignment(uuid),
  submit_checkin(uuid, text, numeric), return_submission(uuid, text), classwork_due_sweep(),
  room_classwork(uuid), assignment_detail(uuid), room_progress(uuid), trainer_review_queue(),
  room_badges(), my_due_classwork(), member_classwork_record(uuid)
  from public, anon;
revoke all on function assignment_targets(uuid), award_classwork(uuid), notify_trainer_of_handin(uuid),
  trg_workout_turns_in() from authenticated;
grant execute on function is_assignment_target(uuid, uuid), manila_today(),
  create_assignment(uuid, text, uuid, text, text, text, date, uuid[]), delete_assignment(uuid),
  start_assignment(uuid), submit_checkin(uuid, text, numeric), return_submission(uuid, text),
  classwork_due_sweep(), room_classwork(uuid), assignment_detail(uuid), room_progress(uuid),
  trainer_review_queue(), room_badges(), my_due_classwork(), member_classwork_record(uuid)
  to authenticated;

create or replace function migration_0129_applied() returns boolean
language sql immutable as $marker$ select true $marker$;
revoke all on function migration_0129_applied() from public, anon;
grant execute on function migration_0129_applied() to authenticated;
comment on function migration_0129_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0129.sql
