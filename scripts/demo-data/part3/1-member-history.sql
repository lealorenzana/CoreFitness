-- Demo data part 3 — BLOCK 1 of 3 — two years of one member's history
--
-- Paste ONE file at a time into the Supabase SQL Editor, in order 1 → 3, after
-- parts 1 and 2. Re-runnable: every row has a fixed demo id and is skipped if
-- it is already there. Expect a NOTICE starting "Part 3 block 1:".
--
-- Who: the member whose email is set in v_email below, at G Fitness. Every row
-- added for them carries a demo id (5eed3___-0000-4000-8000-…), so the
-- platform's Remove demo data (0117, extended by 0168) takes it all back out
-- and leaves their real account exactly as it was.
--
-- What: 22 earlier monthly terms each paid with a numbered receipt, about
-- three visits a week, a weigh-in every month, three goals, three routines and
-- a workout logged on most training days (sets that get heavier over time),
-- the points those earned, the badges, and a weekly training plan.
do $seed$
declare
  v_email  text := 'lealorenzanaa@gmail.com';
  v_gym    uuid;
  v_me     uuid;
  v_owner  uuid;
  v_plan   record;
  v_cur    record;
  v_anchor date;
  v_today  date := (now() at time zone 'Asia/Manila')::date;
  v_r      uuid[];
  v_n      int;
  -- A demo id: block kind k (3 digits) and row number n.
  id_of constant text := '5eed3%s-0000-4000-8000-%s';
begin
  select id into v_gym from gyms where name = 'G Fitness' order by created_at limit 1;
  select id into v_me from auth.users where lower(email) = lower(v_email);
  if v_gym is null or v_me is null then
    raise notice 'Part 3 block 1: no G Fitness, or no account for %. Nothing added.', v_email;
    return;
  end if;
  if not exists (select 1 from member_profiles where profile_id = v_me and gym_id = v_gym) then
    raise notice 'Part 3 block 1: % is not a member of G Fitness. Nothing added.', v_email;
    return;
  end if;
  select user_id into v_owner from gym_roles where gym_id = v_gym and role = 'admin' and status = 'active' order by user_id limit 1;
  select id, name, price into v_plan from membership_plans
   where gym_id = v_gym and is_active and price > 0 order by (name ilike 'premium%') desc, price limit 1;
  select id, start_date into v_cur from memberships where member_id = v_me and gym_id = v_gym order by created_at desc limit 1;
  v_anchor := coalesce(v_cur.start_date, v_today - 30);

  alter table memberships       disable trigger user;
  alter table payments          disable trigger user;
  alter table attendance        disable trigger user;
  alter table body_measurements disable trigger user;
  alter table fitness_goals     disable trigger user;
  alter table workout_routines  disable trigger user;
  alter table workout_routine_exercises disable trigger user;
  alter table workout_logs      disable trigger user;
  alter table workout_sets      disable trigger user;
  alter table point_ledger      disable trigger user;
  alter table achievement_unlocks disable trigger user;
  alter table gym_plans         disable trigger user;

  -- ── 22 earlier monthly terms, each paid at the desk (a few by GCash) ──────────
  insert into memberships (id, gym_id, member_id, plan_id, status, start_date, expiry_date, never_expires, created_at, updated_at)
  select format(id_of, '110', lpad(i::text, 12, '0'))::uuid, v_gym, v_me, v_plan.id, 'expired',
         v_anchor - 30 * i, v_anchor - 30 * i + 29, false,
         ((v_anchor - 30 * i) + time '09:00') at time zone 'Asia/Manila', ((v_anchor - 30 * i) + time '09:00') at time zone 'Asia/Manila'
    from generate_series(1, 22) i
  on conflict (id) do nothing;

  insert into payments (id, gym_id, member_id, membership_id, amount, method, status, paid_on, invoice_number, notes,
                        recorded_by, plan_id, plan_name, created_at)
  select format(id_of, '111', lpad(i::text, 12, '0'))::uuid, v_gym, v_me, format(id_of, '110', lpad(i::text, 12, '0'))::uuid,
         v_plan.price, case when i % 5 = 0 then 'GCash' else 'Cash' end, 'completed', v_anchor - 30 * i,
         'INV-' || to_char(v_anchor - 30 * i, 'YYYY') || '-D' || lpad(i::text, 4, '0'),
         case when i % 5 = 0 then 'Paid online by GCash, ref ' || (1009000000 + i * 7919)::text end,
         v_owner, v_plan.id, v_plan.name, ((v_anchor - 30 * i) + time '09:15') at time zone 'Asia/Manila'
    from generate_series(1, 22) i
  on conflict (id) do nothing;

  -- ── About three visits a week since the first term ─────────────────────────────
  insert into attendance (id, gym_id, member_id, check_in_time, method, recorded_by, activity)
  select format(id_of, '112', lpad((v_today - d)::text, 12, '0'))::uuid, v_gym, v_me,
         (d + time '17:30' + (abs(hashtext(d::text || 'min')) % 150) * interval '1 minute') at time zone 'Asia/Manila',
         'qr', v_owner,
         (array['Weights', 'Weights', 'Cardio', 'Weights', 'Group class', 'Weights'])[1 + abs(hashtext(d::text || 'act')) % 6]
    from generate_series(v_anchor - 660, v_today - 1, interval '1 day') g(dd), lateral (select dd::date as d) x
   where extract(isodow from d) <> 7
     and abs(hashtext(d::text || 'go')) % 100 < 52
     and not exists (select 1 from attendance a where a.member_id = v_me
                      and (a.check_in_time at time zone 'Asia/Manila')::date = d)
  on conflict (id) do nothing;

  -- ── A weigh-in every month: 72 kg down to 64, body fat and waist with it ───────
  insert into body_measurements (id, gym_id, member_id, measured_on, weight_kg, height_cm, body_fat_pct, waist_cm, hips_cm,
                                 chest_cm, arms_cm, thighs_cm, notes, created_at)
  select format(id_of, '113', lpad(i::text, 12, '0'))::uuid, v_gym, v_me, v_anchor - 30 * i + 2,
         round((64 + i * 0.36 + (abs(hashtext(i::text || 'w')) % 10) / 10.0)::numeric, 1), 158,
         round((19 + i * 0.32)::numeric, 1), round((74 + i * 0.45)::numeric, 1), round((94 + i * 0.3)::numeric, 1),
         round((86 + i * 0.1)::numeric, 1), round((28 - i * 0.05)::numeric, 1), round((54 + i * 0.2)::numeric, 1),
         case i when 22 then 'First weigh-in with Coach' when 12 then 'Back after the holidays' end,
         ((v_anchor - 30 * i + 2) + time '18:00') at time zone 'Asia/Manila'
    from generate_series(0, 22) i
  on conflict (id) do nothing;

  -- ── Three goals: two reached, one on the way ──────────────────────────────────
  insert into fitness_goals (id, gym_id, member_id, title, metric, start_value, target_value, target_date, achieved_on, created_at)
  values
    (format(id_of, '114', '000000000001')::uuid, v_gym, v_me, 'Reach 65 kg', 'weight_kg', 72, 65, v_anchor - 40, v_anchor - 60, (v_anchor - 650) at time zone 'Asia/Manila'),
    (format(id_of, '114', '000000000002')::uuid, v_gym, v_me, 'Waist under 76 cm', 'waist_cm', 84, 76, v_anchor - 90, v_anchor - 120, (v_anchor - 400) at time zone 'Asia/Manila'),
    (format(id_of, '114', '000000000003')::uuid, v_gym, v_me, 'Body fat under 18%', 'body_fat_pct', 23, 18, v_today + 90, null, (v_anchor - 60) at time zone 'Asia/Manila')
  on conflict (id) do nothing;

  -- ── Three routines (push, pull, legs) from the gym's exercise library ──────────
  insert into workout_routines (id, gym_id, member_id, name, notes, position, created_at, updated_at)
  values
    (format(id_of, '115', '000000000001')::uuid, v_gym, v_me, 'Push day', 'Chest, shoulders, triceps', 10, (v_anchor - 640) at time zone 'Asia/Manila', now()),
    (format(id_of, '115', '000000000002')::uuid, v_gym, v_me, 'Pull day', 'Back and biceps', 11, (v_anchor - 640) at time zone 'Asia/Manila', now()),
    (format(id_of, '115', '000000000003')::uuid, v_gym, v_me, 'Leg day', 'Squat first, always', 12, (v_anchor - 640) at time zone 'Asia/Manila', now())
  on conflict (id) do nothing;
  v_r := array[format(id_of, '115', '000000000001')::uuid, format(id_of, '115', '000000000002')::uuid, format(id_of, '115', '000000000003')::uuid];

  insert into workout_routine_exercises (id, gym_id, routine_id, position, exercise_id, custom_name, target_sets, target_reps,
                                         target_weight_kg, target_seconds, rest_seconds)
  select format(id_of, '116', lpad((r * 10 + p)::text, 12, '0'))::uuid, v_gym, v_r[r], p,
         (select e.id from exercises e where e.name ilike x.pat and coalesce(e.is_active, true) order by e.gym_id nulls first limit 1),
         case when (select count(*) from exercises e where e.name ilike x.pat) = 0 then x.label end,
         3, x.reps, x.kg, null, 90
    from (values
      (1, 0, '%bench press%', 'Bench Press', 10, 30), (1, 1, '%overhead press%', 'Overhead Press', 10, 20), (1, 2, '%tricep%', 'Tricep Pushdown', 12, 15),
      (2, 0, '%lat pulldown%', 'Lat Pulldown', 10, 35), (2, 1, '%row%', 'Seated Row', 10, 30), (2, 2, '%curl%', 'Dumbbell Curl', 12, 8),
      (3, 0, '%squat%', 'Back Squat', 8, 50), (3, 1, '%romanian%', 'Romanian Deadlift', 10, 40), (3, 2, '%leg press%', 'Leg Press', 12, 80)
    ) x(r, p, pat, label, reps, kg)
  on conflict (id) do nothing;

  -- ── A workout on most weight days, the routine in turn, heavier as months pass ──
  insert into workout_logs (id, gym_id, member_id, performed_on, activity, duration_minutes, notes, routine_id, completed_at, created_at)
  select format(id_of, '117', lpad(n::text, 12, '0'))::uuid, v_gym, v_me, d,
         (array['Push day', 'Pull day', 'Leg day'])[1 + n % 3], 45 + abs(hashtext(d::text || 'dur')) % 30,
         case when n % 17 = 0 then 'Felt strong today' when n % 23 = 0 then 'Short on time — kept it to the main lifts' end,
         v_r[1 + n % 3],
         (d + time '19:10') at time zone 'Asia/Manila', (d + time '18:05') at time zone 'Asia/Manila'
    from (select (a.check_in_time at time zone 'Asia/Manila')::date as d,
                 row_number() over (order by a.check_in_time)::int as n
            from attendance a
           where a.member_id = v_me and a.id::text like '5eed3112-%' and a.activity = 'Weights') w
  on conflict (id) do nothing;

  insert into workout_sets (id, gym_id, log_id, exercise_id, custom_name, set_number, reps, weight_kg, created_at)
  select format(id_of, '118', lpad((l.n * 10 + x.p * 3 + s)::text, 12, '0'))::uuid, v_gym, l.id, rx.exercise_id,
         case when rx.exercise_id is null then rx.custom_name end, x.p * 3 + s, rx.target_reps,
         round((rx.target_weight_kg * (0.75 + 0.5 * least(1, (l.performed_on - (v_anchor - 660))::numeric / 660)))::numeric / 2.5) * 2.5,
         l.completed_at
    from (select id, routine_id, performed_on, completed_at, substr(id::text, 25)::bigint as n
            from workout_logs where member_id = v_me and id::text like '5eed3117-%') l
    join workout_routine_exercises rx on rx.routine_id = l.routine_id
    cross join lateral (select rx.position as p) x
    cross join generate_series(1, 3) s
  on conflict (id) do nothing;

  -- ── The points those earned, and the badges ────────────────────────────────────
  insert into point_ledger (id, gym_id, member_id, rule_key, points, source_table, source_id, created_at)
  select ('5eed3119-0000-4000-8000-' || substr(a.id::text, 25))::uuid, v_gym, v_me, 'checkin', 10, 'attendance', a.id, a.check_in_time
    from attendance a where a.member_id = v_me and a.id::text like '5eed3112-%'
  on conflict (id) do nothing;
  insert into point_ledger (id, gym_id, member_id, rule_key, points, source_table, source_id, created_at)
  select ('5eed3219-0000-4000-8000-' || substr(l.id::text, 25))::uuid, v_gym, v_me, 'workout_logged', 15, 'workout_logs', l.id, l.completed_at
    from workout_logs l where l.member_id = v_me and l.id::text like '5eed3117-%'
  on conflict (id) do nothing;

  insert into achievement_unlocks (id, gym_id, user_id, achievement_key, unlocked_on, seen, created_at)
  select format(id_of, '120', lpad(row_number() over (order by a.sort_order)::text, 12, '0'))::uuid, v_gym, v_me, a.key,
         v_anchor - 600 + (row_number() over (order by a.sort_order))::int * 25, true,
         ((v_anchor - 600 + (row_number() over (order by a.sort_order))::int * 25) + time '19:00') at time zone 'Asia/Manila'
    from achievements a
   where a.active and a.audience in ('member', 'all') and coalesce(a.tier, '') <> 'legendary'
     and not exists (select 1 from achievement_unlocks u where u.user_id = v_me and u.achievement_key = a.key)
   order by a.sort_order
   limit 14
  on conflict (id) do nothing;

  -- ── The weekly plan: Monday push, Wednesday pull, Friday legs ───────────────────
  insert into gym_plans (id, gym_id, member_id, day_of_week, remind_at, active, routine_id, created_at)
  select format(id_of, '146', lpad(x.dow::text, 12, '0'))::uuid, v_gym, v_me, x.dow, time '17:30', true, v_r[x.r], (v_anchor - 600) at time zone 'Asia/Manila'
    from (values (1, 1), (3, 2), (5, 3)) x(dow, r)
   where not exists (select 1 from gym_plans p where p.member_id = v_me and p.day_of_week = x.dow)
  on conflict (id) do nothing;

  alter table memberships       enable trigger user;
  alter table payments          enable trigger user;
  alter table attendance        enable trigger user;
  alter table body_measurements enable trigger user;
  alter table fitness_goals     enable trigger user;
  alter table workout_routines  enable trigger user;
  alter table workout_routine_exercises enable trigger user;
  alter table workout_logs      enable trigger user;
  alter table workout_sets      enable trigger user;
  alter table point_ledger      enable trigger user;
  alter table achievement_unlocks enable trigger user;
  alter table gym_plans         enable trigger user;

  select count(*) into v_n from attendance where member_id = v_me;
  raise notice 'Part 3 block 1: % now has % visits, % workouts, % receipts and % points.', v_email, v_n,
    (select count(*) from workout_logs where member_id = v_me),
    (select count(*) from payments where member_id = v_me),
    (select coalesce(sum(points), 0) from point_ledger where member_id = v_me);
end
$seed$;
