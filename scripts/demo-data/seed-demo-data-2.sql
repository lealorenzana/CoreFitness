-- Demo data, part 2 — the rest of the sidebar. Run AFTER seed-demo-data.sql.
--
-- **To run it, paste the four files in part2/ one at a time, in order 1 → 4.**
-- Handed over whole, it did not land on the live project, and whether it failed
-- in the editor or was never run is not known. The editor has broken on long
-- pastes before, and a batch that fails anywhere rolls every block back. The
-- part2/ files are generated from this one, verbatim.
-- Each block is atomic and re-runnable. Remove everything, both parts, with
-- remove-demo-data.sql.
--
-- ## Every section skips itself if its page already has data
--
-- "Enough" means enough to paginate: a section adds nothing if its table
-- already holds a page's worth of real rows, and says so in a NOTICE. That is
-- why these are NOT touched, because the migrations filled them:
--
--   Exercises (~36), Resources (~5), Achievement definitions (~34), Plans.
--
-- ## What it adds, and what a real member can see of it
--
--   Trainers       12 coaches, with specialisations and bios.
--                  ► Members SEE them in the trainer list, but they have **no
--                    open hours**, so nobody can book one. Flip
--                    v_hide_coaches below to true to keep them out of the phone
--                    app entirely (they become 'suspended'; the admin still
--                    lists them).
--   Credentials    2–3 per coach; verified, pending and rejected. There is no
--                  file behind them — "View" says the file was not found.
--   Schedule       10 class templates, **retired**. The Schedule lists them;
--                  the generator ignores retired templates, so nothing
--                  bookable is ever made from them. Reactivating one makes it a
--                  real class members can book — don't, or remove afterwards.
--                  The 72 past demo classes get a coach each.
--   PT sessions    ~180, all in the past, demo coaches with demo members.
--   Ratings        monthly evaluations and written feedback on those sessions.
--   Pending        6 registrations awaiting approval.
--   Events         14, **all in the past**. ► Members SEE them in the events
--                  list as "Completed". The member app lists every event and
--                  cannot be told otherwise.
--   Announcements  12 sent, each only to demo members. Real members never
--                  receive them; the admin's history shows them.
--   Challenges     8, **all ended** — members only see challenges still running.
--   Rewards        12, **inactive** — members only see active rewards, and an
--                  inactive one cannot be redeemed. Plus ~70 redemptions.
--   Achievements   unlocks for demo members against the existing badges.
--   Activity log   ~600 entries describing the demo rows, in the gym's voice.
--
-- ## Why the triggers are off while it runs
--
-- As in part 1. Specifically here: trainer feedback **notifies the member**,
-- an achievement unlock **notifies the member**, a redemption is **refused**
-- without the points to cover it, and every write lands in the audit log. Off
-- inside each block's transaction only; no other session ever sees them off.
--
-- Every row's id matches `5eed____-0000-4000-8000-…`; demo people have
-- `…@seed.corefitness-test.com` emails; demo audit entries carry
-- `detail = {"seed": true}`.

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

-- ============================================================================
-- BLOCK 3 of 4 — events, announcements, challenges, rewards, achievements
-- ============================================================================
do $seed$
declare
  v_today    date := (now() at time zone 'Asia/Manila')::date;
  v_members  uuid[];
  v_metrics  text[];
  v_n int;
begin
  select array_agg(p.id order by p.id) into v_members
    from profiles p
   where p.id::text like '5eed0001-0000-4000-8000-%' and p.status = 'active';
  if v_members is null then
    raise notice 'Block 3: run seed-demo-data.sql first — there are no demo members to attach this to.';
    return;
  end if;

  alter table events                 disable trigger user;
  alter table event_registrations    disable trigger user;
  alter table notifications          disable trigger user;
  alter table challenges             disable trigger user;
  alter table challenge_participants disable trigger user;
  alter table rewards                disable trigger user;
  alter table reward_redemptions     disable trigger user;
  alter table achievement_unlocks    disable trigger user;

  -- ── Events: all in the past ──────────────────────────────────────────────
  select count(*) into v_n from events where id::text not like '5eed____-0000-4000-8000-%';
  if v_n >= 13 then
    raise notice 'Events: % already. None added.', v_n;
  else
    insert into events (id, title, description, starts_at, duration_minutes, location, capacity,
                        cancelled, created_by, created_at, what_to_bring, who_is_it_for, fee,
                        contact, is_featured)
    select ('5eed0010-0000-4000-8000-' || lpad(e.n::text, 12, '0'))::uuid,
           e.title, e.descr,
           (((v_today - e.ago) + e.hhmm::time) at time zone 'Asia/Manila'),
           e.mins, e.loc, e.cap, e.n = 9, null,
           (((v_today - e.ago - 14) + time '10:00') at time zone 'Asia/Manila'),
           e.bring, e.who, e.fee, 'Front desk', e.n in (1, 6)
      from (values
        (1,  'Summer Fitness Challenge Kickoff', 'Eight weeks, four check-ins, and a shirt for everyone who finishes.', 170, '08:00', 180, 'Main Floor', 60, 'Towel and water', 'Everyone', null::numeric),
        (2,  'Nutrition Talk with a Registered Dietitian', 'Practical eating around training, for people who cook at home.', 155, '18:00', 90, 'Studio B', 30, 'Notebook', 'All members', 150),
        (3,  'Beginner Barbell Clinic', 'Squat, bench and deadlift basics with a coach at every rack.', 140, '09:00', 120, 'Main Floor', 16, 'Flat-soled shoes', 'New lifters', null),
        (4,  'Fun Run along the Mamburao Baywalk', '5 km at your own pace. Water stations every kilometre.', 126, '05:30', 120, 'Mamburao Baywalk', 80, 'Running shoes, cap', 'Everyone, family welcome', 200),
        (5,  'Zumba Marathon for Typhoon Relief', 'Three hours of Zumba. Every peso goes to the relief drive.', 112, '16:00', 180, 'Studio B', 50, 'Water, extra shirt', 'Everyone', 100),
        (6,  'Boxing Open Sparring Night', 'Light, controlled sparring. Headgear and gloves provided.', 98, '19:00', 120, 'Studio B', 20, 'Mouthguard', 'Members with 3+ months of boxing', null),
        (7,  'Mobility & Recovery Workshop', 'Foam rolling, stretching and how to recover between sessions.', 84, '10:00', 90, 'Studio A', 25, 'Yoga mat', 'All levels', null),
        (8,  'Deadlift Day — Form Check', 'Bring your deadlift. Leave with a safer one.', 70, '09:00', 150, 'Main Floor', 20, 'Lifting belt if you have one', 'Anyone who deadlifts', null),
        (9,  'Couples Workout Night', 'Partner drills and games. Postponed — see the desk for the new date.', 56, '18:30', 90, 'Studio B', 30, 'Your partner', 'Couples and friends', 150),
        (10, 'Senior Wellness Morning', 'Gentle strength and balance, then merienda.', 49, '07:00', 120, 'Studio A', 25, 'Comfortable clothes', 'Members 55 and over', null),
        (11, 'Anniversary Open Gym', 'Free entry for a friend all day, with raffle prizes at 5pm.', 35, '06:00', 900, 'Whole gym', 150, 'A friend', 'Members and guests', null),
        (12, 'Sunrise Yoga by the Sea', 'Vinyasa on the beach as the sun comes up.', 28, '05:30', 75, 'Tayamaan Beach', 30, 'Mat and towel', 'All levels', 100),
        (13, 'Calisthenics Skills Day', 'Handstands, muscle-ups and progressions for both.', 14, '15:00', 120, 'Main Floor', 18, 'Chalk', 'Intermediate and above', null),
        (14, 'Rainy Season Bootcamp', 'Indoor bootcamp while the rain keeps us off the field.', 7, '17:30', 60, 'Main Floor', 40, 'Towel', 'Everyone', null)
      ) as e(n, title, descr, ago, hhmm, mins, loc, cap, bring, who, fee)
    on conflict (id) do nothing;

    -- Capped at each event's capacity: the 16-seat clinic gets 16, not 29.
    insert into event_registrations (id, event_id, member_id, registered_at)
    select ('5eed0011-0000-4000-8000-' || lpad((right(r.event_id::text, 12)::int * 1000 + r.i)::text, 12, '0'))::uuid,
           r.event_id, v_members[r.i], r.starts_at - make_interval(days => 1 + (r.i % 10))
      from (
        select e.id as event_id, e.starts_at, e.capacity, m.i,
               row_number() over (partition by e.id order by m.i) as seat
          from events e
          cross join generate_series(1, cardinality(v_members)) as m(i)
         where e.id::text like '5eed0010-0000-4000-8000-%'
           and (hashtext('reg' || e.id || m.i)::bigint + 2147483648) % 100 < 22
      ) r
     where r.seat <= r.capacity
    on conflict do nothing;
  end if;

  -- ── Announcements: sent only to demo members ─────────────────────────────
  -- The admin's history groups by title, message and minute over the latest
  -- 500 notification rows. ~250 rows dated over four months keeps the gym's
  -- own recent announcements inside that window.
  select count(*) into v_n from notifications where id::text like '5eed0012-0000-4000-8000-%';
  if v_n > 0 then
    raise notice 'Announcements: demo ones already present. None added.';
  else
    insert into notifications (id, user_id, type, title, message, action_url, metadata, read, created_at)
    select ('5eed0012-0000-4000-8000-' || lpad((a.n * 1000 + r.i)::text, 12, '0'))::uuid,
           v_members[r.i],
           a.kind, a.title, a.body, null, null,
           (hashtext('read' || a.n || r.i)::bigint + 2147483648) % 100 < 62,
           (((v_today - a.ago) + a.hhmm::time) at time zone 'Asia/Manila')
      from (values
        (1,  'info',   'New rowing machines on the main floor', 'Two new rowers arrived today. Ask a coach for a quick how-to before your first go.', 118, '09:00'),
        (2,  'system', 'Aircon maintenance Saturday morning', 'Studio B aircon is being serviced 6–9am on Saturday. Classes move to Studio A.', 104, '17:00'),
        (3,  'event',  'Fun Run registration is open', 'Sign up at the desk for the 5 km baywalk run. Water and a finisher''s shirt included.', 92, '10:30'),
        (4,  'system', 'Typhoon advisory — gym closed tomorrow', 'Signal No. 2 is up for Occidental Mindoro. We are closed tomorrow. Stay safe.', 81, '15:45'),
        (5,  'info',   'Please re-rack your weights', 'Plates and dumbbells back where they belong, so the next person can find them.', 73, '08:15'),
        (6,  'info',   'Membership prices stay the same next year', 'No price change for any plan in the coming year. Thank you for training with us.', 66, '12:00'),
        (7,  'event',  'Zumba marathon this Sunday', 'Three hours for the typhoon relief drive. Every peso goes to the families affected.', 58, '18:20'),
        (8,  'info',   'Lost and found clean-out on Friday', 'Unclaimed items go to donation on Friday. Check the box by the desk.', 44, '11:10'),
        (9,  'info',   'Water refilling station is fixed', 'The station by the lockers is working again. Bring a bottle.', 33, '07:40'),
        (10, 'system', 'Extended hours on Sundays', 'From this week we close at 8pm on Sundays instead of 6pm.', 24, '16:30'),
        (11, 'info',   'Welcome our new coaches', 'Say hello to the new coaches this month — their profiles are in the app.', 15, '09:30'),
        (12, 'event',  'Calisthenics skills day', 'Handstand and muscle-up progressions this Saturday. Limited slots.', 8, '14:00')
      ) as a(n, kind, title, body, ago, hhmm)
      cross join generate_series(1, cardinality(v_members)) as r(i)
     where (hashtext('ann' || a.n || r.i)::bigint + 2147483648) % 100 < 15
    on conflict (id) do nothing;
  end if;

  -- ── Challenges: all ended ────────────────────────────────────────────────
  select array_agg(key order by sort_order, key) into v_metrics
    from achievement_metrics where audience = 'member' and challengeable;
  if v_metrics is null then
    select array_agg(key order by sort_order, key) into v_metrics
      from achievement_metrics where audience = 'member';
  end if;

  select count(*) into v_n from challenges where id::text not like '5eed____-0000-4000-8000-%';
  if v_n >= 6 then
    raise notice 'Challenges: % already. None added.', v_n;
  elsif v_metrics is null then
    raise notice 'Challenges: no member metrics to measure against. None added.';
  else
    insert into challenges (id, title, description, metric_key, target, starts_on, ends_on,
                            reward_points, is_active, created_at)
    select ('5eed0013-0000-4000-8000-' || lpad(c.n::text, 12, '0'))::uuid,
           c.title, c.descr,
           coalesce((select k from unnest(v_metrics) k where k = c.metric limit 1),
                    v_metrics[1 + (c.n % cardinality(v_metrics))]),
           c.target, v_today - c.ago - c.len, v_today - c.ago, c.pts, true,
           (((v_today - c.ago - c.len - 5) + time '09:00') at time zone 'Asia/Manila')
      from (values
        (1, '30-Day Habit Builder',    'Train on 16 different days in a month.',           'training_days',    16, 150, 30, 200),
        (2, 'Early Bird Month',        'Check in before 8am, ten times.',                  'early_checkins',   10, 120, 30, 150),
        (3, 'Weekend Warrior',         'Show up on six weekend days.',                     'weekend_days',      6, 100, 28, 120),
        (4, 'Class Explorer',          'Attend eight group classes.',                      'classes_attended',  8,  85, 30, 150),
        (5, 'Fiesta Fit Week',         'Five training days in fiesta week.',               'training_days',     5,  64,  7, 100),
        (6, 'Try Everything',          'Log four different kinds of training.',            'distinct_activities', 4, 50, 21, 120),
        (7, 'Rainy Season Grind',      'Keep a three-week streak through the rain.',       'best_week_streak',  3,  30, 21, 180),
        (8, 'Back-to-School Burn',     'Twelve training days before classes start.',       'training_days',    12,  10, 21, 150)
      ) as c(n, title, descr, metric, target, ago, len, pts)
    on conflict (id) do nothing;

    insert into challenge_participants (challenge_id, member_id, joined_at, completed_on)
    select ch.id, v_members[m.i],
           ((ch.starts_on + (m.i % 3)) + time '10:00') at time zone 'Asia/Manila',
           case when (hashtext('done' || ch.id || m.i)::bigint + 2147483648) % 100 < 38
                then ch.ends_on - (m.i % 4) end
      from challenges ch
      cross join generate_series(1, cardinality(v_members)) as m(i)
     where ch.id::text like '5eed0013-0000-4000-8000-%'
       and (hashtext('join' || ch.id || m.i)::bigint + 2147483648) % 100 < 30
    on conflict do nothing;
  end if;

  -- ── Rewards: inactive, so members can neither see nor redeem them ────────
  select count(*) into v_n from rewards where id::text not like '5eed____-0000-4000-8000-%';
  if v_n >= 9 then
    raise notice 'Rewards: % already. None added.', v_n;
  else
    insert into rewards (id, name, description, cost_points, stock, is_active, created_at)
    select ('5eed0014-0000-4000-8000-' || lpad(w.n::text, 12, '0'))::uuid,
           w.name, w.descr, w.cost, w.stock, false,
           now() - make_interval(days => 150 - w.n * 6)
      from (values
        (1,  'Core Fitness shaker bottle', 'Leak-proof, 600 ml. Collect at the desk.',          200, 25),
        (2,  'Gym towel',                  'Microfibre, with the gym logo.',                     250, 30),
        (3,  'Guest pass for a friend',    'One free day for someone who has never trained here.', 300, null),
        (4,  'Protein bar',                'Any flavour from the desk fridge.',                  120, 40),
        (5,  'Resistance band set',        'Three bands, light to heavy.',                       450, 12),
        (6,  'Free 30-minute PT session',  'With any coach, booked through the desk.',           900, null),
        (7,  'Dri-fit shirt',              'Core Fitness training shirt, S to XL.',              800, 20),
        (8,  'Locker for a month',         'A reserved locker for thirty days.',                 600, 8),
        (9,  'Wrist wraps',                'For pressing days.',                                 500, 10),
        (10, 'Jump rope',                  'Adjustable speed rope.',                             350, 15),
        (11, 'Refill card — 10 bottles',   'Ten refills at the water station.',                  100, null),
        (12, 'Lifting chalk block',        'For the deadlift platform only.',                    150, 30)
      ) as w(n, name, descr, cost, stock)
    on conflict (id) do nothing;

    insert into reward_redemptions (id, member_id, reward_id, cost_points, status, requested_at,
                                    decided_by, decided_at, decision_note)
    select ('5eed0015-0000-4000-8000-' || lpad(x.k::text, 12, '0'))::uuid,
           v_members[1 + (x.h % cardinality(v_members))::int], x.reward_id, x.cost, x.status,
           x.asked, null,
           case when x.status <> 'pending' then x.asked + make_interval(days => 1 + (x.h % 3)::int) end,
           case when x.status = 'rejected'
                then (array['Out of stock this month — ask again next month.',
                            'Points were refunded after a duplicate request.'])[1 + (x.h % 2)::int] end
      from (
        select g.k, w.id as reward_id, w.cost_points as cost,
               (hashtext('rd' || g.k)::bigint + 2147483648) as h,
               case when (hashtext('rs' || g.k)::bigint + 2147483648) % 100 < 45 then 'fulfilled'
                    when (hashtext('rs' || g.k)::bigint + 2147483648) % 100 < 65 then 'approved'
                    when (hashtext('rs' || g.k)::bigint + 2147483648) % 100 < 80 then 'rejected'
                    else 'pending' end as status,
               now() - make_interval(days => (g.k * 1.3)::int % 90, hours => g.k % 11) as asked
          from generate_series(1, 70) as g(k)
          join rewards w on w.id = ('5eed0014-0000-4000-8000-'
                                    || lpad((1 + (g.k * 5) % 12)::text, 12, '0'))::uuid
      ) x
    on conflict (id) do nothing;
  end if;

  -- ── Achievement unlocks, against the badges the gym already has ──────────
  insert into achievement_unlocks (id, user_id, achievement_key, unlocked_on, seen, created_at)
  select ('5eed0016-0000-4000-8000-' || lpad((m.i * 100 + a.rn)::text, 12, '0'))::uuid,
         v_members[m.i], a.key,
         least(v_today,
               greatest((pr.created_at at time zone 'Asia/Manila')::date + 3,
                        v_today - ((hashtext('ul' || m.i || a.key)::bigint + 2147483648) % 150)::int)),
         true,
         now() - make_interval(days => ((hashtext('ul' || m.i || a.key)::bigint + 2147483648) % 150)::int)
    from generate_series(1, cardinality(v_members)) as m(i)
    join profiles pr on pr.id = v_members[m.i]
    cross join (
      select key, row_number() over (order by sort_order, key) as rn
        from achievements where active and audience = 'member'
    ) a
   where (hashtext('has' || m.i || a.key)::bigint + 2147483648) % 100 < 14
  on conflict do nothing;

  alter table events                 enable trigger user;
  alter table event_registrations    enable trigger user;
  alter table notifications          enable trigger user;
  alter table challenges             enable trigger user;
  alter table challenge_participants enable trigger user;
  alter table rewards                enable trigger user;
  alter table reward_redemptions     enable trigger user;
  alter table achievement_unlocks    enable trigger user;

  raise notice 'Block 3: % events, % announcement rows, % challenges, % rewards, % redemptions, % unlocks.',
    (select count(*) from events              where id::text like '5eed0010-0000-4000-8000-%'),
    (select count(*) from notifications       where id::text like '5eed0012-0000-4000-8000-%'),
    (select count(*) from challenges          where id::text like '5eed0013-0000-4000-8000-%'),
    (select count(*) from rewards             where id::text like '5eed0014-0000-4000-8000-%'),
    (select count(*) from reward_redemptions  where id::text like '5eed0015-0000-4000-8000-%'),
    (select count(*) from achievement_unlocks where id::text like '5eed0016-0000-4000-8000-%');
end
$seed$;

-- ============================================================================
-- BLOCK 4 of 4 — the activity log, describing the demo rows
-- ============================================================================
-- Written from the rows the other blocks made, so every entry points at
-- something real in the demo data. The actor is "Front Desk", a coach, or the
-- system — never the gym's actual admin, who did none of this.
do $seed$
declare
  v_real int;
  v_n    int;
begin
  select count(*) into v_real from activity_log where coalesce(detail->>'seed', '') <> 'true';
  if v_real >= 41 then
    raise notice 'Activity log: % real entries already, so it already pages. None added.', v_real;
    return;
  end if;
  select count(*) into v_n from activity_log where detail->>'seed' = 'true';
  if v_n > 0 then
    raise notice 'Activity log: demo entries already present. None added.';
    return;
  end if;

  insert into activity_log (occurred_at, actor_id, actor_role, actor_label, action, subject_type,
                            subject_id, member_id, summary, detail)
  -- Payments taken at the desk
  select p.created_at, null::uuid, 'staff', 'Front Desk', 'payment.recorded', 'payment', p.id, p.member_id,
         'Recorded ₱' || to_char(p.amount, 'FM999,999') || ' cash from ' || pr.first_name || ' ' || pr.last_name
           || case when p.status = 'pending' then ' (pending)' else '' end,
         '{"seed": true}'::jsonb
    from payments p join profiles pr on pr.id = p.member_id
   where p.id::text like '5eed0003-0000-4000-8000-%' and p.created_at > now() - interval '60 days'
  union all
  -- Check-ins, last week
  select a.check_in_time, null::uuid, 'staff', 'Front Desk', 'checkin.recorded', 'attendance', a.id, a.member_id,
         'Checked in ' || pr.first_name || ' ' || pr.last_name || ' (' || upper(a.method::text) || ')',
         '{"seed": true}'::jsonb
    from attendance a join profiles pr on pr.id = a.member_id
   where a.id::text like '5eed0004-0000-4000-8000-%' and a.check_in_time > now() - interval '7 days'
  union all
  -- Class bookings decided, last three weeks
  select coalesce(b.decided_at, b.requested_at + interval '2 hours'), null::uuid,
         case when b.status = 'rejected' then 'system' else 'staff' end,
         case when b.status = 'rejected' then null else 'Front Desk' end,
         'booking.' || case b.status when 'approved' then 'approved' when 'rejected' then 'rejected' else 'cancelled' end,
         'booking', b.id, b.member_id,
         case b.status
           when 'approved' then 'Approved ' || pr.first_name || ' ' || pr.last_name || ' for ' || c.name
           when 'rejected' then pr.first_name || ' ' || pr.last_name || '''s request for ' || c.name || ' expired unanswered'
           else pr.first_name || ' ' || pr.last_name || ' cancelled ' || c.name
         end,
         '{"seed": true}'::jsonb
    from bookings b join classes c on c.id = b.class_id join profiles pr on pr.id = b.member_id
   where b.id::text like '5eed0006-0000-4000-8000-%' and c.scheduled_at > now() - interval '21 days'
  union all
  -- PT sessions accepted by their coach, last three weeks
  select s.decided_at, null::uuid, 'trainer', co.first_name || ' ' || co.last_name, 'pt.approved', 'pt_session',
         s.id, s.member_id,
         co.first_name || ' accepted a session with ' || pr.first_name || ' ' || pr.last_name,
         '{"seed": true}'::jsonb
    from pt_sessions s join profiles pr on pr.id = s.member_id join profiles co on co.id = s.trainer_id
   where s.id::text like '5eed000e-0000-4000-8000-%' and s.status = 'approved'
     and s.starts_at > now() - interval '21 days'
  union all
  -- Suspensions and archives, with the reason on the record
  select e.created_at, null::uuid, 'admin', 'Admin',
         case e.status when 'suspended' then 'member.suspended' else 'member.archived' end,
         'member', e.profile_id, e.profile_id,
         case e.status when 'suspended' then 'Suspended ' else 'Archived ' end
           || pr.first_name || ' ' || pr.last_name || ' — ' || e.reason,
         '{"seed": true}'::jsonb
    from account_status_events e join profiles pr on pr.id = e.profile_id
   where e.id::text like '5eed0008-0000-4000-8000-%'
  union all
  -- New sign-ups in the last month
  select pr.created_at, null::uuid, null::text, null::text, 'member.registered', 'member', pr.id, pr.id,
         pr.first_name || ' ' || pr.last_name || ' registered',
         '{"seed": true}'::jsonb
    from profiles pr
   where pr.id::text like '5eed000_-0000-4000-8000-%' and pr.role = 'member'
     and pr.created_at > now() - interval '30 days';

  select count(*) into v_n from activity_log where detail->>'seed' = 'true';
  raise notice 'Block 4: % activity-log entries.', v_n;
end
$seed$;
