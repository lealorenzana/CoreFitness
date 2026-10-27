-- 0218 — the coach's moments (wave 1 of the lively coach app, 2026-10-27;
-- mock-up docs/superpowers/specs/2026-10-27-lively-trainer-w1/mock-trainer-w1.html).
--
-- Three things, none of which decides a number anyone else sees:
--   1. A coach's own milestones — sessions run, people coached, their first
--      rating and a 4.5★ average — counted here from what already happened,
--      and marked played on the coach's row (trainer_profiles), never the phone.
--   2. The first open of the day, once per day per coach (`arrival_on`).
--   3. A trainee's win reaches their coach: a bell row (and so a push, 0170)
--      when a trainee sets a record, makes a streak milestone, reaches a
--      numbered target or finishes a challenge. Only what the member lets
--      coaches see (0032): records follow "workouts", targets follow "goals";
--      streaks and challenges are not private training data.
--
-- Paste after 0217. Then scripts/sql/verify/verify0218.sql.

-- 1 and 2. The coach's markers. Written only by the two functions below.
alter table trainer_profiles
  add column if not exists celebrated_sessions     int     not null default 0,
  add column if not exists celebrated_people       int     not null default 0,
  add column if not exists celebrated_first_rating boolean not null default false,
  add column if not exists celebrated_top_rating   boolean not null default false,
  add column if not exists arrival_on              date;

-- A coach may edit their own profile (bio, hours…), so a trigger keeps the
-- markers out of reach of a plain UPDATE: only the definer functions (which
-- set app.coach_marks) move them. A policy cannot limit columns (CLAUDE.md).
create or replace function trg_guard_coach_marks() returns trigger
language plpgsql set search_path = public as $$
begin
  if coalesce(current_setting('app.coach_marks', true), '') <> 'on'
     and (new.celebrated_sessions     is distinct from old.celebrated_sessions
       or new.celebrated_people       is distinct from old.celebrated_people
       or new.celebrated_first_rating is distinct from old.celebrated_first_rating
       or new.celebrated_top_rating   is distinct from old.celebrated_top_rating
       or new.arrival_on              is distinct from old.arrival_on) then
    raise exception 'A coach''s milestones are set by the app, not edited.' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists guard_coach_marks on trainer_profiles;
create trigger guard_coach_marks before update on trainer_profiles
  for each row execute function trg_guard_coach_marks();

/** The tiers, in one place. */
create or replace function coach_session_tiers() returns int[] language sql immutable as $$ select array[10, 25, 50, 100, 250] $$;
create or replace function coach_people_tiers()  returns int[] language sql immutable as $$ select array[1, 5, 10, 25] $$;

/**
 * What a coach has done at this gym, counted from what happened:
 *   sessions — approved 1-on-1s that have ended, plus classes they taught that
 *              have ended with at least one approved booking (an empty class
 *              was not run);
 *   people   — everyone they have coached: a 1-on-1 or a class of theirs that
 *              happened, or a coaching term with them that started;
 *   ratings  — as trainer_rating_summary counts them (each member's latest),
 *              the average withheld below three, the same rule members see.
 */
create or replace function coach_stats(p_gym uuid, p_trainer uuid)
returns table (sessions int, people int, rating_count int, average numeric)
language sql stable security definer set search_path = public as $$
  with pt as (
    select s.member_id from pt_sessions s
     where s.gym_id = p_gym and s.trainer_id = p_trainer and s.status = 'approved'
       and s.starts_at + make_interval(mins => coalesce(s.duration_minutes, 60)) < now()
  ), cls as (
    select c.id from classes c
     where c.gym_id = p_gym and c.trainer_id = p_trainer and c.scheduled_at is not null
       and c.scheduled_at + make_interval(mins => coalesce(c.duration_minutes, 60)) < now()
       and exists (select 1 from bookings b where b.class_id = c.id and b.status = 'approved')
  ), coached as (
    select member_id from pt
    union select b.member_id from bookings b join cls on cls.id = b.class_id where b.status = 'approved'
    union select k.member_id from coachings k
           where k.gym_id = p_gym and k.trainer_id = p_trainer and k.starts_on is not null and k.starts_on <= manila_today()
  ), latest as (
    select distinct on (r.member_id) r.stars from trainer_ratings r
     where r.gym_id = p_gym and r.trainer_id = p_trainer
     order by r.member_id, r.period desc
  )
  select ((select count(*) from pt) + (select count(*) from cls))::int,
         (select count(*) from coached)::int,
         (select count(*) from latest)::int,
         case when (select count(*) from latest) >= 3 then (select round(avg(stars), 1) from latest) end
$$;
revoke all on function coach_stats(uuid, uuid) from public, anon, authenticated;

/**
 * The milestones this coach has reached and not yet been shown, newest tier
 * per kind only (a coach arriving at 60 sessions sees "50", not 10, 25 and 50),
 * marked shown in the same call so a second phone cannot play them again.
 */
create or replace function celebrate_coach_moments() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_gym uuid := current_gym_id();
  t trainer_profiles%rowtype;
  st record;
  v_sess int; v_ppl int;
  v_out jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then return v_out; end if;
  select * into t from trainer_profiles where gym_id = v_gym and profile_id = auth.uid();
  if not found then return v_out; end if;
  select * into st from coach_stats(v_gym, auth.uid());

  select max(x) into v_sess from unnest(coach_session_tiers()) x where x <= st.sessions;
  select max(x) into v_ppl  from unnest(coach_people_tiers())  x where x <= st.people;

  if v_sess is not null and v_sess > t.celebrated_sessions then
    v_out := v_out || jsonb_build_object('kind', 'sessions', 'value', v_sess, 'total', st.sessions,
      'next', (select min(x) from unnest(coach_session_tiers()) x where x > v_sess));
  end if;
  if v_ppl is not null and v_ppl > t.celebrated_people then
    v_out := v_out || jsonb_build_object('kind', 'people', 'value', v_ppl, 'total', st.people,
      'next', (select min(x) from unnest(coach_people_tiers()) x where x > v_ppl));
  end if;
  -- The 4.5★ average says more than a first rating; both new at once is one moment.
  if not t.celebrated_top_rating and st.average is not null and st.average >= 4.5 then
    v_out := v_out || jsonb_build_object('kind', 'top_rating', 'value', st.average, 'total', st.rating_count);
  elsif not t.celebrated_first_rating and st.rating_count >= 1 then
    v_out := v_out || jsonb_build_object('kind', 'first_rating', 'value', st.rating_count, 'total', st.rating_count);
  end if;

  perform set_config('app.coach_marks', 'on', true);
  update trainer_profiles set
    celebrated_sessions     = greatest(celebrated_sessions, coalesce(v_sess, 0)),
    celebrated_people       = greatest(celebrated_people, coalesce(v_ppl, 0)),
    celebrated_first_rating = celebrated_first_rating or st.rating_count >= 1,
    celebrated_top_rating   = celebrated_top_rating or coalesce(st.average >= 4.5, false)
   where gym_id = v_gym and profile_id = auth.uid();
  perform set_config('app.coach_marks', '', true);
  return v_out;
end;
$$;
revoke all on function celebrate_coach_moments() from public, anon;
grant execute on function celebrate_coach_moments() to authenticated;

/** True once a day per coach: the first open of the day, which then plays. */
create or replace function coach_arrival() returns boolean
language plpgsql security definer set search_path = public as $$
declare v_gym uuid := current_gym_id(); v_on date;
begin
  if auth.uid() is null then return false; end if;
  select arrival_on into v_on from trainer_profiles where gym_id = v_gym and profile_id = auth.uid();
  if not found or v_on = manila_today() then return false; end if;
  perform set_config('app.coach_marks', 'on', true);
  update trainer_profiles set arrival_on = manila_today() where gym_id = v_gym and profile_id = auth.uid();
  perform set_config('app.coach_marks', '', true);
  return true;
end;
$$;
revoke all on function coach_arrival() from public, anon;
grant execute on function coach_arrival() to authenticated;

-- 3. A trainee's win, to their coaches.

/**
 * The coaches a member trains with now: an active coaching term (or a stand-in
 * today), an approved 1-on-1 in the last 60 days or ahead, or an approved
 * booking on their class in the last 60 days or ahead. Narrower than
 * is_my_trainee() on purpose — someone who took one class a year ago is not
 * told about this week's record.
 */
create or replace function coaches_of(p_gym uuid, p_member uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  select k.trainer_id from coachings k
   where k.gym_id = p_gym and k.member_id = p_member and k.status = 'active'
  union
  select x.trainer_id from coaching_standins x join coachings k on k.id = x.coaching_id
   where x.gym_id = p_gym and k.member_id = p_member and k.status = 'active'
     and manila_today() between x.starts_on and x.ends_on
  union
  select s.trainer_id from pt_sessions s
   where s.gym_id = p_gym and s.member_id = p_member and s.status = 'approved'
     and s.starts_at > now() - interval '60 days'
  union
  select c.trainer_id from bookings b join classes c on c.id = b.class_id
   where b.gym_id = p_gym and b.member_id = p_member and b.status = 'approved'
     and c.trainer_id is not null and c.scheduled_at > now() - interval '60 days'
$$;
revoke all on function coaches_of(uuid, uuid) from public, anon, authenticated;

/** Writes the bell rows. Never fails the member's own write. */
create or replace function notify_coaches_of_win(p_gym uuid, p_member uuid, p_kind text, p_ref text,
                                                 p_title text, p_message text, p_share text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_first text; v_coach uuid; v_shared boolean;
begin
  begin
    -- The member's choice (0032): no preferences row means shared.
    if p_share is not null then
      select case p_share when 'workouts' then p.share_workouts when 'goals' then p.share_goals end
        into v_shared from member_share_prefs p where p.gym_id = p_gym and p.member_id = p_member;
      if v_shared is false then return; end if;
    end if;
    select first_name into v_first from profiles where id = p_member;
    for v_coach in select * from coaches_of(p_gym, p_member) loop
      continue when v_coach = p_member;
      insert into notifications (gym_id, user_id, type, title, message, action_url, metadata)
      values (p_gym, v_coach, 'trainee_win', coalesce(v_first, 'A trainee') || ' ' || p_title, p_message,
              '/trainer/members?open=' || p_member,
              jsonb_build_object('dedupe', 'twin:' || p_kind || ':' || p_ref, 'member_id', p_member,
                                 'first_name', v_first, 'kind', p_kind, 'ref', p_ref))
      on conflict do nothing;
    end loop;
  exception when others then
    null; -- The coach's alert is a courtesy; the member's record must never fail because of it.
  end;
end;
$$;
revoke all on function notify_coaches_of_win(uuid, uuid, text, text, text, text, text) from public, anon, authenticated;

create or replace function trg_win_record() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_ex text; v_fmt text;
begin
  select name into v_ex from exercises where id = new.exercise_id;
  v_fmt := case when new.kind = 'duration' then new.value::numeric(10,0) || ' s'
                else trim(trailing '.' from trim(trailing '0' from new.value::numeric(10,2)::text)) || ' kg' end;
  perform notify_coaches_of_win(new.gym_id, new.member_id, 'record', new.id::text, 'set a new record',
    coalesce(v_ex, 'An exercise') || ' · ' || v_fmt
      || case when new.previous > 0 then ' — best was ' || case when new.kind = 'duration' then new.previous::numeric(10,0) || ' s'
              else trim(trailing '.' from trim(trailing '0' from new.previous::numeric(10,2)::text)) || ' kg' end else '' end,
    'workouts');
  return new;
end;
$$;
drop trigger if exists win_record on personal_records;
create trigger win_record after insert on personal_records for each row execute function trg_win_record();

create or replace function trg_win_streak() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform notify_coaches_of_win(new.gym_id, new.member_id, 'streak', new.id::text,
    'made a ' || new.weeks || '-week streak', 'Their own weekly target, ' || new.weeks || ' weeks in a row');
  return new;
end;
$$;
drop trigger if exists win_streak on streak_milestones;
create trigger win_streak after insert on streak_milestones for each row execute function trg_win_streak();

-- A numbered target is reached only by settle_my_goals() (0087); a hand-ticked custom one is not a win.
create or replace function trg_win_target() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.achieved_on is null and new.achieved_on is not null
     and (new.metric <> 'custom' or new.template_key is not null) then
    perform notify_coaches_of_win(new.gym_id, new.member_id, 'target', new.id::text, 'reached a target', new.title, 'goals');
  end if;
  return new;
end;
$$;
drop trigger if exists win_target on fitness_goals;
create trigger win_target after update of achieved_on on fitness_goals for each row execute function trg_win_target();

create or replace function trg_win_challenge() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_title text;
begin
  if new.completed_on is not null and (tg_op = 'INSERT' or old.completed_on is null) then
    select title into v_title from challenges where id = new.challenge_id;
    perform notify_coaches_of_win(new.gym_id, new.member_id, 'challenge', new.challenge_id::text || ':' || new.member_id,
      'finished a challenge', coalesce(v_title, 'A challenge'));
  end if;
  return new;
end;
$$;
drop trigger if exists win_challenge on challenge_participants;
create trigger win_challenge after insert or update of completed_on on challenge_participants
  for each row execute function trg_win_challenge();

-- Trigger functions are not called directly by anyone.
revoke all on function trg_win_record() from public, anon, authenticated;
revoke all on function trg_win_streak() from public, anon, authenticated;
revoke all on function trg_win_target() from public, anon, authenticated;
revoke all on function trg_win_challenge() from public, anon, authenticated;
revoke all on function trg_guard_coach_marks() from public, anon, authenticated;

-- What's new for coaches, once each (0212).
insert into app_releases (app, title, items)
select 'trainer', 'Today does more, and your milestones', array[
  'Decide requests right on Today, find a trainee from the search at the top, and see your day in three numbers.',
  'When a trainee sets a record, makes a streak, reaches a target or finishes a challenge, you are told — send congrats in one tap.',
  'Sessions run, people coached and your ratings now have their own moments.'
]
where not exists (select 1 from app_releases where app = 'trainer' and title = 'Today does more, and your milestones');

-- The probe (scripts/probe-migrations.py) asks with the anon key, as for every marker.
create or replace function migration_0218_applied() returns boolean language sql stable as $$ select true $$;
grant execute on function migration_0218_applied() to anon, authenticated;
