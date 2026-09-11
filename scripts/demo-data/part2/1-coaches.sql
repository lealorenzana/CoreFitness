-- Demo data part 2 — BLOCK 1 of 4 — coaches, credentials, retired templates, pending sign-ups
--
-- Paste ONE file at a time into the Supabase SQL Editor and run it, in
-- order 1 → 4. Split from seed-demo-data-2.sql, which explains every
-- choice made here: the editor has broken on a long paste before.
-- Re-runnable. Expect a NOTICE starting "Block 1:".

-- ============================================================================
-- BLOCK 1 of 4 — coaches, credentials, retired templates, pending sign-ups
-- ============================================================================
do $seed$
declare
  -- ── The one switch ───────────────────────────────────────────────────────
  -- false  coaches are 'active': listed in the admin, and in members' trainer
  --        list with no open hours (not bookable).
  -- true   coaches are 'suspended': the admin still lists them (its Trainers
  --        page hides only archived); the phone app shows active trainers only.
  v_hide_coaches boolean := false;

  v_today   date := (now() at time zone 'Asia/Manila')::date;
  v_real    int;
  v_pending int;
  v_premium uuid;
  v_trial   uuid;
  v_col     text;
  v_n       int;
begin
  alter table profiles              disable trigger user;
  alter table member_profiles       disable trigger user;
  alter table trainer_profiles      disable trigger user;
  alter table trainer_credentials   disable trigger user;
  alter table class_templates       disable trigger user;
  alter table classes               disable trigger user;
  alter table pending_registrations disable trigger user;

  select count(*) into v_real from profiles
   where role = 'trainer' and status <> 'archived'
     and id::text not like '5eed____-0000-4000-8000-%';

  if v_real >= 13 then
    raise notice 'Trainers: % already. No demo coaches, credentials, templates or PT added.', v_real;
  else
    drop table if exists _seed_coaches;
    create temp table _seed_coaches as
    select c.n,
           ('5eed0009-0000-4000-8000-' || lpad(c.n::text, 12, '0'))::uuid as id,
           c.first_name, c.last_name, c.spec, c.focus, c.certs, c.years, c.bio, c.proud,
           now() - make_interval(days => 90 + c.n * 53) as joined
      from (values
        (1, 'Marco', 'Villareal', 'Strength & Conditioning',
            array['strength','hypertrophy','beginners'], array['NASM Certified Personal Trainer','NSCA Certified Strength and Conditioning Specialist'], 8,
            'Former varsity athlete. Builds strength programmes that fit around a working week.',
            'Took 30+ members to their first bodyweight pull-up.'),
        (2, 'Tessa', 'Buenaventura', 'Yoga & Mobility',
            array['yoga','mobility','flexibility'], array['RYT-200 Yoga Alliance','ACE Group Fitness Instructor'], 6,
            'Teaches hatha and vinyasa, and the mobility work lifters keep skipping.',
            'Runs the sunrise yoga series every fiesta week.'),
        (3, 'Rico', 'Magbanua', 'Boxing & Muay Thai',
            array['boxing','conditioning','self-defense'], array['Philippine Boxing Coaching Level 1','ACE Certified Personal Trainer'], 10,
            'Ten years in the ring as a coach. Pad work, footwork and conditioning.',
            'Cornered three local amateur champions.'),
        (4, 'Jen', 'Lacsamana', 'HIIT & Fat Loss',
            array['hiit','fat loss','endurance'], array['ACE Certified Personal Trainer','Precision Nutrition Level 1'], 5,
            'Short, hard sessions for people with no time. Keeps it fun so you come back.',
            'Designed the gym''s 30-day Habit Builder.'),
        (5, 'Dante', 'Evangelista', 'Powerlifting',
            array['powerlifting','strength','technique'], array['USA Powerlifting Club Coach','NASM Certified Personal Trainer'], 12,
            'Squat, bench, deadlift — coached safely, one cue at a time.',
            'Regional powerlifting referee since 2019.'),
        (6, 'Kaye', 'Dimaculangan', 'Functional Training',
            array['functional','core','mobility'], array['TESDA Fitness Coaching NC II','ACE Group Fitness Instructor'], 4,
            'Training for daily life: carrying, lifting, getting up off the floor.',
            'Leads the Saturday functional circuit.'),
        (7, 'Paolo', 'Sarmiento', 'Sports Performance',
            array['speed','agility','athletes'], array['NSCA Certified Strength and Conditioning Specialist','Philippine Red Cross Sports First Aid'], 7,
            'Works with student athletes on speed, power and staying injury-free.',
            'Prepared the provincial volleyball squad for Palarong Pambansa.'),
        (8, 'Liza', 'Macaraeg', 'Pilates & Core',
            array['pilates','core','posture'], array['Balanced Body Mat Pilates','ACE Group Fitness Instructor'], 9,
            'Mat Pilates for posture, back pain and a core that actually works.',
            'Nine years teaching mat Pilates in Mindoro.'),
        (9, 'Nestor', 'Caballero', 'Senior Fitness',
            array['seniors','balance','low impact'], array['ACE Senior Fitness Specialist','Philippine Red Cross Standard First Aid & BLS'], 15,
            'Low-impact strength and balance work for members 55 and over.',
            'Started the gym''s senior wellness mornings.'),
        (10, 'Mika', 'Alcantara', 'Zumba & Dance Fitness',
            array['dance','cardio','groups'], array['Licensed Zumba Instructor','ACE Group Fitness Instructor'], 6,
            'High-energy dance cardio. No experience, no rhythm required.',
            'Hosted the Zumba marathon for the typhoon relief drive.'),
        (11, 'JR', 'Ilagan', 'Calisthenics',
            array['bodyweight','calisthenics','skills'], array['Calisthenics Coaching Certificate','TESDA Fitness Coaching NC II'], 5,
            'Bodyweight skills — push-ups to muscle-ups, progressions for every level.',
            'Built the outdoor bar park programme.'),
        (12, 'Bianca', 'Soriano', 'Rehab & Injury Prevention',
            array['rehab','injury prevention','mobility'], array['Registered Physical Therapist (PRC)','NASM Corrective Exercise Specialist'], 11,
            'Physical therapist. Helps members return to training after an injury.',
            'Runs the back-pain clinic on Tuesday evenings.')
      ) as c(n, first_name, last_name, spec, focus, certs, years, bio, proud);

    insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                            email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                            created_at, updated_at)
    select c.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
           'coach.' || lower(c.first_name) || '.' || lower(c.last_name) || '.' || c.n
             || '@seed.corefitness-test.com',
           '', c.joined, '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
           c.joined, c.joined
      from _seed_coaches c
    on conflict (id) do nothing;

    insert into profiles (id, role, first_name, last_name, email, phone, status, created_at)
    select c.id, 'trainer', c.first_name, c.last_name, u.email,
           '+639' || lpad(((hashtext('cph' || c.n)::bigint + 2147483648) % 1000000000)::text, 9, '0'),
           case when v_hide_coaches then 'suspended' else 'active' end,
           c.joined
      from _seed_coaches c join auth.users u on u.id = c.id
    on conflict (id) do nothing;

    insert into trainer_profiles (profile_id, specialization, bio, availability,
                                  years_experience, certifications, focus_areas, achievements)
    select c.id, c.spec, c.bio, null, c.years, c.certs, c.focus, c.proud
      from _seed_coaches c
    on conflict (profile_id) do nothing;

    -- Two or three documents each. Rejected ones say why, as a real review would.
    insert into trainer_credentials (id, trainer_id, title, file_path, mime_type, size_bytes,
                                     status, uploaded_at, reviewed_by, reviewed_at, review_note)
    select ('5eed000a-0000-4000-8000-' || lpad((c.n * 10 + d.j)::text, 12, '0'))::uuid,
           c.id, d.title,
           'seed-demo/' || c.id || '/' || d.j || '.pdf',
           'application/pdf',
           180000 + ((hashtext('size' || c.n || d.j)::bigint + 2147483648) % 700000)::int,
           d.status,
           now() - make_interval(days => 40 + c.n * 9 + d.j * 3),
           null,
           case when d.status <> 'pending' then now() - make_interval(days => 38 + c.n * 9 + d.j * 3) end,
           case when d.status = 'rejected'
                then 'The scan is too blurry to read the certificate number. Please upload a clearer copy.' end
      from _seed_coaches c
      cross join lateral (values
        (1, c.certs[1], 'verified'),
        (2, 'Philippine Red Cross Standard First Aid & BLS',
            case when c.n % 3 = 0 then 'pending' else 'verified' end),
        (3, c.certs[2], case when c.n % 4 = 1 then 'rejected' else 'verified' end)
      ) as d(j, title, status)
     where d.j <= 2 + (c.n % 2)
    on conflict (id) do nothing;

    -- Retired templates. Listed in the Schedule; never generated into a class.
    insert into class_templates (id, name, trainer_id, level, capacity, location,
                                 day_of_week, start_time, duration_minutes, active, created_at)
    select ('5eed000b-0000-4000-8000-' || lpad(t.n::text, 12, '0'))::uuid,
           t.name, c.id, t.level::class_level, t.cap, t.loc, t.dow, t.hhmm::time, 60, false,
           now() - make_interval(days => 60 + t.n * 11)
      from (values
        (1,  'Sunrise Yoga',             2, 'all_levels',   16, 'Studio A',   1, '06:00'),
        (2,  'Barbell Basics',           1, 'beginner',     10, 'Main Floor', 2, '17:30'),
        (3,  'Boxing Pad Work',          3, 'intermediate', 12, 'Studio B',   3, '19:00'),
        (4,  'Lunch Break HIIT',         4, 'all_levels',   20, 'Studio B',   4, '12:15'),
        (5,  'Deadlift Clinic',          5, 'intermediate',  8, 'Main Floor', 6, '09:00'),
        (6,  'Saturday Functional',      6, 'all_levels',   18, 'Main Floor', 6, '07:30'),
        (7,  'Mat Pilates',              8, 'beginner',     14, 'Studio A',   2, '18:30'),
        (8,  'Senior Strength & Balance',9, 'beginner',     12, 'Studio A',   3, '08:00'),
        (9,  'Zumba Night',             10, 'all_levels',   30, 'Studio B',   5, '18:00'),
        (10, 'Bar Skills Workshop',     11, 'advanced',     10, 'Main Floor', 0, '16:00')
      ) as t(n, name, coach, level, cap, loc, dow, hhmm)
      join _seed_coaches c on c.n = t.coach
    on conflict (id) do nothing;

    -- The 72 past demo classes had no coach. Give each the one who teaches it.
    update classes cl set trainer_id = c.id
      from _seed_coaches c
     where cl.id::text like '5eed0005-0000-4000-8000-%'
       and cl.trainer_id is null
       and c.n = case cl.name
                   when 'Morning Yoga'        then 2
                   when 'Strength Basics'     then case when right(cl.id::text, 12)::int % 2 = 0 then 1 else 5 end
                   when 'HIIT Circuit'        then 4
                   when 'Boxing Fundamentals' then 3
                   when 'Mobility Flow'       then case when right(cl.id::text, 12)::int % 2 = 0 then 6 else 12 end
                   else 10
                 end;

    drop table _seed_coaches;
  end if;

  -- ── Six registrations waiting for approval ───────────────────────────────
  select count(*) into v_pending from pending_registrations
   where id::text not like '5eed____-0000-4000-8000-%';
  select id into v_premium from membership_plans where name = 'Premium' limit 1;
  select id into v_trial   from membership_plans where name = 'Free Trial' limit 1;

  if v_pending >= 3 then
    raise notice 'Pending registrations: % already. None added.', v_pending;
  else
    drop table if exists _seed_pending;
    create temp table _seed_pending as
    select p.n,
           ('5eed000c-0000-4000-8000-' || lpad(p.n::text, 12, '0'))::uuid as id,
           p.first_name, p.last_name, p.gender, p.brgy,
           now() - make_interval(days => p.n - 1, hours => 3 + p.n) as asked
      from (values
        (1, 'Janine',  'Palomar',   'female', 'Payompon'),
        (2, 'Renz',    'Abella',    'male',   'San Luis'),
        (3, 'Shaira',  'Montemayor','female', 'Tayamaan'),
        (4, 'Gilbert', 'Quizon',    'male',   'Poblacion 2'),
        (5, 'Ella',    'Samonte',   'female', 'Fatima'),
        (6, 'Vince',   'Cortez',    'male',   'Balansay')
      ) as p(n, first_name, last_name, gender, brgy);

    insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                            email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                            created_at, updated_at)
    select p.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
           lower(p.first_name) || '.' || lower(p.last_name) || '.new' || p.n || '@seed.corefitness-test.com',
           '', p.asked, '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, p.asked, p.asked
      from _seed_pending p
    on conflict (id) do nothing;

    insert into profiles (id, role, first_name, last_name, email, phone, status, created_at)
    select p.id, 'member', p.first_name, p.last_name, u.email,
           '+639' || lpad(((hashtext('pph' || p.n)::bigint + 2147483648) % 1000000000)::text, 9, '0'),
           'pending_approval', p.asked
      from _seed_pending p join auth.users u on u.id = p.id
    on conflict (id) do nothing;

    insert into member_profiles (profile_id, qr_code, address, gender, created_at)
    select p.id, p.id::text, 'Brgy. ' || p.brgy || ', Mamburao, Occidental Mindoro', p.gender, p.asked
      from _seed_pending p
    on conflict (profile_id) do nothing;

    insert into pending_registrations (id, first_name, last_name, email, phone, requested_plan_id,
                                       auth_user_id, date_of_birth, gender, address,
                                       emergency_contact_name, emergency_contact_phone, created_at)
    select ('5eed000d-0000-4000-8000-' || lpad(p.n::text, 12, '0'))::uuid,
           pr.first_name, pr.last_name, pr.email, pr.phone,
           case when p.n % 2 = 0 then v_premium else v_trial end,
           p.id,
           v_today - make_interval(years => 19 + p.n * 3)::interval,
           p.gender,
           'Brgy. ' || p.brgy || ', Mamburao, Occidental Mindoro',
           'Parent of ' || pr.first_name,
           '+639' || lpad(((hashtext('pec' || p.n)::bigint + 2147483648) % 1000000000)::text, 9, '0'),
           p.asked
      from _seed_pending p join profiles pr on pr.id = p.id
    on conflict (id) do nothing;

    drop table _seed_pending;
  end if;

  -- GoTrue reads these as non-null strings; see part 1.
  for v_col in
    select column_name from information_schema.columns
     where table_schema = 'auth' and table_name = 'users'
       and column_name in ('confirmation_token', 'recovery_token', 'email_change',
                           'email_change_token_new', 'email_change_token_current',
                           'phone_change', 'phone_change_token', 'reauthentication_token')
  loop
    execute format(
      'update auth.users set %I = '''' where id::text like %L and email like %L and %I is null',
      v_col, '5eed____-0000-4000-8000-%', '%@seed.corefitness-test.com', v_col);
  end loop;

  alter table profiles              enable trigger user;
  alter table member_profiles       enable trigger user;
  alter table trainer_profiles      enable trigger user;
  alter table trainer_credentials   enable trigger user;
  alter table class_templates       enable trigger user;
  alter table classes               enable trigger user;
  alter table pending_registrations enable trigger user;

  select count(*) into v_n from profiles where id::text like '5eed0009-0000-4000-8000-%';
  raise notice 'Block 1: % demo coaches, % pending registrations.', v_n,
    (select count(*) from pending_registrations where id::text like '5eed000d-0000-4000-8000-%');
end
$seed$;
