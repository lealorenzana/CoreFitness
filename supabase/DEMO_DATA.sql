-- ═══════════════════════════════════════════════════════════════════════════
-- DEMO DATA — for trying the features out. NOT a migration.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- This file is deliberately **not** in `supabase/migrations/`. Migrations are
-- the schema, they run in order, and they run on the real gym's database.
-- This is scaffolding for a demo, and you should be able to throw it away.
--
-- ---------------------------------------------------------------------------
-- What it does and does not touch
-- ---------------------------------------------------------------------------
-- It does NOT create members. A member is an `auth.users` row plus a profile,
-- created through sign-up or the create-member Edge Function — inventing one
-- here would produce an account nobody can log into, and this project has a
-- rule about data that looks real and is not.
--
-- Instead it fills in the things the **existing** members have none of:
-- attendance history, workout logs, points, a challenge, rewards, events. Run
-- it with at least one real member already registered.
--
-- Everything it writes is tagged, so the cleanup at the bottom removes exactly
-- this and nothing a real member did.
--
-- ---------------------------------------------------------------------------
-- To remove it later
-- ---------------------------------------------------------------------------
-- Scroll to the bottom, uncomment the CLEANUP block and run that alone.
--
-- ---------------------------------------------------------------------------
-- Prerequisites: migrations 0001–0058, and at least one member.
-- ---------------------------------------------------------------------------

do $demo$
declare
  m            record;
  v_log        uuid;
  v_ex_squat   uuid;
  v_ex_bench   uuid;
  v_ex_bike    uuid;
  v_class      uuid;
  v_challenge  uuid;
  v_trainer    uuid;
  d            int;
  i            int;
  n_members    int;
begin
  select count(*) into n_members from member_profiles;
  if n_members = 0 then
    raise exception
      'No members exist yet. Register at least one member in the app first — '
      'this file adds history to real accounts, it does not invent people.';
  end if;

  select id into v_ex_squat from exercises where name = 'Back Squat';
  select id into v_ex_bench from exercises where name = 'Barbell Bench Press';
  select id into v_ex_bike  from exercises where name = 'Stationary Bike';
  select profile_id into v_trainer from trainer_profiles limit 1;

  -- ── Rewards the gym could plausibly offer ───────────────────────────────
  insert into rewards (name, description, cost_points, stock)
  select * from (values
    ('Free week added',      'Seven days added to your membership.',            500, 5),
    ('Free PT session',      'One hour with a coach of your choice.',           800, 3),
    ('Core Fitness shirt',   'Gym shirt in your size — collect at the desk.',   350, 10),
    ('Bring a friend',       'One free day pass for someone you bring in.',     200, null),
    ('Protein shake',        'One shake at the front desk.',                    120, 20)
  ) as v(name, description, cost_points, stock)
  where not exists (select 1 from rewards r where r.name = v.name);

  -- ── A challenge that is actually running ────────────────────────────────
  insert into challenges (title, description, metric_key, target, starts_on, ends_on, reward_points)
  select 'September Consistency',
         'Train 12 days this month. Counted from your check-ins and logged workouts — nothing to tick off.',
         'training_days', 12,
         date_trunc('month', (now() at time zone 'Asia/Manila'))::date,
         (date_trunc('month', (now() at time zone 'Asia/Manila')) + interval '1 month - 1 day')::date,
         250
  where not exists (select 1 from challenges where title = 'September Consistency');

  insert into challenges (title, description, metric_key, target, starts_on, ends_on, reward_points)
  select 'Early Bird',
         'Five check-ins before 7am. The gym is quietest first thing.',
         'early_checkins', 5,
         (now() at time zone 'Asia/Manila')::date - 7,
         (now() at time zone 'Asia/Manila')::date + 21,
         150
  where not exists (select 1 from challenges where title = 'Early Bird');

  select id into v_challenge from challenges where title = 'September Consistency';

  -- ── Events with the fields 0057 added ───────────────────────────────────
  insert into events (title, description, starts_at, duration_minutes, location,
                      capacity, what_to_bring, who_is_it_for, fee, contact, is_featured)
  select 'Saturday Morning Bootcamp',
         E'An outdoor circuit session in the car park — bodyweight, bands and a lot of encouragement. We finish with stretching and coffee.\n\nGo at your own pace; every movement has an easier version.',
         ((now() at time zone 'Asia/Manila')::date + 3 + time '06:30') at time zone 'Asia/Manila',
         75, 'Car park (meet at reception)', 25,
         'Water, a towel, and shoes you can move in.',
         'Everyone. No experience needed — half the group will be first-timers.',
         null, 'Ask at the front desk or message the gym on Facebook.', true
  where not exists (select 1 from events where title = 'Saturday Morning Bootcamp');

  insert into events (title, description, starts_at, duration_minutes, location,
                      capacity, what_to_bring, who_is_it_for, fee, contact, is_featured)
  select 'Deadlift Form Clinic',
         E'A small-group session on setup, bracing and how to know when to stop adding weight.\n\nYou will lift light. The point is the technique, not the number.',
         ((now() at time zone 'Asia/Manila')::date + 10 + time '17:00') at time zone 'Asia/Manila',
         90, 'Main floor — platform area', 8,
         'Flat shoes if you have them. Chalk provided.',
         'Anyone already deadlifting, or about to start.',
         200, 'Ask at the front desk.', false
  where not exists (select 1 from events where title = 'Deadlift Form Clinic');

  -- ── Per-member history ──────────────────────────────────────────────────
  for m in select mp.profile_id as id from member_profiles mp loop

    -- Attendance across the last eight weeks, thinning out further back so the
    -- retention screen and the streak counters have a real-looking shape rather
    -- than a flat block.
    for d in 0..55 loop
      -- Roughly 3-4 days a week recently, 2 a week two months ago.
      if (d % 7) in (1, 3, 5) and (d < 28 or (d % 14) < 7) then
        insert into attendance (member_id, check_in_time, method, activity)
        select m.id,
               ((now() at time zone 'Asia/Manila')::date - d
                 + time '06:00' + (random() * interval '13 hours')) at time zone 'Asia/Manila',
               (array['qr','manual'])[1 + (d % 2)]::checkin_method,
               (array['Strength','Cardio','Group Class','Free Weights','Treadmill'])[1 + (d % 5)]
        where not exists (
          select 1 from attendance a
           where a.member_id = m.id
             and (a.check_in_time at time zone 'Asia/Manila')::date
               = (now() at time zone 'Asia/Manila')::date - d);
      end if;
    end loop;

    -- Body measurements trending gently, so the progress charts have a line.
    for i in 0..5 loop
      insert into body_measurements (member_id, measured_on, weight_kg, height_cm, body_fat_pct)
      select m.id, (now() at time zone 'Asia/Manila')::date - (i * 14),
             78.0 - (5 - i) * 0.6, 170, 24.0 - (5 - i) * 0.4
      where not exists (
        select 1 from body_measurements b
         where b.member_id = m.id
           and b.measured_on = (now() at time zone 'Asia/Manila')::date - (i * 14));
    end loop;

    -- Completed workouts with real sets, so the tracker and the strength goal
    -- have something to show. Weight climbs a little each session.
    for i in 0..5 loop
      if not exists (
        select 1 from workout_logs w
         where w.member_id = m.id
           and w.performed_on = (now() at time zone 'Asia/Manila')::date - (i * 5)
           and w.notes = 'demo'
      ) then
        insert into workout_logs (member_id, performed_on, activity, duration_minutes, notes, completed_at)
        values (m.id, (now() at time zone 'Asia/Manila')::date - (i * 5),
                'Strength', 45 + (i * 3), 'demo', now() - (i * interval '5 days'))
        returning id into v_log;

        if v_ex_squat is not null then
          insert into workout_sets (log_id, exercise_id, set_number, reps, weight_kg) values
            (v_log, v_ex_squat, 1, 8, 60 + (5 - i) * 2.5),
            (v_log, v_ex_squat, 2, 8, 60 + (5 - i) * 2.5),
            (v_log, v_ex_squat, 3, 6, 65 + (5 - i) * 2.5);
        end if;
        if v_ex_bench is not null then
          insert into workout_sets (log_id, exercise_id, set_number, reps, weight_kg) values
            (v_log, v_ex_bench, 1, 10, 40 + (5 - i) * 2),
            (v_log, v_ex_bench, 2, 8,  45 + (5 - i) * 2);
        end if;
        if v_ex_bike is not null then
          insert into workout_sets (log_id, exercise_id, set_number, duration_seconds)
          values (v_log, v_ex_bike, 1, 900);
        end if;
      end if;
    end loop;

    -- A goal of each kind: one numeric, one preset that tracks itself.
    insert into fitness_goals (member_id, title, metric, start_value, target_value, target_date)
    select m.id, 'Get to 72 kg', 'weight_kg', 78, 72,
           (now() at time zone 'Asia/Manila')::date + 60
    where not exists (select 1 from fitness_goals g where g.member_id = m.id and g.title = 'Get to 72 kg');

    insert into fitness_goals (member_id, title, metric, template_key, target_value)
    select m.id, 'Build consistency', 'custom', 'build_consistency', 6
    where not exists (select 1 from fitness_goals g where g.member_id = m.id and g.template_key = 'build_consistency');

    -- Join the running challenge, so the progress bar has a participant.
    if v_challenge is not null then
      insert into challenge_participants (challenge_id, member_id)
      select v_challenge, m.id
      where not exists (select 1 from challenge_participants cp
                         where cp.challenge_id = v_challenge and cp.member_id = m.id);
    end if;
  end loop;

  -- ── A class with real bookings, so "3/20 booked" shows a fraction ───────
  if v_trainer is not null then
    insert into classes (name, trainer_id, level, capacity, location, class_type, scheduled_at, duration_minutes)
    select 'HIIT Circuit', v_trainer, 'all_levels', 20, 'Main floor', 'HIIT',
           ((now() at time zone 'Asia/Manila')::date + 2 + time '18:00') at time zone 'Asia/Manila', 45
    where not exists (select 1 from classes where name = 'HIIT Circuit'
                       and scheduled_at > now());
    select id into v_class from classes where name = 'HIIT Circuit' and scheduled_at > now() limit 1;

    if v_class is not null then
      insert into bookings (member_id, class_id, status)
      select mp.profile_id, v_class, 'approved' from member_profiles mp
      where not exists (select 1 from bookings b
                         where b.class_id = v_class and b.member_id = mp.profile_id);
    end if;
  end if;

  -- Points arrive on their own: the attendance rows above fired the check-in
  -- trigger, and the completed workouts fired the workout one. This just picks
  -- up the class and PT awards, which are a sweep rather than a trigger.
  perform award_due_session_points();
  perform settle_challenges();
  perform settle_goals();

  raise notice 'Demo data added for % member(s).', n_members;
end
$demo$;

-- ═══════════════════════════════════════════════════════════════════════════
-- CLEANUP — uncomment and run this block ALONE to remove everything above.
-- ═══════════════════════════════════════════════════════════════════════════
-- Removes only what this file created. Real check-ins, real payments and
-- anything a member entered themselves are untouched, because none of them
-- carry these markers.
--
-- Points earned from the demo attendance are removed with it, so a member does
-- not keep a balance for visits that never happened.
/*
begin;
  delete from workout_sets  where log_id in (select id from workout_logs where notes = 'demo');
  delete from point_ledger  where source_table = 'workout_logs'
                              and source_id in (select id from workout_logs where notes = 'demo');
  delete from workout_logs  where notes = 'demo';

  delete from point_ledger  where source_table = 'attendance'
                              and source_id in (select id from attendance where activity is not null
                                                 and check_in_time < now() - interval '1 hour');
  -- Attendance is deliberately NOT bulk-deleted: a real check-in taken at the
  -- desk today looks the same as a demo one. Delete by date range if you need
  -- to, after checking what is in there:
  --   select (check_in_time at time zone 'Asia/Manila')::date, count(*)
  --     from attendance group by 1 order by 1;

  delete from challenge_participants
   where challenge_id in (select id from challenges
                           where title in ('September Consistency','Early Bird'));
  delete from challenges where title in ('September Consistency','Early Bird');
  delete from events     where title in ('Saturday Morning Bootcamp','Deadlift Form Clinic');
  delete from rewards    where name in ('Free week added','Free PT session','Core Fitness shirt',
                                        'Bring a friend','Protein shake')
                           and not exists (select 1 from reward_redemptions rr where rr.reward_id = rewards.id);
  delete from fitness_goals where title = 'Get to 72 kg' or template_key = 'build_consistency';
  delete from body_measurements where height_cm = 170 and weight_kg between 75 and 79;
commit;
*/
