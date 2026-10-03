-- ============================================================================
-- 0146 — meal guidance: the coach proposes a meal guide, portions by hand,
--        never numbers
-- ============================================================================
-- AI coach, Phase 4. The coach may suggest a meal guide — everyday meal ideas
-- with portions by hand size (a palm of protein, a fist of rice) — as one more
-- kind of proposal, 'meals.set'. Like every proposal it changes nothing until
-- the member taps Apply, and Undo puts back the guide it replaced (or none).
--
--   * meal_text_ok(text) — the rule that a guide carries no number targets: no
--     calorie/kcal/kJ figure, no "macro(s)", no gram figure, no percentage.
--     Counts of things are fine ("2 eggs", "1 cup of rice"). Enforced in the
--     database, on every title and item, at create and again at apply.
--     (Postgres regex: \b is a backspace, not a word boundary — \M ends a word.)
--   * ai_meal_guides — one current guide per member per gym. RLS on, no write
--     policy for any role: only apply_ai_proposal()/undo_ai_proposal() write it.
--     The member reads their own; a trainer reads it only for a member they
--     train (0082's is_my_trainee) who shares goals with trainers (0032's
--     trainer_may_see 'goals'). The desk and the owner never: trainer_may_see
--     alone lets admin and staff through, so the policy asks for the trainer
--     role first, as 0123's member_personal_records() does.
--   * my_meal_guide(), trainee_meal_guide(member) — the two reads the apps use.
--   * ai_proposal_check / apply_ai_proposal / undo_ai_proposal — 0145's bodies,
--     unchanged, plus a meals.set branch each (gated by the gym's progress
--     switch, as goal.create is). Grants are 0145's: create or replace keeps them.
-- ============================================================================

-- ---- the no-numbers rule ----------------------------------------------------------------------
create or replace function meal_text_ok(p text) returns boolean
language sql immutable set search_path = public as $$
  select p is null or not (
       p ~* '\d[\d,.]*\s*(k?cal|kcals?|kilocalories?|calories?|kj)\M'
    or p ~* '\mmacros?\M'
    or p ~* '\d[\d,.]*\s*(g|grams?)\M'
    or p ~* '\d+\s*%');
$$;
revoke all on function meal_text_ok(text) from public, anon;
grant execute on function meal_text_ok(text) to authenticated;

-- ---- the guide ------------------------------------------------------------------------------
create table if not exists ai_meal_guides (
  gym_id      uuid not null default acting_gym_id() references gyms(id),
  member_id   uuid not null references profiles(id) on delete cascade,
  sections    jsonb not null,
  updated_at  timestamptz not null default now(),
  primary key (gym_id, member_id)
);

alter table ai_meal_guides enable row level security;
revoke all on ai_meal_guides from anon;
grant select on ai_meal_guides to authenticated;
drop policy if exists ai_meal_guides_read on ai_meal_guides;
create policy ai_meal_guides_read on ai_meal_guides for select to authenticated
  using (member_id = auth.uid()
         or (storage_role_here() = 'trainer' and is_my_trainee(member_id) and trainer_may_see(member_id, 'goals')));
-- No insert/update/delete policy, for any role.
drop policy if exists tenant_select on ai_meal_guides;
create policy tenant_select on ai_meal_guides as restrictive for select to anon, authenticated
  using (gym_id = current_gym_id());

-- ---- a new kind of proposal -----------------------------------------------------------------
alter table ai_proposals drop constraint if exists ai_proposals_kind_check;
alter table ai_proposals add constraint ai_proposals_kind_check
  check (kind in ('routine.create', 'routine.replace', 'schedule.set', 'goal.create', 'meals.set'));

-- ---- one check, used by create and by apply (0145 + meals.set) ------------------------------
create or replace function ai_proposal_check(p_kind text, p_payload jsonb, p_member uuid, p_gym uuid)
returns void
language plpgsql stable security definer set search_path = public as $$
declare
  v_name text; v_notes text; v_ex jsonb; v_n int; v_id uuid; v_txt text;
  v_sets int; v_reps int; v_kg numeric; v_secs int; v_rest int;
  v_day int; v_days int[] := '{}'; v_at text; v_title text; v_metric text;
  v_start numeric; v_target numeric; v_date date;
  v_sec jsonb; v_item jsonb;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'That change is missing its details.';
  end if;

  if p_kind in ('routine.create', 'routine.replace') then
    if p_kind = 'routine.replace' then
      begin
        v_id := (p_payload ->> 'routine_id')::uuid;
      exception when others then
        raise exception 'That routine is not one of yours, or it has been deleted.';
      end;
      if v_id is null or not exists (select 1 from workout_routines r
           where r.id = v_id and r.member_id = p_member and r.gym_id = p_gym) then
        raise exception 'That routine is not one of yours, or it has been deleted.';
      end if;
    end if;

    v_name := btrim(coalesce(p_payload ->> 'name', ''));
    if char_length(v_name) not between 1 and 40 then
      raise exception 'Give the routine a name of 1 to 40 characters.';
    end if;
    v_notes := p_payload ->> 'notes';
    if v_notes is not null and char_length(v_notes) > 280 then
      raise exception 'Keep the routine''s notes to 280 characters.';
    end if;
    if jsonb_typeof(p_payload -> 'exercises') is distinct from 'array' then
      raise exception 'A routine needs 1 to 12 exercises.';
    end if;
    v_n := jsonb_array_length(p_payload -> 'exercises');
    if v_n not between 1 and 12 then
      raise exception 'A routine needs 1 to 12 exercises.';
    end if;

    for v_ex in select e from jsonb_array_elements(p_payload -> 'exercises') e loop
      if jsonb_typeof(v_ex) <> 'object' then
        raise exception 'Each exercise needs its sets and rest.';
      end if;
      begin
        v_id := (v_ex ->> 'exercise_id')::uuid;
        v_sets := (v_ex ->> 'target_sets')::int;
        v_reps := (v_ex ->> 'target_reps')::int;
        v_kg := (v_ex ->> 'target_weight_kg')::numeric;
        v_secs := (v_ex ->> 'target_seconds')::int;
        v_rest := (v_ex ->> 'rest_seconds')::int;
      exception when others then
        raise exception 'Each exercise needs its numbers written as numbers.';
      end;
      v_txt := nullif(btrim(coalesce(v_ex ->> 'custom_name', '')), '');
      if v_id is null and v_txt is null then
        raise exception 'Each exercise needs to be one from the list, or have a name.';
      end if;
      if v_id is not null and not exists (
           select 1 from exercises e
            where e.id = v_id and e.is_active and (e.gym_id is null or e.gym_id = p_gym)
              and not exists (select 1 from gym_exercise_media m
                               where m.gym_id = p_gym and m.exercise_id = e.id and m.hidden)) then
        raise exception 'One of those exercises is not available at this gym.';
      end if;
      if v_id is null and char_length(v_txt) > 60 then
        raise exception 'An exercise name must be 1 to 60 characters.';
      end if;
      if v_sets is null or v_sets not between 1 and 20 then
        raise exception 'Sets must be between 1 and 20.';
      end if;
      if v_reps is not null and v_reps not between 1 and 200 then
        raise exception 'Reps must be between 1 and 200.';
      end if;
      if v_kg is not null and (v_kg < 0 or v_kg > 1000) then
        raise exception 'A weight must be between 0 and 1000 kg.';
      end if;
      if v_secs is not null and v_secs not between 1 and 7200 then
        raise exception 'A timed exercise must be between 1 second and 2 hours.';
      end if;
      if v_rest is null or v_rest not between 0 and 600 then
        raise exception 'Rest must be between 0 and 600 seconds.';
      end if;
    end loop;

  elsif p_kind = 'schedule.set' then
    if jsonb_typeof(p_payload -> 'days') is distinct from 'array'
       or jsonb_array_length(p_payload -> 'days') not between 1 and 7 then
      raise exception 'A schedule needs 1 to 7 days.';
    end if;
    for v_ex in select e from jsonb_array_elements(p_payload -> 'days') e loop
      if jsonb_typeof(v_ex) <> 'object' then
        raise exception 'Each day of a schedule needs its day of the week.';
      end if;
      begin
        v_day := (v_ex ->> 'day_of_week')::int;
        v_id := (v_ex ->> 'routine_id')::uuid;
      exception when others then
        raise exception 'Days must be 0 (Sunday) to 6 (Saturday).';
      end;
      if v_day is null or v_day not between 0 and 6 then
        raise exception 'Days must be 0 (Sunday) to 6 (Saturday).';
      end if;
      if v_day = any(v_days) then
        raise exception 'Each day can appear only once.';
      end if;
      v_days := v_days || v_day;
      if v_id is not null and not exists (select 1 from workout_routines r
           where r.id = v_id and r.member_id = p_member and r.gym_id = p_gym) then
        raise exception 'That routine is not one of yours, or it has been deleted.';
      end if;
      v_at := v_ex ->> 'remind_at';
      if v_at is not null and v_at !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
        raise exception 'A reminder time must look like 17:00.';
      end if;
    end loop;

  elsif p_kind = 'goal.create' then
    -- A gym that switched progress off has no goals screen: a goal made here would be invisible.
    if not gym_module_on(p_gym, 'progress') then
      raise exception 'Your gym doesn''t use goals in the app.';
    end if;
    v_title := btrim(coalesce(p_payload ->> 'title', ''));
    if char_length(v_title) not between 1 and 80 then
      raise exception 'Give the goal a title of 1 to 80 characters.';
    end if;
    v_metric := coalesce(p_payload ->> 'metric', '');
    if v_metric not in ('weight_kg', 'body_fat_pct', 'waist_cm', 'workouts_per_week', 'custom') then
      raise exception 'Choose one of the goal types listed.';
    end if;
    begin
      v_start := (p_payload ->> 'start_value')::numeric;
      v_target := (p_payload ->> 'target_value')::numeric;
    exception when others then
      raise exception 'A goal''s numbers must be written as numbers.';
    end;
    -- Compared after rounding to the column's two places: 9999.995 would store as 10000.00 and overflow.
    if (v_start is not null and abs(round(v_start, 2)) > 9999.99)
       or (v_target is not null and abs(round(v_target, 2)) > 9999.99) then
      raise exception 'A goal''s numbers must be under 10,000.';
    end if;
    begin
      v_date := (p_payload ->> 'target_date')::date;
    exception when others then
      raise exception 'A target date must be between today and two years from now.';
    end;
    if v_date is not null and (v_date < manila_today() or v_date > (manila_today() + interval '2 years')::date) then
      raise exception 'A target date must be between today and two years from now.';
    end if;

  elsif p_kind = 'meals.set' then
    -- 0146. A meal guide lives under Progress: a gym that switched progress off has nowhere to show it.
    if not gym_module_on(p_gym, 'progress') then
      raise exception 'Your gym doesn''t use meal guides in the app.';
    end if;
    if jsonb_typeof(p_payload -> 'sections') is distinct from 'array'
       or jsonb_array_length(p_payload -> 'sections') not between 1 and 6 then
      raise exception 'That meal guide isn''t complete.';
    end if;
    for v_sec in select e from jsonb_array_elements(p_payload -> 'sections') e loop
      if jsonb_typeof(v_sec) <> 'object'
         or jsonb_typeof(v_sec -> 'title') is distinct from 'string'
         or char_length(btrim(v_sec ->> 'title')) not between 1 and 40
         or jsonb_typeof(v_sec -> 'items') is distinct from 'array'
         or jsonb_array_length(v_sec -> 'items') not between 1 and 8 then
        raise exception 'That meal guide isn''t complete.';
      end if;
      if not meal_text_ok(v_sec ->> 'title') then
        raise exception 'Meal guidance can''t include calorie, gram, macro or percentage targets.';
      end if;
      for v_item in select i from jsonb_array_elements(v_sec -> 'items') i loop
        if jsonb_typeof(v_item) is distinct from 'string'
           or char_length(btrim(v_item #>> '{}')) not between 1 and 200 then
          raise exception 'That meal guide isn''t complete.';
        end if;
        if not meal_text_ok(v_item #>> '{}') then
          raise exception 'Meal guidance can''t include calorie, gram, macro or percentage targets.';
        end if;
      end loop;
    end loop;

  else
    raise exception 'That is not a change the coach can make.';
  end if;
end;
$$;
revoke all on function ai_proposal_check(text, jsonb, uuid, uuid) from public, anon, authenticated;

-- ---- apply (0145 + meals.set) ---------------------------------------------------------------
create or replace function apply_ai_proposal(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := ai_proposal_member(); v_gym uuid := current_gym_id();
  p ai_proposals%rowtype; v_routine uuid; v_undo jsonb; v_goal uuid;
  v_old jsonb;
begin
  select * into p from ai_proposals
   where id = p_id and member_id = v_me and gym_id = v_gym for update;
  if p.id is null then
    raise exception 'That change was not found.';
  end if;
  if p.status <> 'pending' then
    raise exception 'Only a waiting change can be applied.';
  end if;
  perform ai_proposal_check(p.kind, p.payload, v_me, v_gym);
  if p.kind in ('routine.create', 'routine.replace') and not plan_allows(v_me, 'workout_tracker') then
    raise exception 'Your plan does not include the workout tracker, so routines cannot be saved.';
  end if;

  if p.kind = 'routine.create' then
    insert into workout_routines (gym_id, member_id, name, notes, position, source)
    values (v_gym, v_me, btrim(p.payload ->> 'name'), p.payload ->> 'notes',
            coalesce((select max(r.position) + 1 from workout_routines r
                       where r.member_id = v_me and r.gym_id = v_gym), 0), 'coach')
    returning id into v_routine;
    insert into workout_routine_exercises (gym_id, routine_id, position, exercise_id, custom_name,
      target_sets, target_reps, target_weight_kg, target_seconds, rest_seconds)
    select v_gym, v_routine, (x.n - 1)::int, (x.e ->> 'exercise_id')::uuid,
           case when x.e ->> 'exercise_id' is null then btrim(x.e ->> 'custom_name') end,
           (x.e ->> 'target_sets')::int, (x.e ->> 'target_reps')::int, (x.e ->> 'target_weight_kg')::numeric,
           (x.e ->> 'target_seconds')::int, (x.e ->> 'rest_seconds')::int
      from jsonb_array_elements(p.payload -> 'exercises') with ordinality as x(e, n);
    v_undo := jsonb_build_object('routine_id', v_routine);

  elsif p.kind = 'routine.replace' then
    v_routine := (p.payload ->> 'routine_id')::uuid;
    select jsonb_build_object('routine_id', r.id, 'name', r.name, 'notes', r.notes, 'source', r.source,
             'exercises', coalesce((select jsonb_agg(jsonb_build_object(
                 'exercise_id', e.exercise_id, 'name', coalesce(x.name, e.custom_name), 'custom_name', e.custom_name,
                 'target_sets', e.target_sets, 'target_reps', e.target_reps, 'target_weight_kg', e.target_weight_kg,
                 'target_seconds', e.target_seconds, 'rest_seconds', e.rest_seconds) order by e.position, e.id)
               from workout_routine_exercises e left join exercises x on x.id = e.exercise_id
              where e.routine_id = r.id), '[]'::jsonb))
      into v_undo
      from workout_routines r where r.id = v_routine and r.member_id = v_me and r.gym_id = v_gym;
    update workout_routines set name = btrim(p.payload ->> 'name'), notes = p.payload ->> 'notes', source = 'coach'
     where id = v_routine and member_id = v_me and gym_id = v_gym;
    if not found then
      raise exception 'That routine is not one of yours, or it has been deleted.';
    end if;
    delete from workout_routine_exercises where routine_id = v_routine;
    insert into workout_routine_exercises (gym_id, routine_id, position, exercise_id, custom_name,
      target_sets, target_reps, target_weight_kg, target_seconds, rest_seconds)
    select v_gym, v_routine, (x.n - 1)::int, (x.e ->> 'exercise_id')::uuid,
           case when x.e ->> 'exercise_id' is null then btrim(x.e ->> 'custom_name') end,
           (x.e ->> 'target_sets')::int, (x.e ->> 'target_reps')::int, (x.e ->> 'target_weight_kg')::numeric,
           (x.e ->> 'target_seconds')::int, (x.e ->> 'rest_seconds')::int
      from jsonb_array_elements(p.payload -> 'exercises') with ordinality as x(e, n);

  elsif p.kind = 'schedule.set' then
    select jsonb_build_object('days', coalesce(jsonb_agg(jsonb_build_object(
             'day_of_week', g.day_of_week, 'remind_at', g.remind_at, 'active', g.active,
             'routine_id', g.routine_id, 'source', g.source, 'last_reminded_on', g.last_reminded_on)
             order by g.day_of_week), '[]'::jsonb))
      into v_undo
      from gym_plans g where g.member_id = v_me and g.gym_id = v_gym;
    delete from gym_plans where member_id = v_me and gym_id = v_gym;
    insert into gym_plans (gym_id, member_id, day_of_week, remind_at, active, routine_id, source)
    select v_gym, v_me, (d ->> 'day_of_week')::int, coalesce((d ->> 'remind_at')::time, '17:00'::time), true,
           (d ->> 'routine_id')::uuid, 'coach'
      from jsonb_array_elements(p.payload -> 'days') d;

  elsif p.kind = 'goal.create' then
    insert into fitness_goals (gym_id, member_id, title, metric, start_value, target_value, target_date)
    values (v_gym, v_me, btrim(p.payload ->> 'title'), p.payload ->> 'metric',
            (p.payload ->> 'start_value')::numeric, (p.payload ->> 'target_value')::numeric,
            (p.payload ->> 'target_date')::date)
    returning id into v_goal;
    v_undo := jsonb_build_object('goal_id', v_goal);

  elsif p.kind = 'meals.set' then
    -- 0146. One guide per member per gym: keep what it replaces (null: there was none) for undo.
    select m.sections into v_old from ai_meal_guides m
     where m.gym_id = v_gym and m.member_id = v_me for update;
    v_undo := jsonb_build_object('sections', v_old);
    insert into ai_meal_guides (gym_id, member_id, sections, updated_at)
    values (v_gym, v_me, p.payload -> 'sections', now())
    on conflict (gym_id, member_id) do update set sections = excluded.sections, updated_at = excluded.updated_at;
  end if;

  update ai_proposals set status = 'applied', undo = v_undo, decided_at = now()
   where id = p.id and status = 'pending';
  if not found then
    raise exception 'Only a waiting change can be applied.';
  end if;
  return jsonb_strip_nulls(jsonb_build_object('kind', p.kind, 'routine_id', v_routine));
end;
$$;

-- ---- undo (0145 + meals.set) ----------------------------------------------------------------
create or replace function undo_ai_proposal(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := ai_proposal_member(); v_gym uuid := current_gym_id();
  p ai_proposals%rowtype; v_routine uuid; v_goal uuid; v_reached date; v_touched timestamptz;
begin
  select * into p from ai_proposals
   where id = p_id and member_id = v_me and gym_id = v_gym for update;
  if p.id is null then
    raise exception 'That change was not found.';
  end if;
  if p.status <> 'applied' then
    raise exception 'Only an applied change can be undone.';
  end if;
  -- Undoing an older schedule (or an older rewrite of the same routine) would silently throw
  -- away a newer one that is still in place: that one must be undone first.
  if p.kind in ('schedule.set', 'routine.replace') and exists (
       select 1 from ai_proposals n
        where n.gym_id = v_gym and n.member_id = v_me and n.id <> p.id
          and n.kind = p.kind and n.status = 'applied'
          and (n.decided_at, n.created_at) > (p.decided_at, p.created_at)
          and (p.kind = 'schedule.set' or n.payload ->> 'routine_id' = p.payload ->> 'routine_id')) then
    raise exception 'A newer change from the coach replaced this one — undo that first.';
  end if;
  -- The same for a routine the coach made and later rewrote: deleting it would lose the rewrite too.
  if p.kind = 'routine.create' and exists (
       select 1 from ai_proposals n
        where n.gym_id = v_gym and n.member_id = v_me and n.id <> p.id
          and n.kind = 'routine.replace' and n.status = 'applied'
          and n.payload ->> 'routine_id' = p.undo ->> 'routine_id') then
    raise exception 'A newer change from the coach replaced this one — undo that first.';
  end if;
  -- 0146: a member has one meal guide, so any newer applied guide is in the way.
  if p.kind = 'meals.set' and exists (
       select 1 from ai_proposals n
        where n.gym_id = v_gym and n.member_id = v_me and n.id <> p.id
          and n.kind = 'meals.set' and n.status = 'applied'
          and (n.decided_at, n.created_at) > (p.decided_at, p.created_at)) then
    raise exception 'A newer change from the coach replaced this one — undo that first.';
  end if;

  -- Undo must never overwrite the member's own later edits. A routine: its updated_at (moved
  -- by 0086's trigger and, above, by any exercise write) is compared with the coach's last
  -- write to it — this proposal's or a later one's apply/undo, each of which sets decided_at
  -- = now() in the same transaction as its writes, so the coach's own writes never trip it.
  if p.kind in ('routine.create', 'routine.replace') then
    v_routine := (p.undo ->> 'routine_id')::uuid;
    select r.updated_at into v_touched from workout_routines r
     where r.id = v_routine and r.member_id = v_me and r.gym_id = v_gym;
    if p.kind = 'routine.create' and exists (select 1 from workout_logs l where l.routine_id = v_routine) then
      raise exception 'You have already trained with this routine. Delete it yourself from My routines if you want it gone.';
    end if;
    if v_touched is not null and v_touched > (
         select max(n.decided_at) from ai_proposals n
          where n.gym_id = v_gym and n.member_id = v_me
            and n.kind in ('routine.create', 'routine.replace') and n.status in ('applied', 'undone')
            and n.undo ->> 'routine_id' = v_routine::text) then
      raise exception 'You''ve changed this yourself since — undo isn''t safe now. Edit it directly instead.';
    end if;
  -- A schedule: the member's plan days here must still be exactly the set apply wrote (a
  -- routine deleted since reads as "any workout", as gym_plans' on-delete-set-null made it).
  elsif p.kind = 'schedule.set' then
    if exists (
         (select g.day_of_week, g.routine_id, g.remind_at, g.active, g.source
            from gym_plans g where g.member_id = v_me and g.gym_id = v_gym)
         except
         (select (d ->> 'day_of_week')::int,
                 (select r.id from workout_routines r where r.id = (d ->> 'routine_id')::uuid),
                 coalesce((d ->> 'remind_at')::time, '17:00'::time), true, 'coach'
            from jsonb_array_elements(p.payload -> 'days') d))
       or exists (
         (select (d ->> 'day_of_week')::int,
                 (select r.id from workout_routines r where r.id = (d ->> 'routine_id')::uuid),
                 coalesce((d ->> 'remind_at')::time, '17:00'::time), true, 'coach'
            from jsonb_array_elements(p.payload -> 'days') d)
         except
         (select g.day_of_week, g.routine_id, g.remind_at, g.active, g.source
            from gym_plans g where g.member_id = v_me and g.gym_id = v_gym)) then
      raise exception 'You''ve changed this yourself since — undo isn''t safe now. Edit it directly instead.';
    end if;
  -- 0146. A meal guide: the routines' rule — moved since the coach's last write to it (any meals.set
  -- apply or undo, each setting decided_at = now() with its write) means undo would overwrite it.
  elsif p.kind = 'meals.set' then
    select m.updated_at into v_touched from ai_meal_guides m where m.gym_id = v_gym and m.member_id = v_me;
    if v_touched is not null and v_touched > (
         select max(n.decided_at) from ai_proposals n
          where n.gym_id = v_gym and n.member_id = v_me
            and n.kind = 'meals.set' and n.status in ('applied', 'undone')) then
      raise exception 'You''ve changed this yourself since — undo isn''t safe now. Edit it directly instead.';
    end if;
  end if;

  if p.kind = 'routine.create' then
    v_routine := (p.undo ->> 'routine_id')::uuid;
    -- Already deleted by the member: there is nothing left to take away.
    delete from workout_routines where id = v_routine and member_id = v_me and gym_id = v_gym;

  elsif p.kind = 'routine.replace' then
    v_routine := (p.undo ->> 'routine_id')::uuid;
    if not plan_allows(v_me, 'workout_tracker') then
      raise exception 'Your plan does not include the workout tracker, so routines cannot be saved.';
    end if;
    update workout_routines set name = p.undo ->> 'name', notes = p.undo ->> 'notes',
           source = coalesce(p.undo ->> 'source', 'member')
     where id = v_routine and member_id = v_me and gym_id = v_gym;
    if not found then
      raise exception 'That routine has been deleted since.';
    end if;
    delete from workout_routine_exercises where routine_id = v_routine;
    -- An exercise removed from the catalogue since comes back under its name.
    insert into workout_routine_exercises (gym_id, routine_id, position, exercise_id, custom_name,
      target_sets, target_reps, target_weight_kg, target_seconds, rest_seconds)
    select v_gym, v_routine, (x.n - 1)::int, ex.id,
           case when ex.id is null then coalesce(x.e ->> 'custom_name', x.e ->> 'name') else x.e ->> 'custom_name' end,
           (x.e ->> 'target_sets')::int, (x.e ->> 'target_reps')::int, (x.e ->> 'target_weight_kg')::numeric,
           (x.e ->> 'target_seconds')::int, (x.e ->> 'rest_seconds')::int
      from jsonb_array_elements(p.undo -> 'exercises') with ordinality as x(e, n)
      left join exercises ex on ex.id = (x.e ->> 'exercise_id')::uuid;

  elsif p.kind = 'schedule.set' then
    delete from gym_plans where member_id = v_me and gym_id = v_gym;
    -- A routine deleted since goes back as "any workout".
    insert into gym_plans (gym_id, member_id, day_of_week, remind_at, active, routine_id, source, last_reminded_on)
    select v_gym, v_me, (d ->> 'day_of_week')::int, (d ->> 'remind_at')::time, (d ->> 'active')::boolean,
           (select r.id from workout_routines r
             where r.id = (d ->> 'routine_id')::uuid and r.member_id = v_me and r.gym_id = v_gym),
           coalesce(d ->> 'source', 'member'), (d ->> 'last_reminded_on')::date
      from jsonb_array_elements(p.undo -> 'days') d;

  elsif p.kind = 'goal.create' then
    v_goal := (p.undo ->> 'goal_id')::uuid;
    select g.achieved_on into v_reached from fitness_goals g
     where g.id = v_goal and g.member_id = v_me and g.gym_id = v_gym;
    if v_reached is not null then
      raise exception 'You reached that goal — it stays.';
    end if;
    -- Already deleted by the member: there is nothing left to take away.
    delete from fitness_goals where id = v_goal and member_id = v_me and gym_id = v_gym;

  elsif p.kind = 'meals.set' then
    -- Back to the guide it replaced, or to none.
    if jsonb_typeof(p.undo -> 'sections') = 'array' then
      insert into ai_meal_guides (gym_id, member_id, sections, updated_at)
      values (v_gym, v_me, p.undo -> 'sections', now())
      on conflict (gym_id, member_id) do update set sections = excluded.sections, updated_at = excluded.updated_at;
    else
      delete from ai_meal_guides where gym_id = v_gym and member_id = v_me;
    end if;
  end if;

  update ai_proposals set status = 'undone', decided_at = now()
   where id = p.id and status = 'applied';
  if not found then
    raise exception 'Only an applied change can be undone.';
  end if;
end;
$$;

-- ---- the two reads --------------------------------------------------------------------------
create or replace function my_meal_guide() returns jsonb
language sql stable security definer set search_path = public as $$
  select m.sections from ai_meal_guides m
   where m.gym_id = current_gym_id() and m.member_id = auth.uid();
$$;

-- A trainer's view of one member's guide: only a member they train, only while that member
-- shares goals with trainers. Anyone else — the desk, the owner, another trainer — gets null.
create or replace function trainee_meal_guide(p_member uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select m.sections from ai_meal_guides m
   where m.gym_id = current_gym_id() and m.member_id = p_member
     and storage_role_here() = 'trainer'
     and is_my_trainee(p_member)
     and trainer_may_see(p_member, 'goals');
$$;

revoke all on function my_meal_guide(), trainee_meal_guide(uuid) from public, anon;
grant execute on function my_meal_guide(), trainee_meal_guide(uuid) to authenticated;

-- ---- tenancy: the guides are the gym's ------------------------------------------------------
create or replace function tenancy_gym_tables() returns text[] language sql immutable as $$
  select array['account_status_events','achievement_unlocks','achievements','activity_log',
    'ai_coach_profiles','ai_meal_guides','ai_proposals','ai_usage_days',
    'assistant_conversations','assistant_messages','attendance','body_measurements','bookings',
    'cancellation_reasons','cash_closeouts','challenge_participants','challenges','class_templates',
    'class_waitlist','classes','conversations','event_registrations','events','fitness_goals','freemium_trials',
    'goal_templates','gym_exercise_media','gym_goals','gym_invitations','gym_modules','gym_photos','gym_plans',
    'gym_program_days','gym_programs','gym_settings','gym_waivers','gym_workout_items','gym_workouts',
    'invoice_counters','member_profiles','member_share_prefs','membership_events',
    'membership_plans','membership_requests','memberships','messages',
    'notifications','payments','pending_registrations','personal_records','plan_features',
    'point_ledger','point_rules','program_enrolments','progress_photos',
    'pt_sessions','referral_codes','referrals','refund_rules','renewal_requests',
    'reward_redemptions','rewards','room_assignments','room_comments','room_members','room_posts',
    'room_submissions','rooms',
    'saved_resources','season_claims','season_tiers','shop_products','shop_sale_items','shop_sales',
    'squad_members','squad_weeks','squads','stock_moves',
    'trainer_availability','trainer_credentials','trainer_feedback','trainer_profiles',
    'trainer_ratings','waiver_acceptances','winback_rules','winback_sends','workout_logs','workout_plans',
    'workout_routine_exercises','workout_routines','workout_sets']::text[]
$$;

create or replace function migration_0146_applied() returns boolean
language sql immutable as $$ select true $$;
revoke all on function migration_0146_applied() from public, anon;
grant execute on function migration_0146_applied() to authenticated;
comment on function migration_0146_applied() is 'Probe marker: 0146 (AI coach meal guides) is live.';
