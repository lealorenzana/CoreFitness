-- Demo data part 2 — BLOCK 2 of 4 — PT sessions, monthly evaluations, trainer feedback
--
-- Paste ONE file at a time into the Supabase SQL Editor and run it, in
-- order 1 → 4. Split from seed-demo-data-2.sql, which explains every
-- choice made here: the editor has broken on a long paste before.
-- Re-runnable. Expect a NOTICE starting "Block 2:".

-- ============================================================================
-- BLOCK 2 of 4 — PT sessions, monthly evaluations, trainer feedback
-- ============================================================================
do $seed$
declare
  v_today   date := (now() at time zone 'Asia/Manila')::date;
  v_coaches uuid[];
  v_prem    uuid[];
  v_real    int;
  v_s int; v_r int; v_f int;
begin
  select array_agg(profile_id order by profile_id) into v_coaches
    from trainer_profiles where profile_id::text like '5eed0009-0000-4000-8000-%';
  select array_agg(m.member_id order by m.member_id) into v_prem
    from memberships m
    join membership_plans mp on mp.id = m.plan_id and mp.tier = 'premium'
    join profiles pr on pr.id = m.member_id and pr.status = 'active'
   where m.id::text like '5eed0002-0000-4000-8000-%' and m.status = 'active';
  select count(*) into v_real from pt_sessions where id::text not like '5eed____-0000-4000-8000-%';

  if v_coaches is null or v_prem is null then
    raise notice 'PT: no demo coaches or no demo Premium members. None added.';
    return;
  end if;
  if v_real >= 13 then
    raise notice 'PT sessions: % already. None added.', v_real;
    return;
  end if;

  alter table pt_sessions      disable trigger user;
  alter table trainer_ratings  disable trigger user;
  alter table trainer_feedback disable trigger user;

  -- Six weeks back, Monday to Saturday, 12:00 and 15:00 — never at 07:00 or
  -- 18:00, when the demo classes run, so no member or coach is double-booked.
  -- One session per coach per slot; a member picked twice for one slot keeps
  -- only the first. Nothing is left pending (the sweep would message the admin).
  insert into pt_sessions (id, trainer_id, member_id, starts_at, duration_minutes, status, notes,
                           requested_at, approved_at, approved_by, created_at,
                           decided_by, decided_by_role, decided_at)
  select ('5eed000e-0000-4000-8000-' || lpad(x.k::text, 12, '0'))::uuid,
         x.coach, x.member, x.starts, 60, x.status::booking_status, x.note,
         x.starts - make_interval(days => 1 + (x.h % 4)::int, hours => (x.h % 7)::int),
         case when x.status = 'approved' then x.starts - make_interval(days => 1, hours => (x.h % 5)::int) end,
         case when x.status = 'approved' then x.coach end,
         x.starts - make_interval(days => 1 + (x.h % 4)::int, hours => (x.h % 7)::int),
         case when x.status = 'approved' then x.coach end,
         case when x.status = 'approved' then 'trainer' when x.status = 'rejected' then 'system' end,
         case when x.status = 'approved' then x.starts - make_interval(days => 1, hours => (x.h % 5)::int)
              when x.status = 'rejected' then x.starts end
    from (
      select row_number() over (order by c.starts, c.coach) as k, c.*
        from (
          select g.coach, g.starts, g.h,
                 v_prem[1 + (g.h % cardinality(v_prem))::int] as member,
                 case when g.h % 100 < 78 then 'approved' when g.h % 100 < 90 then 'cancelled' else 'rejected' end
                   as status,
                 (array[null, 'Would like to work on my squat form.', 'First session — mostly want a plan.',
                        'Shoulder is a bit tight, go easy on pressing.', null,
                        'Training for the fun run next month.'])[1 + (g.h % 6)::int] as note,
                 row_number() over (partition by v_prem[1 + (g.h % cardinality(v_prem))::int], g.starts
                                    order by g.coach) as dup
            from (
              select v_coaches[t.t] as coach,
                     ((d.dd::date + s.slot) at time zone 'Asia/Manila') as starts,
                     (hashtext('pt' || d.dd::date || s.slot || t.t)::bigint + 2147483648) as h
                from generate_series(v_today - 42, v_today - 1, interval '1 day') as d(dd)
                cross join (values (time '12:00'), (time '15:00')) as s(slot)
                cross join generate_series(1, cardinality(v_coaches)) as t(t)
               where extract(dow from d.dd) between 1 and 6
            ) g
           where g.h % 100 < 22
        ) c
       where c.dup = 1
    ) x
    join profiles pr on pr.id = x.member and pr.created_at < x.starts
  on conflict (id) do nothing;

  -- One evaluation per member, coach and month, after a session that happened.
  insert into trainer_ratings (member_id, trainer_id, period, stars, comment, created_at, updated_at)
  select distinct on (s.member_id, s.trainer_id, date_trunc('month', s.starts_at at time zone 'Asia/Manila'))
         s.member_id, s.trainer_id,
         date_trunc('month', s.starts_at at time zone 'Asia/Manila')::date,
         case when h.v % 100 < 45 then 5 when h.v % 100 < 80 then 4 when h.v % 100 < 93 then 3
              when h.v % 100 < 98 then 2 else 1 end,
         (array['Very patient and explains every movement.',
                'Great energy, pushes you without being harsh.',
                null,
                'Knows his stuff. Sessions sometimes start a few minutes late.',
                'Helped me fix my deadlift form in two sessions.',
                'Good session, would like more time on the cool-down.',
                'Always checks on my knee before we start.',
                null,
                'Programme fits my schedule. Seeing results.',
                'A bit rushed this month, but still helpful.'])[1 + (h.v % 10)::int],
         s.starts_at + interval '1 day',
         s.starts_at + interval '1 day'
    from pt_sessions s
    cross join lateral (select (hashtext('rate' || s.id)::bigint + 2147483648) as v) h
   where s.id::text like '5eed000e-0000-4000-8000-%'
     and s.status = 'approved' and s.starts_at < now()
   order by s.member_id, s.trainer_id,
            date_trunc('month', s.starts_at at time zone 'Asia/Manila'), s.starts_at
  on conflict do nothing;

  -- What the coach wrote down afterwards, for about a third of the sessions.
  insert into trainer_feedback (id, trainer_id, member_id, note, recommendation, pt_session_id,
                                created_at, updated_at)
  select ('5eed000f-0000-4000-8000-' || lpad(right(s.id::text, 12), 12, '0'))::uuid,
         s.trainer_id, s.member_id,
         (array['Good session. Squat depth is improving; knees still cave on the last reps.',
                'Worked on hip hinge. Deadlift setup is much more consistent now.',
                'Conditioning is up — finished the circuit without stopping today.',
                'Shoulder felt fine through the pressing. Kept the load moderate.',
                'Balance work went well. Single-leg stands up to 30 seconds each side.',
                'Great effort. Needs more sleep before morning sessions.'])[1 + (h.v % 6)::int],
         (array['Add two sets of goblet squats on your off days.',
                'Keep the RDLs light and slow for another two weeks.',
                'Try the Tuesday HIIT class to build on this.',
                null,
                'Walk 20 minutes on rest days.',
                'Drink more water before training — you faded at the end.'])[1 + (h.v % 6)::int],
         s.id,
         s.starts_at + interval '2 hours',
         s.starts_at + interval '2 hours'
    from pt_sessions s
    cross join lateral (select (hashtext('fb' || s.id)::bigint + 2147483648) as v) h
   where s.id::text like '5eed000e-0000-4000-8000-%'
     and s.status = 'approved' and h.v % 3 = 0
  on conflict (id) do nothing;

  alter table pt_sessions      enable trigger user;
  alter table trainer_ratings  enable trigger user;
  alter table trainer_feedback enable trigger user;

  select count(*) into v_s from pt_sessions where id::text like '5eed000e-0000-4000-8000-%';
  select count(*) into v_r from trainer_ratings r where r.trainer_id::text like '5eed0009-0000-4000-8000-%';
  select count(*) into v_f from trainer_feedback where id::text like '5eed000f-0000-4000-8000-%';
  raise notice 'Block 2: % PT sessions, % evaluations, % feedback notes.', v_s, v_r, v_f;
end
$seed$;
