-- 0227 — switching gyms, members only (plan docs/superpowers/plans/2026-10-31-accounts-documents-switching.md, Part F).
--
-- A member belongs to one gym at a time: "Join another gym" becomes SWITCH GYM.
-- (Coaches still work at several gyms; only member roles count.)
--
--   1. request_gym_switch(to_gym, via, code, consent) — the member has seen the
--      old gym's refund quote and agreed to their data moving. It files a
--      cancellation with the old gym (0118's request, reason "Switching gyms"),
--      then asks the new gym under ITS joining rules (0179's request_to_join:
--      open = in at once, code, or the desk decides).
--   2. When the new gym's role turns active (a trigger — the desk's approval or
--      an open gym's), complete_gym_switch():
--        MOVES   workouts and sets, records, routines (+ exercises, versions),
--                the weekly plan, the plan builder's plans, body readings,
--                targets (a target the new gym has no template for keeps its
--                numbers, without the template), progress photos (their files
--                are moved by the erase-accounts Edge Function), the earned
--                level and training badges;
--        RESTARTS the points balance (the old ledger stays with the old gym) and
--                visit badges (check-ins, early/late/weekend, classes, 1-on-1s,
--                loyalty, the weekly visit streak) — they lock again;
--        ENDS    the old gym role (archived), packages with its coaches,
--                future sessions and bookings there; the old gym is told. Its
--                payments and visits stay in its books. The cancellation stays
--                with its desk, which pays any refund as today.
--   3. Declined (or withdrawn) at the new gym: nothing moves, the old
--      membership is untouched and the cancellation request is withdrawn.
--
-- The composite (gym_id, …) keys have no ON UPDATE, so each parent and its
-- children move in ONE statement: foreign keys are checked at its end.
-- request_to_join() is 0179's, redefined in full: it refuses a second gym for
-- a member unless a switch is asking. Safe to paste again.

create table if not exists gym_switches (
  id             uuid primary key default gen_random_uuid(),
  member         uuid not null references profiles(id) on delete cascade,
  from_gym       uuid not null references gyms(id) on delete cascade,
  to_gym         uuid not null references gyms(id) on delete cascade,
  status         text not null default 'pending' check (status in ('pending', 'completed', 'declined', 'withdrawn')),
  consent_at     timestamptz not null default now(),
  cancel_request uuid references membership_requests(id) on delete set null,
  created_at     timestamptz not null default now(),
  decided_at     timestamptz
);
create unique index if not exists uq_gym_switches_open on gym_switches(member) where status = 'pending';
alter table gym_switches enable row level security;   -- no policy: definer functions only

create table if not exists storage_moves (
  id        uuid primary key default gen_random_uuid(),
  bucket    text not null,
  from_path text not null,
  to_path   text not null,
  queued_at timestamptz not null default now(),
  done_at   timestamptz
);
create index if not exists idx_storage_moves_due on storage_moves(queued_at) where done_at is null;
alter table storage_moves enable row level security;   -- no policy: definer functions only

-- Badges earned by coming to the gym: they lock again at a new one.
create or replace function is_visit_metric(p_metric text) returns boolean
language sql immutable as $$
  select p_metric in ('verified_days', 'early_checkins', 'late_checkins', 'weekend_days', 'classes_attended',
                      'pt_sessions_done', 'days_as_member', 'best_week_streak');
$$;

-- ---- 0179's join, refusing a second gym for a member unless a switch is asking ----
create or replace function request_to_join(p_gym uuid, p_via text, p_code text, p_referral text) returns text
language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); p profiles; v_way text; v_st text; r record; v_dob date; v_at text;
begin
  if v_me is null then raise exception 'Sign in first.'; end if;
  if exists (select 1 from gym_roles where gym_id = p_gym and user_id = v_me) then
    raise exception 'You have already joined or asked to join that gym.';
  end if;
  if coalesce(current_setting('corefitness.switching', true), '') <> 'on' then
    select g.name into v_at from gym_roles x join gyms g on g.id = x.gym_id
     where x.user_id = v_me and x.role = 'member' and x.status in ('active', 'pending_approval') limit 1;
    if v_at is not null then
      raise exception 'You are a member of %. A member belongs to one gym at a time — use Switch gym instead.', v_at;
    end if;
  end if;
  select date_of_birth into v_dob from member_profiles where profile_id = v_me and date_of_birth is not null limit 1;
  v_way := join_decision(p_gym, p_via, p_code, p_referral, v_dob);
  v_st := case when v_way = 'auto' then 'active' else 'pending_approval' end;
  select * into p from profiles where id = v_me;
  perform act_as_gym(p_gym);
  insert into gym_roles (gym_id, user_id, role, status) values (p_gym, v_me, 'member', v_st);
  insert into member_profiles (gym_id, profile_id, qr_code, date_of_birth) values (p_gym, v_me, v_me::text, v_dob)
  on conflict (gym_id, profile_id) do nothing;
  if v_way = 'auto' then
    perform grant_free_membership(v_me, p_gym);
  else
    insert into pending_registrations (gym_id, first_name, last_name, email, phone, auth_user_id)
    values (p_gym, p.first_name, p.last_name, p.email, p.phone, v_me) on conflict (gym_id, email) do nothing;
    for r in select user_id from gym_roles where gym_id = p_gym and role in ('admin', 'staff') and status = 'active' loop
      perform notify_once(r.user_id, 'system',
        case when coalesce(current_setting('corefitness.switching', true), '') = 'on' then 'Switching in from another gym' else 'New member request' end,
        coalesce(nullif(trim(p.first_name || ' ' || p.last_name), ''), 'Someone')
          || case when coalesce(current_setting('corefitness.switching', true), '') = 'on'
                  then ' wants to switch to your gym from another one. Their training history comes with them once you accept.'
                  else ' asked to join the gym.' end,
        '/members', 'join:' || p_gym || ':' || v_me, p_gym);
    end loop;
  end if;
  perform act_as_gym(null);
  return v_way;
end;
$$;
revoke all on function request_to_join(uuid, text, text, text) from public, anon;
grant execute on function request_to_join(uuid, text, text, text) to authenticated;

/** The switch screen: where they are, their refund quote is read separately (refund_quote), and a pending switch. */
create or replace function my_gym_switch() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'from_gym', (select jsonb_build_object('id', g.id, 'name', g.name) from gym_roles r join gyms g on g.id = r.gym_id
                  where r.user_id = auth.uid() and r.role = 'member' and r.status = 'active' order by r.gym_id = current_gym_id() desc limit 1),
    'pending', (select jsonb_build_object('id', s.id, 'to_gym', s.to_gym, 'to_name', g.name, 'created_at', s.created_at)
                  from gym_switches s join gyms g on g.id = s.to_gym where s.member = auth.uid() and s.status = 'pending'));
$$;
revoke all on function my_gym_switch() from public, anon;
grant execute on function my_gym_switch() to authenticated;

/** Ask to switch to another gym. Returns how the new gym decides: 'auto' (in already) or the desk. */
create or replace function request_gym_switch(p_to_gym uuid, p_via text default 'list', p_code text default null, p_consent boolean default false)
returns text
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); v_from uuid; v_req uuid; v_way text; v_switch uuid; v_to_name text;
begin
  if me is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  if not coalesce(p_consent, false) then
    raise exception 'Agree to your training data moving to the new gym first.';
  end if;
  select r.gym_id into v_from from gym_roles r
   where r.user_id = me and r.role = 'member' and r.status = 'active'
   order by r.gym_id = current_gym_id() desc limit 1;
  if v_from is null then raise exception 'You are not a member of a gym yet — join one instead.'; end if;
  if v_from = p_to_gym then raise exception 'You are already a member there.'; end if;
  if exists (select 1 from gym_switches where member = me and status = 'pending') then
    raise exception 'You already asked to switch. Withdraw that first.';
  end if;
  select name into v_to_name from gyms where id = p_to_gym;

  -- The old gym's desk is asked to cancel (0118), from the old gym.
  update profiles set active_gym_id = v_from where id = me and active_gym_id is distinct from v_from;
  begin
    v_req := request_membership_change('cancel', 'Switching to another gym');
  exception when others then
    v_req := null;   -- no membership to cancel (a free tier ended, say): nothing to ask
  end;
  insert into gym_switches (member, from_gym, to_gym, cancel_request) values (me, v_from, p_to_gym, v_req) returning id into v_switch;

  -- Then the new gym, under its own rules. An open gym takes them at once; the trigger completes it.
  perform set_config('corefitness.switching', 'on', true);
  v_way := request_to_join(p_to_gym, p_via, p_code, null);
  perform set_config('corefitness.switching', 'off', true);
  perform platform_log(null, 'member.switch_requested', display_name_of(me) || ' asked to switch gyms',
    jsonb_build_object('member', me, 'from', v_from, 'to', p_to_gym, 'switch', v_switch));
  return v_way;
end;
$$;
revoke all on function request_gym_switch(uuid, text, text, boolean) from public, anon;
grant execute on function request_gym_switch(uuid, text, text, boolean) to authenticated;

/** Changed my mind: the new gym's request goes, the old gym's cancellation is withdrawn. */
create or replace function withdraw_gym_switch() returns void
language plpgsql security definer set search_path = public as $$
declare s gym_switches;
begin
  select * into s from gym_switches where member = auth.uid() and status = 'pending' for update;
  if s.id is null then raise exception 'There is no switch to withdraw.'; end if;
  update gym_switches set status = 'withdrawn', decided_at = now() where id = s.id;
  update membership_requests set status = 'withdrawn', closed_at = now(), closed_by = auth.uid(), close_note = 'Switch withdrawn'
   where id = s.cancel_request and status = 'open';
  delete from pending_registrations where gym_id = s.to_gym and auth_user_id = s.member;
  delete from gym_roles where gym_id = s.to_gym and user_id = s.member and status = 'pending_approval';
end;
$$;
revoke all on function withdraw_gym_switch() from public, anon;
grant execute on function withdraw_gym_switch() to authenticated;

/** The new gym accepted: move what moves, restart what restarts, end the old gym's role. */
create or replace function complete_gym_switch(p_switch uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s gym_switches; m uuid; a uuid; b uuid; v_name text; v_to text; r record;
begin
  select * into s from gym_switches where id = p_switch and status = 'pending' for update;
  if s.id is null then return; end if;
  m := s.member; a := s.from_gym; b := s.to_gym;
  v_name := display_name_of(m);
  select name into v_to from gyms where id = b;

  -- An open gym's join files the role first: its member record may not exist yet.
  insert into member_profiles (gym_id, profile_id, qr_code) values (b, m, m::text) on conflict (gym_id, profile_id) do nothing;
  -- What they told the old gym about themselves comes along (the new row was made bare by the join).
  update member_profiles n set experience_level = coalesce(n.experience_level, o.experience_level),
         training_focus = coalesce(n.training_focus, o.training_focus), interests = case when n.interests = '{}' then o.interests else n.interests end,
         gender = coalesce(n.gender, o.gender), date_of_birth = coalesce(n.date_of_birth, o.date_of_birth),
         address = coalesce(n.address, o.address), emergency_contact_name = coalesce(n.emergency_contact_name, o.emergency_contact_name),
         emergency_contact_phone = coalesce(n.emergency_contact_phone, o.emergency_contact_phone),
         emergency_contact_relationship = coalesce(n.emergency_contact_relationship, o.emergency_contact_relationship),
         onboarding_completed_at = coalesce(n.onboarding_completed_at, o.onboarding_completed_at)
    from member_profiles o
   where n.gym_id = b and n.profile_id = m and o.gym_id = a and o.profile_id = m;

  -- Training: plans, routines, workouts, sets and records — one statement, so the composite keys hold at its end.
  with
    plans as (update workout_plans set gym_id = b where gym_id = a and member_id = m returning id),
    routines as (update workout_routines set gym_id = b where gym_id = a and member_id = m returning id),
    rex as (update workout_routine_exercises e set gym_id = b where e.gym_id = a and e.routine_id in (select id from routines) returning e.id),
    rver as (update workout_routine_versions v set gym_id = b where v.gym_id = a and v.routine_id in (select id from routines) returning v.id),
    logs as (update workout_logs set gym_id = b, program_day_id = null, gym_workout_id = null
              where gym_id = a and member_id = m returning id),
    sets as (update workout_sets ws set gym_id = b where ws.gym_id = a and ws.log_id in (select id from logs) returning ws.id),
    recs as (update personal_records pr set gym_id = b where pr.gym_id = a and pr.member_id = m returning pr.id),
    week as (update gym_plans set gym_id = b where gym_id = a and member_id = m returning member_id)
  select count(*) into r from (select 1 from plans union all select 1 from routines union all select 1 from rex union all select 1 from rver
                               union all select 1 from logs union all select 1 from sets union all select 1 from recs union all select 1 from week) x;

  update body_measurements set gym_id = b where gym_id = a and member_id = m;
  update fitness_goals g set gym_id = b,
         template_key = case when exists (select 1 from goal_templates t where t.gym_id = b and t.key = g.template_key) then g.template_key end
   where g.gym_id = a and g.member_id = m;

  -- Progress photos: the row now; the file follows (the Edge Function moves it with the Storage API).
  insert into storage_moves (bucket, from_path, to_path)
  select 'progress', p.path, b::text || '/' || m::text || '/' || substr(p.path, length(a::text || '/' || m::text || '/') + 1)
    from progress_photos p where p.gym_id = a and p.member_id = m;
  update progress_photos set gym_id = b,
         path = b::text || '/' || m::text || '/' || substr(path, length(a::text || '/' || m::text || '/') + 1)
   where gym_id = a and member_id = m;

  -- Training badges and the earned level move; badges for coming to the old gym lock again.
  update achievement_unlocks u set gym_id = b
   where u.gym_id = a and u.user_id = m
     and exists (select 1 from achievements x where x.gym_id = a and x.key = u.achievement_key
                   and not (x.rule_kind = 'metric' and is_visit_metric(x.metric)))
     and exists (select 1 from achievements y where y.gym_id = b and y.key = u.achievement_key)
     and not exists (select 1 from achievement_unlocks d where d.gym_id = b and d.user_id = m and d.achievement_key = u.achievement_key);

  -- The old gym: packages end, future sessions and bookings are cancelled, the role ends.
  update coachings set status = 'ended', end_reason = 'Member switched gyms', ended_at = now(), updated_at = now()
   where gym_id = a and member_id = m and status = 'active';
  update coachings set status = 'cancelled', end_reason = 'Member switched gyms', updated_at = now()
   where gym_id = a and member_id = m and status in ('invited', 'requested', 'awaiting_payment');
  insert into cancellation_reasons (gym_id, key, label, applies_to, needs_note, sort_order, is_active)
  values (a, 'member_switched', 'Member switched gyms', 'any', false, 99, false) on conflict (gym_id, key) do nothing;
  perform set_config('corefitness.cancelling', 'on', true);
  for r in select id, trainer_id from pt_sessions where gym_id = a and member_id = m and starts_at > now() and status::text in ('pending', 'approved') loop
    update pt_sessions set status = 'cancelled', cancelled_at = now(), cancelled_by = m, cancelled_by_role = 'member',
           cancellation_reason = 'member_switched', cancellation_note = 'They switched to another gym.' where id = r.id;
    if r.trainer_id is not null then
      perform notify_once(r.trainer_id, 'booking', 'A booking was cancelled', v_name || ' switched to another gym, so their session is cancelled.',
        '/trainer/schedule', 'cancel:' || r.id || ':trainer', a);
    end if;
  end loop;
  update bookings bk set status = 'cancelled', cancelled_at = now(), cancelled_by = m, cancelled_by_role = 'member',
         cancellation_reason = 'member_switched', cancellation_note = 'They switched to another gym.'
    from classes c where c.id = bk.class_id and bk.gym_id = a and bk.member_id = m and c.scheduled_at > now() and bk.status::text in ('pending', 'approved');
  perform set_config('corefitness.cancelling', 'off', true);
  update gym_roles set status = 'archived' where gym_id = a and user_id = m and role = 'member';
  update profiles set active_gym_id = b where id = m;
  update gym_switches set status = 'completed', decided_at = now() where id = s.id;

  perform act_as_gym(a);
  perform notify_once(o.user_id, 'system', 'A member switched gyms',
      v_name || ' switched to another gym. Their payments and visits stay in your records; their training history went with them. '
        || case when s.cancel_request is not null then 'Their cancellation request is waiting on Members.' else '' end,
      '/members', 'switched-out:' || s.id || ':' || o.user_id, a)
    from gym_roles o where o.gym_id = a and o.role in ('admin', 'staff') and o.status = 'active';
  perform act_as_gym(b);
  perform notify_once(m, 'system', 'You switched to ' || v_to,
      'Your workouts, routines, plan, body readings, targets, photos, level and training badges came with you. Points and visit badges start fresh here.',
      '/member/home', 'switched-in:' || s.id, b);
  perform act_as_gym(null);
  perform platform_log(null, 'member.switched', v_name || ' switched gyms', jsonb_build_object('member', m, 'from', a, 'to', b, 'switch', s.id));
end;
$$;
revoke all on function complete_gym_switch(uuid) from public, anon, authenticated;

/** The new gym's answer: accepted → complete; declined (archived, suspended or removed) → nothing moves. */
create or replace function trg_gym_switch_answer() returns trigger
language plpgsql security definer set search_path = public as $$
declare s gym_switches; v_who uuid := coalesce(new.user_id, old.user_id); v_gym uuid := coalesce(new.gym_id, old.gym_id);
begin
  select * into s from gym_switches where member = v_who and to_gym = v_gym and status = 'pending';
  if s.id is null then return null; end if;
  if tg_op <> 'DELETE' and new.role = 'member' and new.status = 'active' then
    perform complete_gym_switch(s.id);
  elsif tg_op = 'DELETE' or new.status in ('archived', 'suspended') then
    update gym_switches set status = 'declined', decided_at = now() where id = s.id;
    update membership_requests set status = 'withdrawn', closed_at = now(), close_note = 'The new gym did not accept the switch'
     where id = s.cancel_request and status = 'open';
    perform notify_once(v_who, 'system', 'Your switch did not go through',
      (select name from gyms where id = v_gym) || ' did not accept you. You are still a member of your gym, and nothing moved.',
      '/member/home', 'switch-declined:' || s.id, s.from_gym);
  end if;
  return null;
end;
$$;
drop trigger if exists gym_switch_answer on gym_roles;
create trigger gym_switch_answer after insert or update of status or delete on gym_roles
  for each row execute function trg_gym_switch_answer();

/** A gym's desk: who is waiting to switch IN (a tag on their request) — never where from. */
create or replace function gym_switching_in() returns setof uuid
language sql stable security definer set search_path = public as $$
  select s.member from gym_switches s
   where s.status = 'pending' and s.to_gym = current_gym_id() and get_my_role() in ('admin', 'staff');
$$;
revoke all on function gym_switching_in() from public, anon;
grant execute on function gym_switching_in() to authenticated;

/** A gym's desk: who switched OUT of this gym (shown on their archived record). */
create or replace function gym_switched_out() returns setof uuid
language sql stable security definer set search_path = public as $$
  select s.member from gym_switches s
   where s.status = 'completed' and s.from_gym = current_gym_id() and get_my_role() in ('admin', 'staff', 'trainer');
$$;
revoke all on function gym_switched_out() from public, anon;
grant execute on function gym_switched_out() to authenticated;

/** For the Edge Function: files to move (progress photos after a switch). */
create or replace function storage_moves_due() returns table (id uuid, bucket text, from_path text, to_path text)
language sql stable security definer set search_path = public as $$
  select m.id, m.bucket, m.from_path, m.to_path from storage_moves m where m.done_at is null order by m.queued_at limit 500;
$$;
revoke all on function storage_moves_due() from public, anon, authenticated;
grant execute on function storage_moves_due() to service_role;

create or replace function storage_moves_done(p_ids uuid[]) returns void
language sql security definer set search_path = public as $$
  update storage_moves set done_at = now() where id = any(p_ids) and done_at is null;
$$;
revoke all on function storage_moves_done(uuid[]) from public, anon, authenticated;
grant execute on function storage_moves_done(uuid[]) to service_role;

-- The probe (scripts/probe-migrations.py) asks with the anon key, as for every marker.
create or replace function migration_0227_applied() returns boolean language sql stable as $$ select true $$;
grant execute on function migration_0227_applied() to anon, authenticated;
