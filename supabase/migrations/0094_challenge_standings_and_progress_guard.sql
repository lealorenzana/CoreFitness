-- 0094 — Challenge standings for the desk, and a NULL-safe progress guard.
--
-- 1. `challenge_progress()` (0052) guarded with `get_my_role() not in (...)`.
--    For a caller whose role is NULL that expression is NULL, the `if` does not
--    fire, and the count is returned — the exact trap DATA_ACCESS names. The
--    function is re-created unchanged except for that one guard.
--
-- 2. `challenge_standings(p_challenge)` — every participant with their progress,
--    for admin and front desk. The admin Challenges page could only say "12
--    joined, 3 finished"; it could not say who, or how close the rest are. The
--    numbers come from challenge_progress(), the same function the member's own
--    card calls, so the desk and the phone can never disagree.

create or replace function challenge_progress(p_challenge uuid, p_member uuid)
returns int
language plpgsql stable security definer set search_path = public as $fn$
declare
  c record;
  n int := 0;
begin
  select * into c from challenges where id = p_challenge;
  if c is null then
    return 0;
  end if;

  -- Only the member themselves, or the gym, may read a progress figure.
  -- NULL-safe (0094): 0052 compared `get_my_role() not in (...)`, which is
  -- NULL — not true — for a caller with no profile, so the early return was
  -- skipped and anyone could read anyone's count. Coalesced, a missing role is
  -- '' and is refused like any other.
  if p_member is distinct from auth.uid()
     and coalesce(get_my_role()::text, '') not in ('admin', 'staff', 'trainer') then
    return 0;
  end if;

  with raw as (
    select (a.check_in_time at time zone 'Asia/Manila')::date as d, true as verified
      from attendance a
     where a.member_id = p_member
       and (a.check_in_time at time zone 'Asia/Manila')::date between c.starts_on and c.ends_on
    union all
    select w.performed_on, false
      from workout_logs w
     where w.member_id = p_member
       and w.performed_on between c.starts_on and c.ends_on
  ),
  by_day as (
    select d, bool_or(verified) as verified from raw group by d
  ),
  weeks as (
    select date_trunc('week', d)::date as wk, count(*) as k from by_day group by 1
  ),
  activities as (
    select distinct lower(trim(act)) as act from (
      select a.activity as act from attendance a
       where a.member_id = p_member and a.activity is not null
         and (a.check_in_time at time zone 'Asia/Manila')::date between c.starts_on and c.ends_on
      union all
      select w.activity from workout_logs w
       where w.member_id = p_member and w.activity is not null
         and w.performed_on between c.starts_on and c.ends_on
    ) s
    where trim(act) <> ''
  )
  select case c.metric_key
    when 'training_days'       then (select count(*) from by_day)
    when 'verified_days'       then (select count(*) from by_day where verified)
    when 'logged_days'         then (select count(*) from by_day where not verified)
    when 'consistent_weeks'    then (select count(*) from weeks where k >= 2)
    when 'weekend_days'        then (select count(*) from by_day where extract(isodow from d) in (6,7))
    when 'distinct_activities' then (select count(*) from activities)
    when 'early_checkins'      then (select count(*) from attendance a
                                      where a.member_id = p_member
                                        and extract(hour from (a.check_in_time at time zone 'Asia/Manila')) < 7
                                        and (a.check_in_time at time zone 'Asia/Manila')::date between c.starts_on and c.ends_on)
    when 'late_checkins'       then (select count(*) from attendance a
                                      where a.member_id = p_member
                                        and extract(hour from (a.check_in_time at time zone 'Asia/Manila')) >= 20
                                        and (a.check_in_time at time zone 'Asia/Manila')::date between c.starts_on and c.ends_on)
    when 'goals_achieved'      then (select count(*) from fitness_goals g
                                      where g.member_id = p_member and g.achieved_on between c.starts_on and c.ends_on)
    -- `measured_on`, not `created_at`: the day it was measured, not the day it
    -- was typed in (0020). A member catching up on a week of entries must not
    -- have them all land inside whatever window is open today.
    when 'measurements'        then (select count(*) from body_measurements m
                                      where m.member_id = p_member
                                        and m.measured_on between c.starts_on and c.ends_on)
    -- "Attended", exactly as 0028 means it: approved, and the time has passed.
    when 'classes_attended'    then (select count(*) from bookings b
                                      join classes cl on cl.id = b.class_id
                                     where b.member_id = p_member and b.status = 'approved'
                                       and cl.scheduled_at < now()
                                       and (cl.scheduled_at at time zone 'Asia/Manila')::date between c.starts_on and c.ends_on)
    when 'pt_sessions_done'    then (select count(*) from pt_sessions p
                                      where p.member_id = p_member and p.status = 'approved'
                                        and p.starts_at < now()
                                        and (p.starts_at at time zone 'Asia/Manila')::date between c.starts_on and c.ends_on)
    else 0
  end into n;

  return coalesce(n, 0);
end;
$fn$;

create or replace function challenge_standings(p_challenge uuid)
returns table (member_id uuid, first_name text, last_name text, joined_at timestamptz,
               completed_on date, progress int, target int)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or coalesce(get_my_role()::text, '') not in ('admin', 'staff') then
    raise exception 'Only the gym can see challenge standings' using errcode = '42501';
  end if;
  return query
  select cp.member_id, p.first_name::text, p.last_name::text, cp.joined_at, cp.completed_on,
         challenge_progress(cp.challenge_id, cp.member_id), c.target::int
    from challenge_participants cp
    join challenges c on c.id = cp.challenge_id
    join profiles p on p.id = cp.member_id
   where cp.challenge_id = p_challenge
   order by cp.completed_on nulls last, challenge_progress(cp.challenge_id, cp.member_id) desc, cp.joined_at;
end;
$$;

revoke all on function challenge_standings(uuid) from public, anon;
grant execute on function challenge_standings(uuid) to authenticated;

comment on function challenge_standings(uuid) is
  'Participants of one challenge with progress from challenge_progress(); admin/front desk only. 0094.';

create or replace function migration_0094_applied() returns boolean
language sql immutable as $$ select true $$;
grant execute on function migration_0094_applied() to anon, authenticated;
