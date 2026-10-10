-- ============================================================================
-- 0174 — One place per coach, and coaches who edit routines
-- ============================================================================
--
-- A member and their coach had four places: Messages (0131), Coach notes
-- (trainer_feedback), the 1-on-1 room (0128) and whatever routine the coach
-- mentioned. Now the 1-on-1 room is THE place: coach_timeline(room) reads the
-- pair's chat, the coach's notes, the room's posts and classwork, and every
-- routine or program the coach wrote or edited for that member, newest first,
-- in one list. Nothing moves — each thing is still written where it always was
-- (send_message, trainer_feedback, room posts) — so no link breaks.
--
-- And a coach can now WRITE a routine for their trainee, or EDIT one the
-- member or the AI coach made (only if the member shares workouts with coaches,
-- trainer_may_see). The routine's state before the edit is kept
-- (workout_routine_versions), the member is told, and the member can put the
-- earlier version back.
-- ============================================================================

create table if not exists workout_routine_versions (
  id         uuid primary key default gen_random_uuid(),
  gym_id     uuid not null default current_gym_id() references gyms(id) on delete cascade,
  routine_id uuid not null,
  snapshot   jsonb not null,
  made_by    uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  -- Gym-to-gym keys carry gym_id (TENANCY): a version can only point at its own gym's routine.
  foreign key (gym_id, routine_id) references workout_routines (gym_id, id) on delete cascade
);
create index if not exists workout_routine_versions_routine_idx on workout_routine_versions (routine_id, created_at desc);
alter table workout_routine_versions enable row level security;
drop policy if exists routine_versions_read on workout_routine_versions;
-- The member reads their own routines' history. Written only by the definer
-- functions below: there is no insert policy for anyone.
create policy routine_versions_read on workout_routine_versions for select to authenticated
  using (exists (select 1 from workout_routines r where r.id = routine_id and r.member_id = auth.uid()));
drop policy if exists tenant_select on workout_routine_versions;
drop policy if exists tenant_insert on workout_routine_versions;
drop policy if exists tenant_update on workout_routine_versions;
drop policy if exists tenant_delete on workout_routine_versions;
create policy tenant_select on workout_routine_versions as restrictive for select to anon, authenticated using (gym_id = current_gym_id());
create policy tenant_insert on workout_routine_versions as restrictive for insert to anon, authenticated with check (gym_id = current_gym_id() and gym_writable());
create policy tenant_update on workout_routine_versions as restrictive for update to anon, authenticated
  using (gym_id = current_gym_id() and gym_writable()) with check (gym_id = current_gym_id() and gym_writable());
create policy tenant_delete on workout_routine_versions as restrictive for delete to anon, authenticated using (gym_id = current_gym_id() and gym_writable());

-- A routine as it stands, for a version.
create or replace function routine_snapshot(p_routine uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'name', r.name, 'notes', r.notes, 'source', r.source, 'edited_by', r.edited_by, 'edited_at', r.edited_at,
    'exercises', coalesce((
      select jsonb_agg(jsonb_build_object(
        'exercise_id', e.exercise_id, 'custom_name', e.custom_name, 'target_sets', e.target_sets,
        'target_reps', e.target_reps, 'target_weight_kg', e.target_weight_kg,
        'target_seconds', e.target_seconds, 'rest_seconds', e.rest_seconds) order by e.position)
        from workout_routine_exercises e where e.routine_id = r.id), '[]'::jsonb))
    from workout_routines r where r.id = p_routine;
$$;

-- Replaces a routine's exercises with a list (from the editor or a version).
create or replace function routine_put_exercises(p_routine uuid, p_gym uuid, p_exercises jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare x jsonb; n int := 0;
begin
  delete from workout_routine_exercises where routine_id = p_routine;
  for x in select * from jsonb_array_elements(coalesce(p_exercises, '[]'::jsonb)) loop
    insert into workout_routine_exercises (gym_id, routine_id, position, exercise_id, custom_name, target_sets,
                                           target_reps, target_weight_kg, target_seconds, rest_seconds)
    values (p_gym, p_routine, n, nullif(x ->> 'exercise_id', '')::uuid, nullif(btrim(coalesce(x ->> 'custom_name', '')), ''),
            greatest(1, coalesce((x ->> 'target_sets')::int, 3)), (x ->> 'target_reps')::int,
            (x ->> 'target_weight_kg')::numeric, (x ->> 'target_seconds')::int, coalesce((x ->> 'rest_seconds')::int, 60));
    n := n + 1;
  end loop;
end;
$$;
revoke all on function routine_put_exercises(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function routine_snapshot(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- A coach writes or edits a routine for their own trainee.
-- ---------------------------------------------------------------------------
create or replace function coach_save_routine(p_member uuid, p_routine uuid, p_name text, p_notes text, p_exercises jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_gym uuid := current_gym_id(); r record; v_id uuid; v_coach text;
begin
  if coalesce(storage_role_here(), '') <> 'trainer' or not gym_writable() then
    raise exception 'Only a coach writes routines for their trainees.' using errcode = '42501';
  end if;
  if not is_my_trainee(p_member) then
    raise exception 'You can write routines only for members you coach.' using errcode = '42501';
  end if;
  if coalesce(btrim(p_name), '') = '' then raise exception 'Give the routine a name.'; end if;
  if jsonb_array_length(coalesce(p_exercises, '[]'::jsonb)) = 0 then raise exception 'Add at least one exercise.'; end if;
  select coalesce(nullif(btrim(first_name), ''), 'Your coach') into v_coach from profiles where id = auth.uid();

  if p_routine is null then
    insert into workout_routines (gym_id, member_id, name, notes, position, source, author_id)
    values (v_gym, p_member, btrim(p_name), nullif(btrim(coalesce(p_notes, '')), ''),
            coalesce((select max(position) + 1 from workout_routines where member_id = p_member and gym_id = v_gym), 0),
            'trainer', auth.uid())
    returning id into v_id;
    perform routine_put_exercises(v_id, v_gym, p_exercises);
    perform notify_once(p_member, 'program', v_coach || ' wrote you a routine',
      btrim(p_name) || ' is in your routines. Open it to see what to do.', '/member/track/routine/' || v_id,
      'coach-routine:' || v_id, v_gym);
    return v_id;
  end if;

  select * into r from workout_routines where id = p_routine and gym_id = v_gym;
  if r.id is null or r.member_id <> p_member then raise exception 'That routine is not this member''s.'; end if;
  -- Their own routine, or the AI coach's: only if they share workouts with coaches.
  if r.author_id is distinct from auth.uid() and not trainer_may_see(p_member, 'workouts') then
    raise exception 'This member keeps their workouts private. They can share them under Settings.' using errcode = '42501';
  end if;
  insert into workout_routine_versions (gym_id, routine_id, snapshot, made_by)
  values (v_gym, r.id, routine_snapshot(r.id), auth.uid());
  update workout_routines set name = btrim(p_name), notes = nullif(btrim(coalesce(p_notes, '')), ''),
         edited_by = auth.uid(), edited_at = now(), updated_at = now()
   where id = r.id;
  perform routine_put_exercises(r.id, v_gym, p_exercises);
  perform notify_once(p_member, 'program', v_coach || ' edited ' || btrim(p_name),
    'Your coach changed this routine. The earlier version is kept — you can put it back.',
    '/member/track/routine/' || r.id, 'coach-edit:' || r.id || ':' || extract(epoch from now())::bigint, v_gym);
  return r.id;
end;
$$;
revoke all on function coach_save_routine(uuid, uuid, text, text, jsonb) from public, anon;
grant execute on function coach_save_routine(uuid, uuid, text, text, jsonb) to authenticated;

-- The member puts an earlier version back (and can undo that too).
create or replace function restore_routine_version(p_version uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v record; r record;
begin
  select * into v from workout_routine_versions where id = p_version and gym_id = current_gym_id();
  if v.id is null then raise exception 'That version is not here.'; end if;
  select * into r from workout_routines where id = v.routine_id;
  if r.member_id is distinct from auth.uid() then
    raise exception 'Only you can put back a version of your routine.' using errcode = '42501';
  end if;
  insert into workout_routine_versions (gym_id, routine_id, snapshot, made_by)
  values (r.gym_id, r.id, routine_snapshot(r.id), auth.uid());
  update workout_routines set name = coalesce(v.snapshot ->> 'name', name), notes = v.snapshot ->> 'notes',
         edited_by = nullif(v.snapshot ->> 'edited_by', '')::uuid, edited_at = nullif(v.snapshot ->> 'edited_at', '')::timestamptz,
         updated_at = now()
   where id = r.id;
  perform routine_put_exercises(r.id, r.gym_id, v.snapshot -> 'exercises');
end;
$$;
revoke all on function restore_routine_version(uuid) from public, anon;
grant execute on function restore_routine_version(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- The 1-on-1 room's timeline: everything between this member and this coach.
-- ---------------------------------------------------------------------------
create or replace function coach_timeline(p_room uuid, p_before timestamptz default null, p_limit int default 30)
returns table (kind text, id uuid, at timestamptz, author_id uuid, body text, ref_id uuid, extra jsonb)
language plpgsql stable security definer set search_path = public as $$
declare rm record;
begin
  select * into rm from rooms where rooms.id = p_room and rooms.gym_id = current_gym_id();
  if rm.id is null or rm.kind <> 'pt' or auth.uid() not in (rm.member_id, rm.trainer_id) then
    raise exception 'This room is between a member and their coach.' using errcode = '42501';
  end if;
  return query
    select * from (
      select 'message'::text, m.id, m.created_at, m.sender_id, m.body, c.id, '{}'::jsonb
        from messages m join conversations c on c.id = m.conversation_id
       where c.gym_id = rm.gym_id and c.member_id = rm.member_id and c.trainer_id = rm.trainer_id
      union all
      select 'note', f.id, f.created_at, f.trainer_id,
             concat_ws(E'\n', nullif(btrim(f.note), ''), nullif(btrim(f.recommendation), '')), f.pt_session_id,
             jsonb_build_object('seen', f.seen_at is not null, 'done', f.done_at is not null)
        from trainer_feedback f
       where f.gym_id = rm.gym_id and f.member_id = rm.member_id and f.trainer_id = rm.trainer_id
      union all
      select 'post', p.id, p.created_at, p.author_id, p.body, p.room_id,
             jsonb_build_object('photo_url', p.photo_url, 'video_url', p.video_url)
        from room_posts p where p.room_id = rm.id
      union all
      select 'assignment', a.id, a.created_at, a.created_by, a.title, a.gym_workout_id,
             jsonb_build_object('kind', a.kind, 'due_on', a.due_on)
        from room_assignments a where a.room_id = rm.id
      union all
      select 'routine', w.id, coalesce(w.edited_at, w.created_at), coalesce(w.edited_by, w.author_id), w.name, w.id,
             jsonb_build_object('edited', w.edited_by is not null and w.author_id is distinct from w.edited_by)
        from workout_routines w
       where w.gym_id = rm.gym_id and w.member_id = rm.member_id
         and (w.author_id = rm.trainer_id or w.edited_by = rm.trainer_id)
      union all
      select 'program', g.id, g.created_at, g.author_id, g.name, g.id, jsonb_build_object('weeks', g.weeks)
        from gym_programs g
       where g.gym_id = rm.gym_id and g.member_id = rm.member_id and g.author_id = rm.trainer_id
    ) t (kind, id, at, author_id, body, ref_id, extra)
    where p_before is null or t.at < p_before
    order by t.at desc
    limit greatest(1, least(coalesce(p_limit, 30), 100));
end;
$$;
revoke all on function coach_timeline(uuid, timestamptz, int) from public, anon;
grant execute on function coach_timeline(uuid, timestamptz, int) to authenticated;

-- The 1-on-1 room between the caller and another person (either side), for the
-- links that used to open Messages or Coach notes. Null when there is none yet.
create or replace function pt_room_with(p_other uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select r.id from rooms r
   where r.gym_id = current_gym_id() and r.kind = 'pt'
     and ((r.member_id = auth.uid() and r.trainer_id = p_other) or (r.trainer_id = auth.uid() and r.member_id = p_other))
   order by r.archived_at nulls first, r.created_at desc
   limit 1;
$$;
revoke all on function pt_room_with(uuid) from public, anon;
grant execute on function pt_room_with(uuid) to authenticated;

create or replace function tenancy_gym_tables() returns text[] language sql immutable as $$
  select array['account_status_events','achievement_unlocks','achievements','activity_log',
    'ai_coach_profiles','ai_meal_guides','ai_proposals','ai_usage_days',
    'assistant_conversations','assistant_messages','attendance','body_measurements','bookings',
    'cancellation_reasons','cash_closeouts','challenge_participants','challenges','class_templates',
    'class_waitlist','classes','conversations','event_registrations','events','fitness_goals','freemium_trials',
    'goal_templates','gym_exercise_media','gym_goals','gym_house_rules','gym_invitations','gym_modules','gym_payment_methods','gym_photos','gym_plans',
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
    'trainer_availability','trainer_credentials','trainer_feedback','trainer_profiles',
    'trainer_ratings','waiver_acceptances','winback_rules','winback_sends','workout_logs','workout_plans',
    'workout_routine_exercises','workout_routine_versions','workout_routines','workout_sets']::text[]
$$;

create or replace function migration_0174_applied() returns boolean
language sql immutable as $marker$ select true $marker$;
revoke all on function migration_0174_applied() from public, anon;
grant execute on function migration_0174_applied() to authenticated;
comment on function migration_0174_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0174.sql
