-- ============================================================================
-- 0173 — Programs that build week on week
-- ============================================================================
--
-- A program (0122) was the same workouts on numbered days: week 6 asked for
-- exactly what week 1 did. That is a routine on a calendar, not a program.
-- Now each exercise in a program's workout can step up every week —
--   weight  + N kg       reps  + N reps       sets  + N sets       seconds + N s
-- — and a program can make every Nth week a lighter one (back to week 1's
-- load). Targets are COMPUTED by program_day_targets(day), never stored per
-- week: the member's player, the owner's preview and the AI coach read one
-- function, so they cannot disagree.
--
-- A program can also be ONE member's: written by their coach ('trainer') or by
-- the AI coach ('ai', project B-8). Only that member, their own coach and the
-- owner can see it; the gym's programs (member_id null) work as before.
-- ============================================================================

alter table gym_workout_items add column if not exists target_weight_kg numeric check (target_weight_kg is null or target_weight_kg >= 0);
alter table gym_workout_items add column if not exists progress_kind text not null default 'none';
alter table gym_workout_items drop constraint if exists gym_workout_items_progress_kind_check;
alter table gym_workout_items add constraint gym_workout_items_progress_kind_check
  check (progress_kind in ('none', 'weight', 'reps', 'sets', 'seconds'));
alter table gym_workout_items add column if not exists progress_step numeric not null default 0 check (progress_step >= 0);

alter table gym_programs add column if not exists deload_every int check (deload_every is null or deload_every between 2 and 12);
alter table gym_programs add column if not exists source text not null default 'gym';
alter table gym_programs drop constraint if exists gym_programs_source_check;
alter table gym_programs add constraint gym_programs_source_check check (source in ('gym', 'trainer', 'ai'));
alter table gym_programs add column if not exists author_id uuid references profiles(id) on delete set null;
alter table gym_programs add column if not exists member_id uuid references profiles(id) on delete cascade;
create index if not exists gym_programs_member_idx on gym_programs (member_id) where member_id is not null;

-- ---------------------------------------------------------------------------
-- Who may read and write a program.
-- ---------------------------------------------------------------------------
create or replace function may_read_program(p_program uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from gym_programs p
     where p.id = p_program and p.gym_id = current_gym_id()
       and case when p.member_id is null
                then content_staff_here() or (p.published and not p.hidden)
                else p.member_id = auth.uid()
                  or storage_role_here() = 'admin'
                  or p.author_id = auth.uid()
                  or (storage_role_here() = 'trainer' and is_my_trainee(p.member_id))
           end);
$$;

create or replace function may_edit_program(p_program uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select gym_writable() and exists (
    select 1 from gym_programs p
     where p.id = p_program and p.gym_id = current_gym_id()
       and (storage_role_here() = 'admin'
            or (storage_role_here() = 'trainer' and p.source = 'trainer' and p.author_id = auth.uid()
                and p.member_id is not null and is_my_trainee(p.member_id))));
$$;

-- A member opens a published gym program, or their own personal one.
create or replace function program_open_to_members(p_program uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from gym_programs p
                  where p.id = p_program and p.published and not p.hidden
                    and (p.member_id is null or p.member_id = auth.uid()));
$$;

-- A trainer's program is theirs and for one of their own trainees; the author is
-- stamped here, never sent by the client.
create or replace function trg_program_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.author_id := coalesce(auth.uid(), new.author_id);
  else
    new.author_id := old.author_id;
    new.member_id := old.member_id;
    new.source := old.source;
  end if;
  if auth.uid() is not null and storage_role_here() = 'trainer' then
    if new.source <> 'trainer' or new.member_id is null or not is_my_trainee(new.member_id) then
      raise exception 'A coach writes programs for their own trainees only.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists program_owner on gym_programs;
create trigger program_owner before insert or update on gym_programs for each row execute function trg_program_owner();

drop policy if exists gym_programs_read  on gym_programs;
drop policy if exists gym_programs_write on gym_programs;
drop policy if exists gym_programs_insert on gym_programs;
drop policy if exists gym_programs_update on gym_programs;
drop policy if exists gym_programs_delete on gym_programs;
-- The row stays readable when locked: the lock has to be able to explain itself.
-- Written against the row's own columns, not may_read_program(id): an INSERT …
-- RETURNING is checked against this policy before the new row is visible to a
-- lookup by id, so the lookup would refuse every new program.
create policy gym_programs_read on gym_programs for select to authenticated
  using (case when member_id is null
              then content_staff_here() or (published and not hidden)
              else member_id = auth.uid()
                or storage_role_here() = 'admin'
                or author_id = auth.uid()
                or (storage_role_here() = 'trainer' and is_my_trainee(member_id))
         end);
create policy gym_programs_insert on gym_programs for insert to authenticated
  with check (storage_role_here() = 'admin'
              or (storage_role_here() = 'trainer' and source = 'trainer' and member_id is not null and is_my_trainee(member_id)));
create policy gym_programs_update on gym_programs for update to authenticated
  using (may_edit_program(id)) with check (storage_role_here() in ('admin', 'trainer'));
create policy gym_programs_delete on gym_programs for delete to authenticated
  using (may_edit_program(id));

drop policy if exists gym_program_days_read  on gym_program_days;
drop policy if exists gym_program_days_write on gym_program_days;
create policy gym_program_days_read on gym_program_days for select to authenticated
  using (case when (select member_id from gym_programs where id = program_id) is null
              then content_staff_here() or (program_open_to_members(program_id) and program_unlocked(program_id))
              else may_read_program(program_id) end);
create policy gym_program_days_write on gym_program_days for all to authenticated
  using (may_edit_program(program_id)) with check (may_edit_program(program_id));

-- ---------------------------------------------------------------------------
-- This week's targets for a program day: base + (week − 1) × step, or week 1's
-- load on a lighter week. prev_* is last week's, null in week 1.
-- ---------------------------------------------------------------------------
create or replace function program_week_value(p_base numeric, p_kind text, p_for text, p_step numeric, p_eff int)
returns numeric language sql immutable as $$
  select case when p_base is null then null
              when p_kind = p_for then p_base + p_eff * p_step
              else p_base end;
$$;

create or replace function program_effective_week(p_week int, p_deload int) returns int
language sql immutable as $$
  select case when p_week < 1 then 0
              when p_deload is not null and p_week % p_deload = 0 then 0
              else p_week - 1 end;
$$;

create or replace function program_day_targets(p_day uuid)
returns table (item_id uuid, item_position int, exercise_id uuid, exercise_name text,
               sets int, reps int, seconds int, weight_kg numeric, rest_seconds int,
               progress_kind text, prev_sets int, prev_reps int, prev_seconds int, prev_weight_kg numeric)
language plpgsql stable security definer set search_path = public as $$
declare d record; e int; ep int;
begin
  select pd.id, pd.week, pd.workout_id, pd.program_id, p.deload_every into d
    from gym_program_days pd join gym_programs p on p.id = pd.program_id
   where pd.id = p_day and pd.gym_id = current_gym_id();
  if d.id is null or not may_read_program(d.program_id) then
    raise exception 'That day is not one you can open.' using errcode = '42501';
  end if;
  e  := program_effective_week(d.week, d.deload_every);
  ep := program_effective_week(d.week - 1, d.deload_every);
  return query
    select i.id, i.position, i.exercise_id, x.name,
           program_week_value(i.target_sets, i.progress_kind, 'sets', i.progress_step, e)::int,
           program_week_value(i.target_reps, i.progress_kind, 'reps', i.progress_step, e)::int,
           program_week_value(i.target_seconds, i.progress_kind, 'seconds', i.progress_step, e)::int,
           program_week_value(i.target_weight_kg, i.progress_kind, 'weight', i.progress_step, e),
           i.rest_seconds, i.progress_kind,
           case when d.week > 1 then program_week_value(i.target_sets, i.progress_kind, 'sets', i.progress_step, ep)::int end,
           case when d.week > 1 then program_week_value(i.target_reps, i.progress_kind, 'reps', i.progress_step, ep)::int end,
           case when d.week > 1 then program_week_value(i.target_seconds, i.progress_kind, 'seconds', i.progress_step, ep)::int end,
           case when d.week > 1 then program_week_value(i.target_weight_kg, i.progress_kind, 'weight', i.progress_step, ep) end
      from gym_workout_items i
      left join exercises x on x.id = i.exercise_id
     where i.workout_id = d.workout_id
     order by i.position;
end;
$$;
revoke all on function program_day_targets(uuid) from public, anon;
grant execute on function program_day_targets(uuid) to authenticated;

create or replace function migration_0173_applied() returns boolean
language sql immutable as $marker$ select true $marker$;
revoke all on function migration_0173_applied() from public, anon;
grant execute on function migration_0173_applied() to authenticated;
comment on function migration_0173_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0173.sql
