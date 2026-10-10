-- ============================================================================
-- 0177 — The AI coach can do more (and still changes nothing by itself)
-- ============================================================================
--
-- The coach (0142–0145) could read exercises and the member's routines and
-- schedule, and propose a routine, a schedule or a target. It now also:
--
--   READS (definer functions, as the member)
--     ai_coach_gym_info()   this gym's own facts — hours, closed days, plans and
--                           prices, house rules, the next week's classes with
--                           seats left, the coaches. Before this the coach was
--                           told never to state them, because it had no source;
--                           now it answers from the gym's rows or says it does
--                           not know.
--     ai_coach_progress()   workouts per week, the streak, recent personal
--                           records, readings and targets — only when the member
--                           let the coach read their training (0142 consent).
--     ai_coach_bookings()   the member's upcoming class bookings, for "cancel my
--                           Friday class".
--
--   PROPOSES (a card with Apply / Discard, as before)
--     booking.create   book a class — the booking rules (quota 0017, clashes
--                      0068, who approves) apply exactly as if they tapped Book
--     booking.cancel   cancel one of their bookings, through cancel_booking()
--     program.create   a multi-week program that builds week on week (0173):
--                      their own (source 'ai', member_id) — their coach can see it
--     log.create       log a workout they did ("I did 3×10 bench at 40")
--
-- The proposal functions are extended, not rewritten: the 0146 versions are
-- renamed *_v1 and a thin dispatcher handles the new kinds and hands every
-- other kind to them unchanged.
-- ============================================================================

alter table ai_proposals drop constraint if exists ai_proposals_kind_check;
alter table ai_proposals add constraint ai_proposals_kind_check check (kind in (
  'routine.create', 'routine.replace', 'schedule.set', 'goal.create', 'meals.set',
  'booking.create', 'booking.cancel', 'program.create', 'log.create'));

-- ---------------------------------------------------------------------------
-- Readers
-- ---------------------------------------------------------------------------
create or replace function ai_coach_gym_info() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'gym', (select jsonb_build_object('name', s.gym_name, 'address', s.address, 'phone', s.phone,
                                      'opens', s.opening_time, 'closes', s.closing_time, 'closed_days', s.closed_days)
              from gym_settings s where s.gym_id = current_gym_id() limit 1),
    'plans', coalesce((select jsonb_agg(jsonb_build_object('name', p.name, 'price_php', p.price, 'days', p.duration_days,
                                                           'description', p.description) order by p.price)
                         from membership_plans p where p.gym_id = current_gym_id() and p.is_active), '[]'::jsonb),
    'house_rules', (select h.body from gym_house_rules h where h.gym_id = current_gym_id()
                     order by h.version desc limit 1),
    'classes_next_7_days', coalesce((
      select jsonb_agg(jsonb_build_object(
               'class_id', c.id, 'name', c.name, 'starts_at', c.scheduled_at, 'minutes', c.duration_minutes,
               'coach', (select concat_ws(' ', pr.first_name, pr.last_name) from profiles pr where pr.id = c.trainer_id),
               'seats_left', greatest(0, coalesce(c.capacity, 0) - (select count(*) from bookings b
                                     where b.class_id = c.id and b.status in ('pending', 'approved')))) order by c.scheduled_at)
        from classes c
       where c.gym_id = current_gym_id() and c.scheduled_at between now() and now() + interval '7 days'), '[]'::jsonb),
    'coaches', coalesce((
      select jsonb_agg(jsonb_build_object('name', concat_ws(' ', pr.first_name, pr.last_name), 'specialty', t.specialization))
        from trainer_profiles t join profiles pr on pr.id = t.profile_id
        join gym_roles g on g.user_id = t.profile_id and g.gym_id = current_gym_id() and g.role = 'trainer' and g.status = 'active'
       where t.gym_id = current_gym_id()), '[]'::jsonb),
    'note', 'These are this gym''s own records. Say you do not know anything that is not here.'
  );
$$;

create or replace function ai_coach_progress() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_gym uuid := current_gym_id();
begin
  if not ai_coach_reads_my_data() then return null; end if;
  return jsonb_build_object(
    'workouts_per_week_last_8', coalesce((
      select jsonb_agg(jsonb_build_object('week_of', w, 'workouts', n) order by w)
        from (select date_trunc('week', performed_on)::date w, count(*) n from workout_logs
               where member_id = v_me and gym_id = v_gym and completed_at is not null
                 and performed_on > current_date - 56 group by 1) x), '[]'::jsonb),
    'visits_last_30_days', (select count(*) from attendance where member_id = v_me and gym_id = v_gym
                              and check_in_time > now() - interval '30 days'),
    'personal_records', coalesce((
      select jsonb_agg(jsonb_build_object('exercise', e.name, 'kind', r.kind, 'value', r.value, 'previous', r.previous,
                                          'on', r.achieved_at::date) order by r.achieved_at desc)
        from (select * from personal_records where member_id = v_me and gym_id = v_gym and removed_at is null
               order by achieved_at desc limit 8) r left join exercises e on e.id = r.exercise_id), '[]'::jsonb),
    'readings', coalesce((
      select jsonb_agg(jsonb_build_object('on', b.measured_on, 'weight_kg', b.weight_kg, 'body_fat_pct', b.body_fat_pct,
                                          'waist_cm', b.waist_cm) order by b.measured_on desc)
        from (select * from body_measurements where member_id = v_me and gym_id = v_gym
               order by measured_on desc limit 4) b), '[]'::jsonb),
    'targets', coalesce((
      select jsonb_agg(jsonb_build_object('title', g.title, 'metric', g.metric, 'start', g.start_value,
                                          'target', g.target_value, 'by', g.target_date, 'reached_on', g.achieved_on))
        from fitness_goals g where g.member_id = v_me and g.gym_id = v_gym), '[]'::jsonb)
  );
end;
$$;

create or replace function ai_coach_bookings() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('booking_id', b.id, 'class', c.name, 'starts_at', c.scheduled_at,
                                               'status', b.status) order by c.scheduled_at), '[]'::jsonb)
    from bookings b join classes c on c.id = b.class_id
   where b.member_id = auth.uid() and b.gym_id = current_gym_id()
     and b.status in ('pending', 'approved') and c.scheduled_at > now();
$$;

revoke all on function ai_coach_gym_info() from public, anon;
revoke all on function ai_coach_progress() from public, anon;
revoke all on function ai_coach_bookings() from public, anon;
grant execute on function ai_coach_gym_info() to authenticated;
grant execute on function ai_coach_progress() to authenticated;
grant execute on function ai_coach_bookings() to authenticated;

-- ---------------------------------------------------------------------------
-- The proposal functions: 0146's become *_v1, a dispatcher handles the new kinds.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('ai_proposal_check_v1(text, jsonb, uuid, uuid)') is null then
    alter function ai_proposal_check(text, jsonb, uuid, uuid) rename to ai_proposal_check_v1;
  end if;
  if to_regprocedure('apply_ai_proposal_v1(uuid)') is null then
    alter function apply_ai_proposal(uuid) rename to apply_ai_proposal_v1;
  end if;
  if to_regprocedure('undo_ai_proposal_v1(uuid)') is null then
    alter function undo_ai_proposal(uuid) rename to undo_ai_proposal_v1;
  end if;
end
$$;
revoke all on function apply_ai_proposal_v1(uuid) from public, anon, authenticated;
revoke all on function undo_ai_proposal_v1(uuid) from public, anon, authenticated;

create or replace function ai_proposal_check(p_kind text, p_payload jsonb, p_member uuid, p_gym uuid)
returns void
language plpgsql stable security definer set search_path = public as $$
declare v_id uuid; c record; x jsonb; s jsonb; v_weeks int; v_n int; v_day int; v_days int[] := '{}';
begin
  if p_kind not in ('booking.create', 'booking.cancel', 'program.create', 'log.create') then
    perform ai_proposal_check_v1(p_kind, p_payload, p_member, p_gym);
    return;
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'That change is missing its details.';
  end if;

  if p_kind = 'booking.create' then
    begin v_id := (p_payload ->> 'class_id')::uuid; exception when others then v_id := null; end;
    select * into c from classes where id = v_id and gym_id = p_gym;
    if c.id is null then raise exception 'That class is not on this gym''s timetable.'; end if;
    if c.scheduled_at <= now() then raise exception 'That class has already started.'; end if;
    if exists (select 1 from bookings where class_id = v_id and member_id = p_member and status in ('pending', 'approved')) then
      raise exception 'You are already booked into that class.';
    end if;

  elsif p_kind = 'booking.cancel' then
    begin v_id := (p_payload ->> 'booking_id')::uuid; exception when others then v_id := null; end;
    if v_id is null or not exists (select 1 from bookings where id = v_id and member_id = p_member and gym_id = p_gym
                                     and status in ('pending', 'approved')) then
      raise exception 'That booking is not one of yours, or it is already cancelled.';
    end if;

  elsif p_kind = 'program.create' then
    if char_length(btrim(coalesce(p_payload ->> 'name', ''))) not between 1 and 60 then
      raise exception 'Give the program a name of 1 to 60 characters.';
    end if;
    v_weeks := (p_payload ->> 'weeks')::int;
    if v_weeks is null or v_weeks not between 2 and 16 then raise exception 'A program runs 2 to 16 weeks.'; end if;
    if (p_payload ->> 'deload_every') is not null and (p_payload ->> 'deload_every')::int not between 3 and 8 then
      raise exception 'A lighter week comes every 3 to 8 weeks.';
    end if;
    if jsonb_typeof(p_payload -> 'sessions') is distinct from 'array'
       or jsonb_array_length(p_payload -> 'sessions') not between 1 and 6 then
      raise exception 'A program needs 1 to 6 training days a week.';
    end if;
    for s in select e from jsonb_array_elements(p_payload -> 'sessions') e loop
      v_day := (s ->> 'day_of_week')::int;
      if v_day is null or v_day not between 0 and 6 or v_day = any(v_days) then
        raise exception 'Each training day of the week appears once.';
      end if;
      v_days := v_days || v_day;
      if char_length(btrim(coalesce(s ->> 'name', ''))) not between 1 and 40 then
        raise exception 'Name each training day (1 to 40 characters).';
      end if;
      v_n := jsonb_array_length(coalesce(s -> 'exercises', '[]'::jsonb));
      if v_n not between 1 and 12 then raise exception 'Each training day needs 1 to 12 exercises.'; end if;
      for x in select e from jsonb_array_elements(s -> 'exercises') e loop
        begin v_id := (x ->> 'exercise_id')::uuid; exception when others then v_id := null; end;
        if v_id is null or not exists (select 1 from exercises e where e.id = v_id and e.is_active and (e.gym_id is null or e.gym_id = p_gym)) then
          raise exception 'Every exercise in a program must be one from this gym''s list.';
        end if;
        if coalesce((x ->> 'target_sets')::int, 0) not between 1 and 20 then raise exception 'Sets must be between 1 and 20.'; end if;
        if coalesce(x ->> 'progress_kind', 'none') not in ('none', 'weight', 'reps', 'sets', 'seconds') then
          raise exception 'Each week can add weight, reps, sets or seconds — or stay the same.';
        end if;
        if coalesce((x ->> 'progress_step')::numeric, 0) not between 0 and 20 then raise exception 'A weekly step must be between 0 and 20.'; end if;
      end loop;
    end loop;

  elsif p_kind = 'log.create' then
    if (p_payload ->> 'performed_on')::date not between current_date - 30 and current_date then
      raise exception 'A workout can be logged for today or up to 30 days back.';
    end if;
    if char_length(btrim(coalesce(p_payload ->> 'activity', ''))) not between 1 and 60 then
      raise exception 'Say what the workout was (1 to 60 characters).';
    end if;
    v_n := jsonb_array_length(coalesce(p_payload -> 'sets', '[]'::jsonb));
    if v_n not between 1 and 60 then raise exception 'Log 1 to 60 sets.'; end if;
    for x in select e from jsonb_array_elements(p_payload -> 'sets') e loop
      begin v_id := (x ->> 'exercise_id')::uuid; exception when others then v_id := null; end;
      if v_id is null or not exists (select 1 from exercises e where e.id = v_id and (e.gym_id is null or e.gym_id = p_gym)) then
        raise exception 'Each set needs an exercise from this gym''s list.';
      end if;
      if (x ->> 'reps') is null and (x ->> 'seconds') is null then raise exception 'Each set needs its reps or its seconds.'; end if;
    end loop;
  end if;
end;
$$;
revoke all on function ai_proposal_check(text, jsonb, uuid, uuid) from public, anon, authenticated;

create or replace function apply_ai_proposal(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := ai_proposal_member(); v_gym uuid := current_gym_id();
  p ai_proposals%rowtype; v_id uuid; v_prog uuid; v_w uuid; s jsonb; x jsonb; wk int; n int; v_log uuid;
  v_workouts uuid[] := '{}';
begin
  select * into p from ai_proposals where id = p_id and member_id = v_me and gym_id = v_gym;
  if p.id is null then raise exception 'That change was not found.'; end if;
  if p.kind not in ('booking.create', 'booking.cancel', 'program.create', 'log.create') then
    return apply_ai_proposal_v1(p_id);
  end if;
  select * into p from ai_proposals where id = p_id for update;
  if p.status <> 'pending' then raise exception 'Only a waiting change can be applied.'; end if;
  perform ai_proposal_check(p.kind, p.payload, v_me, v_gym);

  if p.kind = 'booking.create' then
    -- The member's own booking, exactly as Book: the triggers judge quota, clashes and approval.
    insert into bookings (gym_id, member_id, class_id, status)
    values (v_gym, v_me, (p.payload ->> 'class_id')::uuid, 'pending') returning id into v_id;
    update ai_proposals set status = 'applied', decided_at = now(), undo = jsonb_build_object('booking_id', v_id) where id = p.id;
    return jsonb_build_object('booking_id', v_id);

  elsif p.kind = 'booking.cancel' then
    perform cancel_booking('class', (p.payload ->> 'booking_id')::uuid,
                           coalesce(p.payload ->> 'reason_key', 'changed_plans'), 'Cancelled with the AI coach');
    update ai_proposals set status = 'applied', decided_at = now(), undo = '{}'::jsonb where id = p.id;
    return '{}'::jsonb;

  elsif p.kind = 'program.create' then
    if not plan_allows(v_me, 'workout_tracker') then
      raise exception 'Your plan does not include the workout tracker, so programs cannot be saved.';
    end if;
    insert into gym_programs (gym_id, name, description, weeks, published, source, member_id, author_id, deload_every)
    values (v_gym, btrim(p.payload ->> 'name'), p.payload ->> 'notes', (p.payload ->> 'weeks')::int, true, 'ai', v_me, v_me,
            (p.payload ->> 'deload_every')::int)
    returning id into v_prog;
    for s in select e from jsonb_array_elements(p.payload -> 'sessions') e loop
      insert into gym_workouts (gym_id, name, published, created_by) values (v_gym, btrim(s ->> 'name'), true, v_me) returning id into v_w;
      v_workouts := v_workouts || v_w;
      n := 0;
      for x in select e from jsonb_array_elements(s -> 'exercises') e loop
        insert into gym_workout_items (gym_id, workout_id, position, exercise_id, target_sets, target_reps, target_seconds,
                                       rest_seconds, target_weight_kg, progress_kind, progress_step)
        values (v_gym, v_w, n, (x ->> 'exercise_id')::uuid, (x ->> 'target_sets')::int, (x ->> 'target_reps')::int,
                (x ->> 'target_seconds')::int, coalesce((x ->> 'rest_seconds')::int, 60), (x ->> 'target_weight_kg')::numeric,
                coalesce(x ->> 'progress_kind', 'none'), coalesce((x ->> 'progress_step')::numeric, 0));
        n := n + 1;
      end loop;
      for wk in 1 .. (p.payload ->> 'weeks')::int loop
        insert into gym_program_days (gym_id, program_id, week, day, workout_id)
        values (v_gym, v_prog, wk, (s ->> 'day_of_week')::int + 1, v_w);
      end loop;
    end loop;
    perform enrol_member(v_me, v_prog, v_me);
    update ai_proposals set status = 'applied', decided_at = now(),
           undo = jsonb_build_object('program_id', v_prog, 'workouts', to_jsonb(v_workouts)) where id = p.id;
    return jsonb_build_object('program_id', v_prog);

  else -- log.create
    insert into workout_logs (gym_id, member_id, activity, performed_on, completed_at)
    values (v_gym, v_me, btrim(p.payload ->> 'activity'), (p.payload ->> 'performed_on')::date, now())
    returning id into v_log;
    n := 1;
    for x in select e from jsonb_array_elements(p.payload -> 'sets') e loop
      insert into workout_sets (gym_id, log_id, exercise_id, set_number, reps, weight_kg, duration_seconds)
      values (v_gym, v_log, (x ->> 'exercise_id')::uuid, n, (x ->> 'reps')::int, (x ->> 'weight_kg')::numeric, (x ->> 'seconds')::int);
      n := n + 1;
    end loop;
    update ai_proposals set status = 'applied', decided_at = now(), undo = jsonb_build_object('log_id', v_log) where id = p.id;
    return jsonb_build_object('log_id', v_log);
  end if;
end;
$$;
revoke all on function apply_ai_proposal(uuid) from public, anon;
grant execute on function apply_ai_proposal(uuid) to authenticated;

create or replace function undo_ai_proposal(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_me uuid := ai_proposal_member(); v_gym uuid := current_gym_id(); p ai_proposals%rowtype;
begin
  select * into p from ai_proposals where id = p_id and member_id = v_me and gym_id = v_gym;
  if p.id is null then raise exception 'That change was not found.'; end if;
  if p.kind not in ('booking.create', 'booking.cancel', 'program.create', 'log.create') then
    perform undo_ai_proposal_v1(p_id);
    return;
  end if;
  if p.status <> 'applied' then raise exception 'Only an applied change can be undone.'; end if;
  if p.kind = 'booking.cancel' then
    raise exception 'A cancelled booking cannot be restored here — book the class again.';
  elsif p.kind = 'booking.create' then
    perform cancel_booking('class', (p.undo ->> 'booking_id')::uuid, 'changed_plans', 'Undone with the AI coach');
  elsif p.kind = 'program.create' then
    update program_enrolments set status = 'left', ended_at = now()
     where member_id = v_me and program_id = (p.undo ->> 'program_id')::uuid and status = 'active';
    delete from gym_programs where id = (p.undo ->> 'program_id')::uuid and member_id = v_me and source = 'ai';
    delete from gym_workouts where id in (select (jsonb_array_elements_text(p.undo -> 'workouts'))::uuid)
      and created_by = v_me and not exists (select 1 from workout_logs l where l.gym_workout_id = gym_workouts.id);
  else
    delete from workout_logs where id = (p.undo ->> 'log_id')::uuid and member_id = v_me;
  end if;
  update ai_proposals set status = 'undone', decided_at = now() where id = p.id;
end;
$$;
revoke all on function undo_ai_proposal(uuid) from public, anon;
grant execute on function undo_ai_proposal(uuid) to authenticated;

create or replace function migration_0177_applied() returns boolean
language sql immutable as $marker$ select true $marker$;
revoke all on function migration_0177_applied() from public, anon;
grant execute on function migration_0177_applied() to authenticated;
comment on function migration_0177_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0177.sql
