-- ============================================================================
-- Fresh start — PART 2 of 5 — your private test gym, and the four sign-ins
-- ============================================================================
--
-- After part 1. Paste the whole file and run it. One transaction. Re-runnable:
-- a second run adds nothing twice, and gives the four sign-ins NEW passwords
-- (use it if you lose them).
--
-- Gym #1 becomes "Core Fitness Lab": never listed to the public (0198), never
-- billed, never locked. It is filled like a gym that has run for a while —
-- coaches, ~40 members on every kind of plan, two months of check-ins and
-- payments, a weekly timetable with classes behind and ahead, 1-on-1
-- sessions, events, challenges, rewards, a program and the equipment list.
-- Parts 3–5 then give the member sign-in two years of their own history.
--
-- The four sign-ins are yours (Gmail delivers every +alias to your inbox):
--   mf.jgabrielle+owner@gmail.com   the owner    → admin app
--   mf.jgabrielle+desk@gmail.com    front desk   → admin app
--   mf.jgabrielle+coach@gmail.com   a coach      → member app, Trainer tab
--   mf.jgabrielle+member@gmail.com  a member     → member app
-- Their passwords are made here, by the database, and shown ONCE in the result
-- table under the editor. Nobody else ever sees them.
--
-- Every made-up person and row carries a demo id (5eed____-0000-4000-8000-…),
-- so the platform's Remove demo data can take it all out again; the four
-- sign-ins have ids starting cf1ab000 and are never removed by it.
-- ============================================================================

create temp table if not exists _lab_logins (role text, email text, password text, app text);
truncate _lab_logins;
drop table if exists _lab_people;

do $lab$
declare
  v_gym    uuid := gym_one();
  v_today  date := (now() at time zone 'Asia/Manila')::date;
  v_owner  uuid := 'cf1ab000-0000-4000-8000-000000000001';
  v_desk   uuid := 'cf1ab000-0000-4000-8000-000000000002';
  v_coach  uuid := 'cf1ab000-0000-4000-8000-000000000003';
  v_member uuid := 'cf1ab000-0000-4000-8000-000000000004';
  v_free uuid; v_monthly uuid; v_premium uuid; v_quarter uuid;
  v_col    text;
  a        record;
  v_pw     text;
  v_n      int;
  id_of constant text := '5eed%s-0000-4000-8000-%s';
begin
  if (select count(*) from gyms) <> 1 then
    raise exception 'Run part 1 first: this expects Gym #1 to be the only gym.';
  end if;

  -- ── The gym ────────────────────────────────────────────────────────────────
  update gyms set name = 'Core Fitness Lab', slug = 'core-fitness-lab', status = 'active', plan = 'pro',
                  paid_until = null, onboarded_at = coalesce(onboarded_at, now()), onboarding_step = null,
                  latitude = 13.223200, longitude = 120.596000
   where id = v_gym;

  insert into gym_settings (gym_id, gym_name) values (v_gym, 'Core Fitness Lab') on conflict (gym_id) do nothing;
  update gym_settings set
    gym_name = 'Core Fitness Lab', short_name = 'Lab', tagline = 'Where Core Fitness is tried first',
    address = 'Mamburao, Occidental Mindoro', phone = '+63 917 000 0000', email = 'mf.jgabrielle+owner@gmail.com',
    opening_time = '06:00', closing_time = '21:00', logo_url = null, accent = 'violet', accent_action = null,
    welcome_message = 'Welcome to the lab — everything here is for testing.',
    join_policy = 'closed', join_approval = 'desk', min_age = 16, waiver_required = false,
    class_booking_approval = 'coach', pt_booking_approval = 'coach',
    coaching_modes = array['classes', 'pick_pt', 'pick_group', 'desk_assigns', 'coach_invites'],
    coaching_lengths = array[1, 3, 6], coaching_fee_mode = 'included',
    day_pass_on = true, day_pass_price = 150, pack5_price = 650, pack10_price = 1200, guest_nudge_visits = 3,
    day_pass_classes = true, closed_days = '{}'
   where gym_id = v_gym;

  -- The plans a new gym starts with (0186's starter set), priced, plus a quarterly.
  alter table membership_plans disable trigger user;
  alter table plan_features disable trigger user;
  for a in select * from (values
      ('Free',      'free'::plan_tier,    null::int, 0,    'The free library, check-in and the gym''s news.', false, false,
       array[]::text[]),
      ('Monthly',   'premium'::plan_tier, 30,        800,  'Class booking, the workout tracker, challenges and points.', true, false,
       array['workout_tracker', 'challenges', 'points_earn', 'points_redeem']),
      ('Premium',   'pro'::plan_tier,     30,        1500, 'Everything in Monthly, plus 1-on-1 coaching, coaching rooms, programs and the AI coach.', true, true,
       array['workout_tracker', 'challenges', 'points_earn', 'points_redeem', 'plan_builder', 'ai_model', 'premium_programs', 'coaching_rooms']),
      ('Quarterly', 'pro'::plan_tier,     90,        4200, 'Premium for three months, at a better price.', true, true,
       array['workout_tracker', 'challenges', 'points_earn', 'points_redeem', 'plan_builder', 'ai_model', 'premium_programs', 'coaching_rooms'])
    ) as t(name, tier, days, price, description, classes, pt, on_keys)
  loop
    if not exists (select 1 from membership_plans where gym_id = v_gym and name = a.name) then
      insert into membership_plans (gym_id, name, tier, price, duration_days, description, is_active,
                                    can_book_classes, can_book_pt, price_unset)
      values (v_gym, a.name, a.tier, a.price, a.days, a.description, true, a.classes, a.pt, false);
    end if;
    insert into plan_features (gym_id, plan_id, feature_key, enabled, quota)
    select v_gym, p.id, f.key, f.key = any (a.on_keys), null
      from features f, membership_plans p where p.gym_id = v_gym and p.name = a.name
    on conflict (plan_id, feature_key) do nothing;
  end loop;
  alter table membership_plans enable trigger user;
  alter table plan_features enable trigger user;
  select id into v_free    from membership_plans where gym_id = v_gym and name = 'Free';
  select id into v_monthly from membership_plans where gym_id = v_gym and name = 'Monthly';
  select id into v_premium from membership_plans where gym_id = v_gym and name = 'Premium';
  select id into v_quarter from membership_plans where gym_id = v_gym and name = 'Quarterly';

  -- ── The four sign-ins ──────────────────────────────────────────────────────
  for a in select * from (values
      (v_owner,  'owner',  'Gabby', 'Owner',  'admin'::user_role,   'Owner',      'Admin app'),
      (v_desk,   'desk',   'Gabby', 'Desk',   'staff'::user_role,   'Front desk', 'Admin app'),
      (v_coach,  'coach',  'Gabby', 'Coach',  'trainer'::user_role, 'Coach',      'Member app → Trainer'),
      (v_member, 'member', 'Gabby', 'Member', 'member'::user_role,  'Member',     'Member app')
    ) as x(id, tag, first, last, role, label, app)
  loop
    -- A password nobody chose: 4 letters, 4 digits, 4 letters.
    v_pw := 'Lab-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 4))
         || '-' || lpad((floor(random() * 10000))::int::text, 4, '0')
         || '-' || substr(md5(clock_timestamp()::text || random()::text), 1, 4);
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values ('00000000-0000-0000-0000-000000000000', a.id, 'authenticated', 'authenticated',
            'mf.jgabrielle+' || a.tag || '@gmail.com', extensions.crypt(v_pw, extensions.gen_salt('bf')), now(),
            '{"provider":"email","providers":["email"]}'::jsonb,
            jsonb_build_object('first_name', a.first, 'last_name', a.last), now(), now())
    on conflict (id) do update set encrypted_password = excluded.encrypted_password,
                                   email_confirmed_at = coalesce(auth.users.email_confirmed_at, now()), updated_at = now();
    insert into auth.identities (user_id, provider, provider_id, identity_data, created_at, updated_at)
    select a.id, 'email', a.id::text,
           jsonb_build_object('sub', a.id::text, 'email', 'mf.jgabrielle+' || a.tag || '@gmail.com', 'email_verified', true),
           now(), now()
     where not exists (select 1 from auth.identities i where i.user_id = a.id and i.provider = 'email');
    insert into _lab_logins values (a.label, 'mf.jgabrielle+' || a.tag || '@gmail.com', v_pw, a.app);
  end loop;
  -- GoTrue reads these as strings; a NULL breaks sign-in for the account.
  for v_col in
    select column_name from information_schema.columns
     where table_schema = 'auth' and table_name = 'users'
       and column_name in ('confirmation_token', 'recovery_token', 'email_change', 'email_change_token_new',
                           'email_change_token_current', 'phone_change', 'phone_change_token', 'reauthentication_token')
  loop
    execute format('update auth.users set %I = '''' where id::text like %L and %I is null', v_col, 'cf1ab000-%', v_col);
  end loop;

  alter table profiles         disable trigger user;
  alter table gym_roles        disable trigger user;
  alter table member_profiles  disable trigger user;
  alter table trainer_profiles disable trigger user;
  alter table memberships      disable trigger user;
  alter table payments         disable trigger user;
  alter table attendance       disable trigger user;
  alter table trainer_availability disable trigger user;
  alter table class_templates  disable trigger user;
  alter table classes          disable trigger user;
  alter table bookings         disable trigger user;
  alter table pt_sessions      disable trigger user;
  alter table coachings        disable trigger user;
  alter table events           disable trigger user;
  alter table challenges       disable trigger user;
  alter table rewards          disable trigger user;
  alter table gym_workouts     disable trigger user;
  alter table gym_programs     disable trigger user;
  alter table gym_program_days disable trigger user;
  alter table gym_equipment    disable trigger user;
  alter table guests           disable trigger user;
  alter table guest_visits     disable trigger user;
  alter table notifications    disable trigger user;

  insert into profiles (id, role, first_name, last_name, email, phone, status, active_gym_id, created_at)
  select u.id, x.role, x.first, x.last, u.email, '+63 917 000 000' || x.n, 'active', v_gym, now() - interval '400 days'
    from (values (v_owner, 'admin'::user_role, 'Gabby', 'Owner', 1), (v_desk, 'staff'::user_role, 'Gabby', 'Desk', 2),
                 (v_coach, 'trainer'::user_role, 'Gabby', 'Coach', 3), (v_member, 'member'::user_role, 'Gabby', 'Member', 4))
         as x(id, role, first, last, n)
    join auth.users u on u.id = x.id
  on conflict (id) do update set role = excluded.role, status = 'active', active_gym_id = v_gym,
                                 first_name = excluded.first_name, last_name = excluded.last_name;
  insert into gym_roles (gym_id, user_id, role, status)
  values (v_gym, v_owner, 'admin', 'active'), (v_gym, v_desk, 'staff', 'active'),
         (v_gym, v_coach, 'trainer', 'active'), (v_gym, v_member, 'member', 'active')
  on conflict (gym_id, user_id) do update set role = excluded.role, status = 'active';
  insert into trainer_profiles (profile_id, gym_id, specialization, bio, years_experience, certifications, focus_areas, presence)
  values (v_coach, v_gym, 'Strength and conditioning', 'Your test coach: strength, conditioning and first-timers.', 6,
          array['PRC-registered PT', 'NASM CPT'], array['Strength', 'Fat loss', 'Beginners'], 'available')
  on conflict do nothing;
  insert into member_profiles (profile_id, gym_id, qr_code, experience_level, date_of_birth, gender, address,
                               emergency_contact_name, emergency_contact_phone, emergency_contact_relationship,
                               onboarding_completed_at, terms_accepted_at, show_on_boards, streak_target, created_at)
  values (v_member, v_gym, v_member::text, 'intermediate', date '1999-05-14', 'prefer_not_to_say', 'Brgy. Payompon, Mamburao',
          'Gabby Owner', '+63 917 000 0001', 'Friend', now() - interval '400 days', now() - interval '400 days', true, 3,
          now() - interval '400 days')
  on conflict do nothing;

  -- The member's current term: Premium, 10 days in, paid at the desk.
  insert into memberships (id, gym_id, member_id, plan_id, status, start_date, expiry_date, never_expires, created_at)
  values ('cf1ab000-0000-4000-8000-0000000000a1', v_gym, v_member, v_premium, 'active', v_today - 10, v_today + 19, false,
          now() - interval '10 days')
  on conflict (id) do nothing;
  insert into payments (id, gym_id, member_id, membership_id, amount, method, status, paid_on, invoice_number,
                        recorded_by, plan_id, plan_name, created_at)
  values ('cf1ab000-0000-4000-8000-0000000000a2', v_gym, v_member, 'cf1ab000-0000-4000-8000-0000000000a1', 1500, 'Cash',
          'completed', v_today - 10, 'LAB-' || to_char(v_today, 'YYYY') || '-0001', v_desk, v_premium, 'Premium',
          now() - interval '10 days')
  on conflict (id) do nothing;

  -- ── Three more coaches (made-up, no sign-in) ───────────────────────────────
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  select format(id_of, '0002', lpad(i::text, 12, '0'))::uuid, '00000000-0000-0000-0000-000000000000',
         'authenticated', 'authenticated', 'coach' || i || '@seed.corefitness-test.com', '', now(),
         '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
    from generate_series(1, 3) i
  on conflict (id) do nothing;
  insert into profiles (id, role, first_name, last_name, email, status, active_gym_id, created_at)
  select format(id_of, '0002', lpad(x.i::text, 12, '0'))::uuid, 'trainer', x.first, x.last,
         'coach' || x.i || '@seed.corefitness-test.com', 'active', v_gym, now() - interval '500 days'
    from (values (1, 'Marco', 'Villanueva'), (2, 'Joanna', 'Reyes'), (3, 'Paolo', 'Dimaculangan')) as x(i, first, last)
  on conflict (id) do nothing;
  insert into gym_roles (gym_id, user_id, role, status)
  select v_gym, format(id_of, '0002', lpad(i::text, 12, '0'))::uuid, 'trainer', 'active' from generate_series(1, 3) i
  on conflict (gym_id, user_id) do nothing;
  insert into trainer_profiles (profile_id, gym_id, specialization, bio, years_experience, focus_areas, presence)
  select format(id_of, '0002', lpad(x.i::text, 12, '0'))::uuid, v_gym, x.spec, x.bio, x.yrs, x.focus, 'available'
    from (values (1, 'Yoga and mobility', 'Gentle, steady, and serious about form.', 8, array['Mobility', 'Yoga']),
                 (2, 'Boxing', 'Pads, footwork and conditioning.', 5, array['Boxing', 'Conditioning']),
                 (3, 'Indoor cycling', 'Music up, cadence steady.', 4, array['Cardio', 'Endurance'])) as x(i, spec, bio, yrs, focus)
  on conflict do nothing;

  -- Everyone's hours: Mon–Sat mornings and evenings.
  insert into trainer_availability (gym_id, trainer_id, day_of_week, start_time, end_time, slot_minutes)
  select v_gym, c.id, d, s.st, s.en, 60
    from (select v_coach as id union all select format(id_of, '0002', lpad(i::text, 12, '0'))::uuid from generate_series(1, 3) i) c
    cross join generate_series(1, 6) d
    cross join (values (time '07:00', time '11:00'), (time '15:00', time '19:00')) as s(st, en)
   where not exists (select 1 from trainer_availability t where t.trainer_id = c.id);

  -- ── Forty members (made-up, no sign-in) ────────────────────────────────────
  create temp table _lab_people as
  select i,
         format(id_of, '0001', lpad(i::text, 12, '0'))::uuid as id,
         (array['Andrea','Bea','Carlo','Dan','Ella','Franco','Gia','Hans','Ivy','Jomar','Kat','Leo','Mika','Nico',
                'Olive','Pia','Quino','Rhea','Sam','Tess'])[1 + (i - 1) % 20] as first,
         (array['Santos','Cruz','Bautista','Ocampo','Garcia','Mendoza','Torres','Flores','Ramos','Aquino',
                'Castillo','Navarro','Del Rosario','Pascual','Salazar','Manalo','Lopez','Tolentino'])[1 + (i * 7) % 18] as last,
         case when i <= 16 then 'premium' when i <= 26 then 'monthly' when i <= 29 then 'quarter'
              when i <= 33 then 'expired' when i <= 35 then 'frozen' else 'free' end as kind,
         (i * 37) % 300 + 60 as joined_days_ago
    from generate_series(1, 40) i;

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  select p.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         lower(replace(p.first, ' ', '')) || '.' || lower(replace(p.last, ' ', '')) || '.' || p.i || '@seed.corefitness-test.com',
         '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
    from _lab_people p
  on conflict (id) do nothing;
  for v_col in
    select column_name from information_schema.columns
     where table_schema = 'auth' and table_name = 'users'
       and column_name in ('confirmation_token', 'recovery_token', 'email_change', 'email_change_token_new',
                           'email_change_token_current', 'phone_change', 'phone_change_token', 'reauthentication_token')
  loop
    execute format('update auth.users set %I = '''' where id::text like %L and %I is null', v_col, '5eed000%', v_col);
  end loop;
  insert into profiles (id, role, first_name, last_name, email, phone, status, active_gym_id, created_at)
  select p.id, 'member', p.first, p.last, u.email, '+639' || lpad((170000000 + p.i * 7919)::text, 9, '0'), 'active', v_gym,
         now() - make_interval(days => p.joined_days_ago)
    from _lab_people p join auth.users u on u.id = p.id
  on conflict (id) do nothing;
  insert into gym_roles (gym_id, user_id, role, status)
  select v_gym, p.id, 'member', 'active' from _lab_people p
  on conflict (gym_id, user_id) do nothing;
  insert into member_profiles (profile_id, gym_id, qr_code, experience_level, gender, address, onboarding_completed_at,
                               terms_accepted_at, show_on_boards, created_at)
  select p.id, v_gym, p.id::text, (array['beginner','intermediate','advanced'])[1 + p.i % 3],
         (array['female','male','prefer_not_to_say'])[1 + p.i % 3],
         'Brgy. ' || (array['Payompon','Balansay','Fatima','San Luis','Talabaan','Tangkalan'])[1 + p.i % 6] || ', Mamburao',
         now() - make_interval(days => p.joined_days_ago), now() - make_interval(days => p.joined_days_ago),
         p.i % 4 <> 0, now() - make_interval(days => p.joined_days_ago)
    from _lab_people p
  on conflict do nothing;

  -- Their current terms.
  insert into memberships (id, gym_id, member_id, plan_id, status, start_date, expiry_date, never_expires, frozen_at, created_at)
  select format(id_of, '0003', lpad(p.i::text, 12, '0'))::uuid, v_gym, p.id,
         case p.kind when 'premium' then v_premium when 'monthly' then v_monthly when 'quarter' then v_quarter
                     when 'expired' then v_monthly when 'frozen' then v_premium else v_free end,
         (case p.kind when 'expired' then 'expired' when 'frozen' then 'frozen' else 'active' end)::membership_status,
         case p.kind when 'expired' then v_today - 40 - p.i when 'quarter' then v_today - (p.i % 60) else v_today - (p.i * 3) % 28 end,
         case p.kind when 'free' then null when 'expired' then v_today - 10 - p.i
                     when 'quarter' then v_today - (p.i % 60) + 89 else v_today - (p.i * 3) % 28 + 29 end,
         p.kind = 'free',
         case when p.kind = 'frozen' then v_today - 5 end,
         now() - make_interval(days => (p.i * 3) % 28)
    from _lab_people p
  on conflict (id) do nothing;

  -- What they paid: this term, and up to three before it, at the desk.
  insert into payments (id, gym_id, member_id, membership_id, amount, method, status, paid_on, invoice_number,
                        recorded_by, plan_id, plan_name, created_at)
  select format(id_of, '0004', lpad((p.i * 10 + k)::text, 12, '0'))::uuid, v_gym, p.id,
         case when k = 0 then m.id end, pl.price, case when (p.i + k) % 4 = 0 then 'GCash' else 'Cash' end, 'completed',
         m.start_date - 30 * k,
         'LAB-' || to_char(m.start_date - 30 * k, 'YYYY') || '-D' || lpad((p.i * 10 + k)::text, 4, '0'),
         v_desk, pl.id, pl.name, ((m.start_date - 30 * k) + time '09:30') at time zone 'Asia/Manila'
    from _lab_people p
    join memberships m on m.id = format(id_of, '0003', lpad(p.i::text, 12, '0'))::uuid
    join membership_plans pl on pl.id = m.plan_id
    cross join generate_series(0, 3) k
   where pl.price > 0 and k <= p.i % 4
  on conflict (id) do nothing;

  -- Two months of check-ins: regulars three or four times a week, some less;
  -- a handful already in today.
  insert into attendance (id, gym_id, member_id, check_in_time, method, recorded_by, activity)
  select format(id_of, '0005', lpad((p.i * 1000 + d)::text, 12, '0'))::uuid, v_gym, p.id,
         ((v_today - d) + make_time(6 + (p.i * 5 + d) % 14, (p.i * 13 + d * 7) % 60, 0)) at time zone 'Asia/Manila',
         (case when (p.i + d) % 3 = 0 then 'manual' else 'qr' end)::checkin_method,
         case when (p.i + d) % 3 = 0 then v_desk end,
         (array['Gym floor', 'Gym floor', 'Gym floor', 'Class', 'Cardio'])[1 + (p.i + d) % 5]
    from _lab_people p
    cross join generate_series(0, 59) d
   where (p.kind not in ('expired', 'frozen') or d > 15)
     and ((p.i * 31 + d * 17) % 7) < case when p.i % 5 = 0 then 1 when p.i % 3 = 0 then 2 else 4 end
     and (d > 0 or p.i % 4 = 0)
  on conflict (id) do nothing;
  delete from attendance where gym_id = v_gym and id::text like '5eed0005-%'
     and (check_in_time at time zone 'Asia/Manila')::date = v_today
     and (check_in_time at time zone 'Asia/Manila')::time > (now() at time zone 'Asia/Manila')::time;

  -- ── The timetable: a week of classes, past two months and next two weeks ──
  insert into class_templates (id, gym_id, name, trainer_id, level, capacity, location, day_of_week, start_time, duration_minutes, active)
  select format(id_of, '0006', lpad(x.n::text, 12, '0'))::uuid, v_gym, x.name, x.coach, x.lvl::class_level, x.cap, x.room,
         x.dow, x.st, x.mins, true
    from (values (1, 'Morning HIIT',     v_coach, 'all_levels', 16, 'Studio', 1, time '06:30', 45),
                 (2, 'Morning HIIT',     v_coach, 'all_levels', 16, 'Studio', 3, time '06:30', 45),
                 (3, 'Morning HIIT',     v_coach, 'all_levels', 16, 'Studio', 5, time '06:30', 45),
                 (4, 'Strength Basics',  v_coach, 'beginner',   10, 'Gym floor', 2, time '18:00', 60),
                 (5, 'Strength Basics',  v_coach, 'beginner',   10, 'Gym floor', 4, time '18:00', 60),
                 (6, 'Flow Yoga',        format(id_of, '0002', lpad('1', 12, '0'))::uuid, 'all_levels', 14, 'Studio', 2, time '07:00', 60),
                 (7, 'Flow Yoga',        format(id_of, '0002', lpad('1', 12, '0'))::uuid, 'all_levels', 14, 'Studio', 4, time '07:00', 60),
                 (8, 'Boxing Fundamentals', format(id_of, '0002', lpad('2', 12, '0'))::uuid, 'intermediate', 12, 'Mat area', 6, time '09:00', 60),
                 (9, 'Spin 45',          format(id_of, '0002', lpad('3', 12, '0'))::uuid, 'all_levels', 12, 'Studio', 1, time '18:00', 45),
                 (10, 'Spin 45',         format(id_of, '0002', lpad('3', 12, '0'))::uuid, 'all_levels', 12, 'Studio', 3, time '18:00', 45))
         as x(n, name, coach, lvl, cap, room, dow, st, mins)
  on conflict (id) do nothing;

  insert into classes (id, gym_id, name, trainer_id, level, capacity, location, scheduled_at, duration_minutes, template_id)
  select format(id_of, '0007', lpad((t.n * 1000 + d + 100)::text, 12, '0'))::uuid, v_gym, t.name, t.trainer_id, t.level,
         t.capacity, t.location, ((v_today + d) + t.start_time) at time zone 'Asia/Manila', t.duration_minutes, t.id
    from (select ct.*, substr(ct.id::text, 25)::int as n from class_templates ct where ct.gym_id = v_gym and ct.id::text like '5eed0006-%') t
    cross join generate_series(-60, 14) d
   where extract(dow from v_today + d) = t.day_of_week
  on conflict (id) do nothing;

  -- Bookings: past classes were attended; the next few days fill up, some still waiting for the coach.
  insert into bookings (id, gym_id, member_id, class_id, status, requested_at, approved_at, decided_by, decided_by_role, decided_at)
  select format(id_of, '0008', lpad((substr(c.id::text, 25)::bigint * 50 + p.i)::text, 12, '0'))::uuid, v_gym, p.id, c.id,
         (case when c.scheduled_at > now() and (p.i + extract(day from c.scheduled_at)::int) % 4 = 0 then 'pending' else 'approved' end)::booking_status,
         c.scheduled_at - interval '2 days',
         case when c.scheduled_at <= now() or (p.i + extract(day from c.scheduled_at)::int) % 4 <> 0 then c.scheduled_at - interval '47 hours' end,
         case when c.scheduled_at <= now() or (p.i + extract(day from c.scheduled_at)::int) % 4 <> 0 then c.trainer_id end,
         case when c.scheduled_at <= now() or (p.i + extract(day from c.scheduled_at)::int) % 4 <> 0 then 'trainer' end,
         case when c.scheduled_at <= now() or (p.i + extract(day from c.scheduled_at)::int) % 4 <> 0 then c.scheduled_at - interval '47 hours' end
    from classes c
    join _lab_people p on p.kind in ('premium', 'monthly', 'quarter')
   where c.gym_id = v_gym and c.id::text like '5eed0007-%'
     and (p.i * 7 + extract(doy from c.scheduled_at)::int) % 5 = 0
     and c.scheduled_at < now() + interval '7 days'
  on conflict (id) do nothing;

  -- ── 1-on-1: the test coach trains six members ──────────────────────────────
  insert into pt_sessions (id, gym_id, trainer_id, member_id, starts_at, duration_minutes, status, notes,
                           requested_at, approved_at, decided_by, decided_by_role, decided_at)
  select format(id_of, '0009', lpad((p.i * 100 + w + 20)::text, 12, '0'))::uuid, v_gym, v_coach, p.id,
         ((v_today + w * 7 + (p.i % 5)) + make_time(8 + p.i % 3, 0, 0)) at time zone 'Asia/Manila', 60,
         (case when w = 2 and p.i % 2 = 1 then 'pending' else 'approved' end)::booking_status,
         case when w < 0 then 'Session ' || (w + 9) || ': squat depth, then conditioning.' end,
         now() + make_interval(days => w * 7 - 3),
         case when not (w = 2 and p.i % 2 = 1) then now() + make_interval(days => w * 7 - 2) end,
         case when not (w = 2 and p.i % 2 = 1) then v_coach end,
         case when not (w = 2 and p.i % 2 = 1) then 'trainer' end,
         case when not (w = 2 and p.i % 2 = 1) then now() + make_interval(days => w * 7 - 2) end
    from _lab_people p cross join generate_series(-8, 2) w
   where p.i in (1, 2, 3, 5, 8, 13)
  on conflict (id) do nothing;
  insert into coachings (id, gym_id, member_id, trainer_id, kind, months, status, fee_mode, starts_on, ends_on, started_by)
  select format(id_of, '0010', lpad(p.i::text, 12, '0'))::uuid, v_gym, p.id, v_coach, 'pt', 3, 'active', 'included',
         v_today - 50, v_today + 41, 'desk'
    from _lab_people p where p.i in (1, 2, 3, 5, 8, 13)
  on conflict (id) do nothing;
  insert into coachings (id, gym_id, member_id, trainer_id, kind, months, status, fee_mode, starts_on, ends_on, started_by)
  values ('cf1ab000-0000-4000-8000-0000000000c1', v_gym, v_member, v_coach, 'pt', 6, 'active', 'included',
          v_today - 60, v_today + 122, 'member')
  on conflict (id) do nothing;

  -- ── Events, challenges, rewards, a program, the equipment, walk-ins ────────
  insert into events (id, gym_id, title, description, starts_at, duration_minutes, location, capacity, cancelled,
                      created_by, what_to_bring, who_is_it_for, fee, is_featured)
  select format(id_of, '0011', lpad(x.n::text, 12, '0'))::uuid, v_gym, x.title, x.descr,
         ((v_today + x.d) + time '07:00') at time zone 'Asia/Manila', x.mins, x.loc, x.cap, false, v_owner,
         x.bring, 'Everyone', x.fee, x.n = 1
    from (values (1, 'Saturday Beach Run',   'A 5 km run along the Mamburao shore, then breakfast.', 5, 90, 'Mamburao Beach', 40, 'Water and running shoes', 0),
                 (2, 'Deadlift Clinic',      'Form first: hinge, brace, pull. Coaches on every platform.', 12, 120, 'Gym floor', 12, 'Flat shoes', 150),
                 (3, 'Lab Open House',       'Bring a friend; every class is free for the day.', 26, 480, 'Whole gym', 80, 'A friend', 0),
                 (4, 'Holiday Bootcamp',     'An hour of partner circuits.', -20, 60, 'Studio', 24, 'A towel', 0),
                 (5, 'Mobility Workshop',    'Hips, ankles and shoulders.', -45, 90, 'Studio', 16, 'A mat', 100))
         as x(n, title, descr, d, mins, loc, cap, bring, fee)
  on conflict (id) do nothing;

  insert into challenges (id, gym_id, title, description, metric_key, target, starts_on, ends_on, reward_points, is_active)
  select format(id_of, '0012', lpad(x.n::text, 12, '0'))::uuid, v_gym, x.title, x.descr,
         x.metric, x.target,
         v_today + x.s, v_today + x.e, x.pts, true
    from (values (1, 'Train Twelve',      'Train twelve days in a month.', 'training_days', 12, -11, 19, 150),
                 (2, 'Class Act',         'Eight group classes in three weeks.', 'classes_attended', 8, 5, 26, 100),
                 (3, 'Check In Sixteen',  'Sixteen check-ins at the desk.', 'verified_days', 16, -42, -12, 200)) as x(n, title, descr, metric, target, s, e, pts)
  on conflict (id) do nothing;

  insert into rewards (id, gym_id, name, description, cost_points, stock, is_active, category, featured)
  select format(id_of, '0013', lpad(x.n::text, 12, '0'))::uuid, v_gym, x.name, x.descr, x.cost, x.stock, true, x.cat, x.n = 1
    from (values (1, 'Free protein shake', 'One shake from the counter.', 150, 30, 'Drinks'),
                 (2, 'Lab shirt', 'Dri-fit, in your size.', 800, 12, 'Gear'),
                 (3, 'One free day pass for a friend', 'Bring someone along for a day.', 400, null, 'Passes'),
                 (4, 'Locker for a month', 'Your own locker, 30 days.', 1200, 5, 'Perks')) as x(n, name, descr, cost, stock, cat)
  on conflict (id) do nothing;

  insert into gym_workouts (id, gym_id, name, level, published, hidden, created_by)
  values ('5eed0050-0000-4000-8000-000000000001', v_gym, 'Full body A', 'beginner', true, false, v_owner),
         ('5eed0050-0000-4000-8000-000000000002', v_gym, 'Full body B', 'beginner', true, false, v_owner)
  on conflict (id) do nothing;
  insert into gym_programs (id, gym_id, name, level, weeks, premium, published, hidden, created_by)
  values ('5eed0051-0000-4000-8000-000000000001', v_gym, 'Starter Strength', 'beginner', 4, false, true, false, v_owner),
         ('5eed0051-0000-4000-8000-000000000002', v_gym, 'Lab Power Block', 'intermediate', 6, true, true, false, v_coach)
  on conflict (id) do nothing;
  insert into gym_program_days (id, gym_id, program_id, week, day, workout_id)
  select format(id_of, '0052', lpad((w * 10 + d)::text, 12, '0'))::uuid, v_gym, '5eed0051-0000-4000-8000-000000000001', w, d,
         case when d % 2 = 1 then '5eed0050-0000-4000-8000-000000000001'::uuid else '5eed0050-0000-4000-8000-000000000002'::uuid end
    from generate_series(1, 4) w cross join generate_series(1, 3) d
  on conflict (id) do nothing;

  insert into gym_equipment (id, gym_id, name, category, quantity, location_note, status, sort_order)
  select format(id_of, '0014', lpad(x.n::text, 12, '0'))::uuid, v_gym, x.name, x.cat, x.qty, x.loc, x.st, x.n
    from (values (1, 'Treadmill', 'cardio', 4, 'By the windows', 'available'),
                 (2, 'Spin bike', 'cardio', 12, 'Studio', 'available'),
                 (3, 'Rowing machine', 'cardio', 2, 'By the windows', 'repair'),
                 (4, 'Leg press', 'machines', 1, 'Back wall', 'available'),
                 (5, 'Cable crossover', 'machines', 1, 'Centre', 'available'),
                 (6, 'Dumbbells 2.5–40 kg', 'free_weights', 1, 'Mirror wall', 'available'),
                 (7, 'Olympic barbell', 'free_weights', 6, 'Platforms', 'available'),
                 (8, 'Squat rack', 'benches_racks', 3, 'Platforms', 'available'),
                 (9, 'Adjustable bench', 'benches_racks', 6, 'Mirror wall', 'available'),
                 (10, 'Battle ropes', 'functional', 2, 'Mat area', 'available'),
                 (11, 'Hip thrust machine', 'machines', 1, 'Back wall', 'soon')) as x(n, name, cat, qty, loc, st)
  on conflict (id) do nothing;

  insert into guests (id, gym_id, name, phone, visits_left)
  values ('5eed0015-0000-4000-8000-000000000001', v_gym, 'Rico Abad', '+63 917 555 0101', 0),
         ('5eed0015-0000-4000-8000-000000000002', v_gym, 'Lyn Soriano', '+63 917 555 0102', 3),
         ('5eed0015-0000-4000-8000-000000000003', v_gym, 'Jules Tan', null, 0)
  on conflict (id) do nothing;
  insert into guest_visits (id, gym_id, guest_id, visited_at, visit_day, kind, amount, method, recorded_by)
  values ('5eed0016-0000-4000-8000-000000000001', v_gym, '5eed0015-0000-4000-8000-000000000001', now() - interval '2 days', v_today - 2, 'day', 150, 'cash', v_desk),
         ('5eed0016-0000-4000-8000-000000000002', v_gym, '5eed0015-0000-4000-8000-000000000001', now() - interval '1 hour', v_today, 'day', 150, 'cash', v_desk),
         ('5eed0016-0000-4000-8000-000000000003', v_gym, '5eed0015-0000-4000-8000-000000000002', now() - interval '6 days', v_today - 6, 'pack5', 650, 'cash', v_desk),
         ('5eed0016-0000-4000-8000-000000000004', v_gym, '5eed0015-0000-4000-8000-000000000002', now() - interval '3 days', v_today - 3, 'pack_visit', 0, 'cash', v_desk),
         ('5eed0016-0000-4000-8000-000000000005', v_gym, '5eed0015-0000-4000-8000-000000000003', now() - interval '9 days', v_today - 9, 'day', 150, 'cash', v_desk)
  on conflict (id) do nothing;

  -- Welcome notes for the people who sign in.
  insert into notifications (id, gym_id, user_id, type, title, message, action_url, created_at)
  values ('cf1ab000-0000-4000-8000-0000000000e1', v_gym, v_owner, 'system', 'Your test gym is ready',
          'Core Fitness Lab is filled with made-up members, coaches and history. Remove demo data on the platform takes it all out.', '/', now()),
         ('cf1ab000-0000-4000-8000-0000000000e2', v_gym, v_coach, 'system', 'Welcome, coach',
          'Six trainees, two classes a week and a few requests are waiting for you.', '/trainer/home', now())
  on conflict (id) do nothing;

  alter table profiles         enable trigger user;
  alter table gym_roles        enable trigger user;
  alter table member_profiles  enable trigger user;
  alter table trainer_profiles enable trigger user;
  alter table memberships      enable trigger user;
  alter table payments         enable trigger user;
  alter table attendance       enable trigger user;
  alter table trainer_availability enable trigger user;
  alter table class_templates  enable trigger user;
  alter table classes          enable trigger user;
  alter table bookings         enable trigger user;
  alter table pt_sessions      enable trigger user;
  alter table coachings        enable trigger user;
  alter table events           enable trigger user;
  alter table challenges       enable trigger user;
  alter table rewards          enable trigger user;
  alter table gym_workouts     enable trigger user;
  alter table gym_programs     enable trigger user;
  alter table gym_program_days enable trigger user;
  alter table gym_equipment    enable trigger user;
  alter table guests           enable trigger user;
  alter table guest_visits     enable trigger user;
  alter table notifications    enable trigger user;

  select count(*) into v_n from gym_roles where gym_id = v_gym and role = 'member';
  raise notice 'Fresh start part 2: Core Fitness Lab has % members, % classes and % check-ins. Sign-ins are in the result below.',
    v_n, (select count(*) from classes where gym_id = v_gym), (select count(*) from attendance where gym_id = v_gym);
end
$lab$;

-- Your four sign-ins. Copy them now: the passwords are not stored anywhere you can read them back.
select role, email, password, app from _lab_logins order by email;
