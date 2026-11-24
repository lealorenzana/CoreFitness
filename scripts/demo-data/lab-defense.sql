-- Core Fitness Lab, defense day (2026-11-24): fill the pages still at zero after lab-populate.sql.
--
-- Core Fitness Lab ONLY. Never G Fitness. Re-runnable: fixed demo ids (5eed8KKK-…, new people 5eed0001-…-0000000000NN
-- with @seed.corefitness-test.com emails), skipped when already there. "Tomorrow" rows are the morning of the day after
-- it runs (Manila), so the Today pages are not empty on the defense morning.
do $seed$
declare
  g    constant uuid := 'c0f1e55e-0000-4000-8000-000000000001';
  g2   constant uuid := 'c0f1e55e-0000-4000-8000-000000000002';
  own  constant uuid := 'cf1ab000-0000-4000-8000-000000000001';
  desk constant uuid := 'cf1ab000-0000-4000-8000-000000000002';
  coach constant uuid := 'cf1ab000-0000-4000-8000-000000000003';
  me   constant uuid := 'cf1ab000-0000-4000-8000-000000000004';
  v_today date := (now() at time zone 'Asia/Manila')::date;
  v_tom date := v_today + 1;
  m uuid[]; c uuid[]; n int; i int; k int; v_at timestamptz; v_col text;
  v_waiver uuid := '5eed8020-0000-4000-8000-000000000001';
  v_rules  uuid := '5eed8021-0000-4000-8000-000000000001';
  v_monthly uuid; v_price numeric;
  id_of constant text := '5eed8%s-0000-4000-8000-%s';
begin
  if not exists (select 1 from gyms where id = g and name = 'Core Fitness Lab') then raise exception 'No Core Fitness Lab'; end if;
  select array_agg(r.user_id order by r.user_id) into m from gym_roles r
   where r.gym_id = g and r.role = 'member' and r.status = 'active' and r.user_id::text like '5eed%';
  select array_agg(r.user_id order by r.user_id) into c from gym_roles r where r.gym_id = g and r.role = 'trainer' and r.status = 'active';
  n := cardinality(m);
  select id, price into v_monthly, v_price from membership_plans where gym_id = g and name = 'Monthly' and is_active;

  alter table gym_roles disable trigger user; alter table member_profiles disable trigger user; alter table gym_switches disable trigger user;
  alter table attendance disable trigger user; alter table coach_checkins disable trigger user; alter table payments disable trigger user;
  alter table streak_restores disable trigger user; alter table cash_outs disable trigger user; alter table personal_records disable trigger user;
  alter table booking_repeats disable trigger user; alter table waiver_acceptances disable trigger user; alter table house_rules_acceptances disable trigger user;
  alter table pending_registrations disable trigger user; alter table ai_topups disable trigger user;

  -- ── New made-up people: 6 waiting for the gym's approval, 2 at Lab 2 asking to switch in ──
  create temp table _p on commit drop as
  select format('5eed0001-0000-4000-8000-%s', lpad(s.x::text, 12, '0'))::uuid as id, s.x as i,
         (array['Joana','Marvin','Kristine','Paolo','Angel','Rafael','Bianca','Dennis'])[s.x - 40] as first,
         (array['Villanueva','Dizon','Ramirez','Fernandez','Morales','Gonzales','Reyes','Castro'])[s.x - 40] as last
    from generate_series(41, 48) s(x);
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  select p.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         lower(p.first) || '.' || lower(p.last) || '.' || p.i || '@seed.corefitness-test.com', '', now(),
         '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now() - (p.i - 40) * interval '9 hours', now()
    from _p p on conflict (id) do nothing;
  for v_col in select column_name from information_schema.columns where table_schema = 'auth' and table_name = 'users'
     and column_name in ('confirmation_token','recovery_token','email_change','email_change_token_new','email_change_token_current','phone_change','phone_change_token','reauthentication_token') loop
    execute format('update auth.users set %I = '''' where id::text like %L and %I is null', v_col, '5eed0001-%', v_col);
  end loop;
  insert into profiles (id, role, first_name, last_name, email, phone, status, active_gym_id, created_at)
  select p.id, 'member', p.first, p.last, u.email, '+639' || lpad((180000000 + p.i * 7919)::text, 9, '0'), 'active',
         case when p.i <= 46 then g else g2 end, now() - (p.i - 40) * interval '9 hours'
    from _p p join auth.users u on u.id = p.id on conflict (id) do nothing;
  update profiles pr set first_name = p.first, last_name = p.last, active_gym_id = case when p.i <= 46 then g else g2 end
    from _p p where pr.id = p.id;
  -- waiting at the Lab
  insert into gym_roles (gym_id, user_id, role, status) select g, p.id, 'member', 'pending_approval' from _p p where p.i <= 46 on conflict (gym_id, user_id) do nothing;
  -- The signup trigger on auth.users makes them active in their active gym: put them back to waiting.
  update gym_roles r set status = 'pending_approval' from _p p where r.user_id = p.id and r.gym_id = g and p.i <= 46 and r.status = 'active';
  insert into member_profiles (profile_id, gym_id, qr_code, experience_level, gender, address, created_at)
  select p.id, g, p.id::text, (array['beginner','intermediate','advanced'])[1 + p.i % 3], (array['female','male'])[1 + p.i % 2],
         'Brgy. ' || (array['Payompon','Balansay','Fatima','San Luis','Talabaan','Tangkalan'])[1 + p.i % 6] || ', Mamburao', now() - (p.i - 40) * interval '9 hours'
    from _p p where p.i <= 46 on conflict do nothing;
  insert into pending_registrations (id, first_name, last_name, email, phone, requested_plan_id, auth_user_id, created_at, gender, address, gym_id)
  select format(id_of, '001', lpad(p.i::text, 12, '0'))::uuid, p.first, p.last, u.email, pr.phone, v_monthly, p.id, now() - (p.i - 40) * interval '9 hours',
         (array['female','male'])[1 + p.i % 2], 'Mamburao, Occidental Mindoro', g
    from _p p join auth.users u on u.id = p.id join profiles pr on pr.id = p.id where p.i <= 46
  on conflict (id) do nothing;
  -- members of Lab 2 asking to move to the Lab
  insert into gym_roles (gym_id, user_id, role, status) select g2, p.id, 'member', 'active' from _p p where p.i > 46 on conflict (gym_id, user_id) do nothing;
  insert into member_profiles (profile_id, gym_id, qr_code, experience_level, created_at)
  select p.id, g2, p.id::text, 'intermediate', now() - interval '60 days' from _p p where p.i > 46 on conflict do nothing;
  insert into gym_roles (gym_id, user_id, role, status) select g, p.id, 'member', 'pending_approval' from _p p where p.i > 46 on conflict (gym_id, user_id) do nothing;
  insert into gym_switches (id, member, from_gym, to_gym, status, consent_at, created_at)
  select format(id_of, '002', lpad(p.i::text, 12, '0'))::uuid, p.id, g2, g, 'pending', now() - (p.i - 46) * interval '20 hours', now() - (p.i - 46) * interval '20 hours'
    from _p p where p.i > 46 and not exists (select 1 from gym_switches s where s.member = p.id and s.status = 'pending')
  on conflict (id) do nothing;
  -- two Lab members asking to move to Lab 2
  for i in 1..2 loop
    if not exists (select 1 from gym_switches s where s.member = m[10 + i] and s.status = 'pending') then
      insert into gym_roles (gym_id, user_id, role, status) values (g2, m[10 + i], 'member', 'pending_approval') on conflict (gym_id, user_id) do nothing;
      insert into gym_switches (id, member, from_gym, to_gym, status, consent_at, created_at)
      values (format(id_of, '003', lpad(i::text, 12, '0'))::uuid, m[10 + i], g, g2, 'pending', now() - i * interval '1 day', now() - i * interval '1 day')
      on conflict (id) do nothing;
    end if;
  end loop;

  -- ── Streak restores: the desk (with a reason) and members themselves ──
  insert into streak_restores (id, gym_id, member_id, week, kind, reason, note, lost_weeks, restored_by, created_at) values
    (format(id_of, '004', lpad('1', 12, '0'))::uuid, g, m[3], date_trunc('week', v_today - 21)::date, 'desk', 'sick', 'Had the flu, doctor''s note at the desk', 9, desk, now() - interval '19 days'),
    (format(id_of, '004', lpad('2', 12, '0'))::uuid, g, m[6], date_trunc('week', v_today - 14)::date, 'desk', 'gym_closed', null, 5, own, now() - interval '12 days'),
    (format(id_of, '004', lpad('3', 12, '0'))::uuid, g, m[9], date_trunc('week', v_today - 7)::date, 'member', null, null, 14, m[9], now() - interval '6 days'),
    (format(id_of, '004', lpad('4', 12, '0'))::uuid, g, m[14], date_trunc('week', v_today - 7)::date, 'member', null, null, 7, m[14], now() - interval '6 days'),
    (format(id_of, '004', lpad('5', 12, '0'))::uuid, g, m[20], date_trunc('week', v_today - 28)::date, 'desk', 'injury', 'Sprained ankle', 11, desk, now() - interval '26 days')
  on conflict do nothing;

  -- ── Cash taken out of the drawer: handed to the owner, and one bought supply ──
  for k in 1..6 loop
    insert into cash_outs (id, gym_id, day, kind, amount, taken_by, note, recorded_by, created_at)
    values (format(id_of, '005', lpad(k::text, 12, '0'))::uuid, g, v_today - k, case when k = 4 then 'paid_out' else 'handed_over' end,
            case when k = 4 then 350 else 1500 + (k * 700) % 2500 end, case when k = 4 then desk else own end,
            case when k = 4 then 'Cleaning supplies and drinking water' else 'Collected by the owner at closing' end, desk,
            ((v_today - k) + time '21:05') at time zone 'Asia/Manila')
    on conflict (id) do nothing;
  end loop;

  -- ── Personal records: each member's heaviest set per exercise, from the workouts they logged ──
  insert into personal_records (id, gym_id, member_id, exercise_id, kind, value, previous, set_id, achieved_at, points_awarded)
  select format(id_of, '006', lpad(row_number() over (order by x.achieved_at desc)::text, 12, '0'))::uuid, g, x.member_id, x.exercise_id, 'weight',
         x.top, coalesce(x.second, x.top - 2.5), x.set_id, x.achieved_at, 20
    from (
      select distinct on (l.member_id, s.exercise_id) l.member_id, s.exercise_id, s.weight_kg as top, s.id as set_id, s.created_at as achieved_at,
             (select max(s2.weight_kg) from workout_sets s2 join workout_logs l2 on l2.id = s2.log_id
               where l2.member_id = l.member_id and s2.exercise_id = s.exercise_id and s2.weight_kg < s.weight_kg) as second
        from workout_sets s join workout_logs l on l.id = s.log_id
       where s.gym_id = g and s.exercise_id is not null and s.weight_kg > 0
       order by l.member_id, s.exercise_id, s.weight_kg desc, s.created_at desc) x
   order by x.achieved_at desc
   limit 30
  on conflict do nothing;

  -- ── Weekly repeat bookings ──
  insert into booking_repeats (id, gym_id, member_id, kind, template_id, trainer_id, weekday, starts, duration_minutes, first_date, weeks, created_by, created_by_role, created_at)
  select format(id_of, '007', lpad(k::text, 12, '0'))::uuid, g, m[k * 3], 'class', t.id, null, t.day_of_week, t.start_time, t.duration_minutes,
         v_today + ((t.day_of_week - extract(dow from v_today)::int + 7) % 7), 8, m[k * 3], 'member', now() - interval '3 days'
    from (select row_number() over (order by id) k, * from class_templates where gym_id = g and active limit 3) t
  on conflict (id) do nothing;
  insert into booking_repeats (id, gym_id, member_id, kind, template_id, trainer_id, weekday, starts, duration_minutes, first_date, weeks, created_by, created_by_role, created_at)
  values (format(id_of, '007', lpad('9', 12, '0'))::uuid, g, m[2], 'pt', null, coach, 2, '07:00', 60,
          v_today + ((2 - extract(dow from v_today)::int + 7) % 7), 12, desk, 'desk', now() - interval '5 days')
  on conflict (id) do nothing;

  -- ── A published waiver (with the fixed PAR-Q) and house rules, signed by members and the demo logins ──
  if not exists (select 1 from gym_waivers where gym_id = g) then
    insert into gym_waivers (id, gym_id, version, title, body, published_at, created_at, created_by)
    values (v_waiver, g, 1, 'Core Fitness Lab liability waiver',
      'I take part in training at Core Fitness Lab of my own free will. I will follow the coaches and the house rules, use the equipment as shown, and tell the desk about any injury or health problem before I train. I understand that exercise carries some risk of injury, and that the gym is not responsible for injuries caused by ignoring instructions or for lost personal items.',
      now() - interval '60 days', now() - interval '60 days', own);
  end if;
  select id into v_waiver from gym_waivers where gym_id = g order by version desc limit 1;
  insert into waiver_acceptances (gym_id, waiver_id, member_id, accepted_at, par_q, flagged)
  select g, v_waiver, x.mid, now() - (x.k % 50) * interval '1 day',
         jsonb_build_object('heart_condition', x.k % 17 = 0, 'chest_pain_active', false, 'chest_pain_rest', false, 'balance', false,
                            'bone_joint', x.k % 11 = 0, 'medication', false, 'other_reason', false),
         x.k % 17 = 0 or x.k % 11 = 0
    from (select u.mid, row_number() over () k from unnest(m || me) u(mid)) x
  on conflict (waiver_id, member_id) do nothing;
  if not exists (select 1 from gym_house_rules where gym_id = g) then
    insert into gym_house_rules (id, gym_id, version, body, published_at, published_by)
    values (v_rules, g, 1, 'Wipe the bench after your set. Re-rack your weights. Wear closed shoes on the floor. Book your coach in the app, and cancel early if you cannot come. Be kind in the gym chat.',
            now() - interval '45 days', own);
  end if;
  select id into v_rules from gym_house_rules where gym_id = g order by version desc limit 1;
  insert into house_rules_acceptances (gym_id, rules_id, profile_id, accepted_at)
  select g, v_rules, x.pid, now() - (x.k % 40) * interval '1 day'
    from (select u.pid, row_number() over () k from unnest(m || c || me) u(pid)) x
  on conflict (rules_id, profile_id) do nothing;

  -- ── AI coach top-up: a verified pack and its balance ──
  insert into ai_topups (id, gym_id, packs, messages, amount, reference, status, requested_by, created_at, decided_at)
  values (format(id_of, '008', lpad('1', 12, '0'))::uuid, g, 1, 250, 499, 'GC-7780123456', 'paid', own, now() - interval '9 days', now() - interval '8 days')
  on conflict (id) do nothing;
  insert into gym_ai_credits (gym_id, balance, updated_at) values (g, 250, now() - interval '8 days') on conflict (gym_id) do nothing;

  -- ── Tomorrow morning, so Today is not empty on the defense day ──
  for k in 1..14 loop
    v_at := (v_tom + time '05:50' + (k * 11) * interval '1 minute') at time zone 'Asia/Manila';
    insert into attendance (id, member_id, check_in_time, method, recorded_by, gym_id, source, activity_by)
    values (format(id_of, '009', lpad(k::text, 12, '0'))::uuid, m[1 + (k * 5) % n], v_at,
            case when k % 3 = 0 then 'manual' else 'qr' end::checkin_method, case when k % 3 = 0 then desk end, g,
            case when k % 3 = 0 then 'desk' else 'kiosk' end, 'member')
    on conflict (id) do nothing;
  end loop;
  for k in 1..2 loop
    insert into coach_checkins (id, gym_id, trainer_id, check_in_time, day, method, source)
    values (format(id_of, '010', lpad(k::text, 12, '0'))::uuid, g, c[k], (v_tom + time '05:40' + k * interval '6 minutes') at time zone 'Asia/Manila', v_tom, 'qr', 'kiosk')
    on conflict do nothing;
  end loop;
  for k in 1..3 loop
    insert into payments (id, member_id, amount, method, status, invoice_number, recorded_by, created_at, paid_on, plan_id, plan_name, gym_id)
    values (format(id_of, '011', lpad(k::text, 12, '0'))::uuid, m[30 + k], v_price, case when k = 2 then 'GCash' else 'cash' end, 'completed',
            'INV-2026-98' || lpad(k::text, 2, '0'), desk, (v_tom + time '06:30' + k * interval '17 minutes') at time zone 'Asia/Manila', v_tom,
            v_monthly, 'Monthly', g)
    on conflict (id) do nothing;
  end loop;

  alter table gym_roles enable trigger user; alter table member_profiles enable trigger user; alter table gym_switches enable trigger user;
  alter table attendance enable trigger user; alter table coach_checkins enable trigger user; alter table payments enable trigger user;
  alter table streak_restores enable trigger user; alter table cash_outs enable trigger user; alter table personal_records enable trigger user;
  alter table booking_repeats enable trigger user; alter table waiver_acceptances enable trigger user; alter table house_rules_acceptances enable trigger user;
  alter table pending_registrations enable trigger user; alter table ai_topups enable trigger user;
end $seed$;
