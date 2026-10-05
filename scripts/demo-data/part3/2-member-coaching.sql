-- Demo data part 3 — BLOCK 2 of 3 — the member's coaching
--
-- After block 1. Re-runnable. Expect a NOTICE starting "Part 3 block 2:".
--
-- A demo coach (part 2's) trains the member: 1-on-1 sessions every five weeks
-- for two years, a note and a next step after each, a rating, their room with
-- posts and a check-in turned in and returned, a private chat, and the classes
-- they booked — past ones attended, two coming up. They also follow one of the
-- gym's programs. Every row has a demo id (5eed3___-…) for Remove demo data.
do $seed$
declare
  v_email  text := 'lealorenzanaa@gmail.com';
  v_gym    uuid;
  v_me     uuid;
  v_coach  uuid;
  v_owner  uuid;
  v_room   uuid;
  v_conv   uuid;
  v_prog   uuid;
  v_today  date := (now() at time zone 'Asia/Manila')::date;
  id_of constant text := '5eed3%s-0000-4000-8000-%s';
begin
  select id into v_gym from gyms where name = 'G Fitness' order by created_at limit 1;
  select id into v_me from auth.users where lower(email) = lower(v_email);
  if v_gym is null or v_me is null
     or not exists (select 1 from member_profiles where profile_id = v_me and gym_id = v_gym) then
    raise notice 'Part 3 block 2: no G Fitness member %. Nothing added.', v_email;
    return;
  end if;
  select user_id into v_owner from gym_roles where gym_id = v_gym and role = 'admin' and status = 'active' order by user_id limit 1;
  -- A demo coach first, so Remove demo data takes the whole relationship with it.
  select r.user_id into v_coach from gym_roles r
   where r.gym_id = v_gym and r.role = 'trainer' and r.status = 'active'
   order by (r.user_id::text like '5eed%') desc, r.user_id limit 1;
  if v_coach is null then
    raise notice 'Part 3 block 2: G Fitness has no coach yet — run part 2 first. Nothing added.';
    return;
  end if;

  alter table bookings          disable trigger user;
  alter table pt_sessions       disable trigger user;
  alter table trainer_feedback  disable trigger user;
  alter table trainer_ratings   disable trigger user;
  alter table rooms             disable trigger user;
  alter table room_members      disable trigger user;
  alter table room_posts        disable trigger user;
  alter table room_assignments  disable trigger user;
  alter table room_submissions  disable trigger user;
  alter table conversations     disable trigger user;
  alter table messages          disable trigger user;
  alter table program_enrolments disable trigger user;
  alter table workout_logs      disable trigger user;

  -- ── Classes: the last 40 that happened, attended; two coming up ────────────────
  insert into bookings (id, gym_id, member_id, class_id, status, requested_at, approved_at, decided_by)
  select format(id_of, '121', lpad(row_number() over (order by c.scheduled_at)::text, 12, '0'))::uuid, v_gym, v_me, c.id,
         'approved', c.scheduled_at - interval '2 days', c.scheduled_at - interval '2 days' + interval '1 hour', coalesce(c.trainer_id, v_owner)
    from (select * from classes where gym_id = v_gym and scheduled_at < now() - interval '1 day'
           order by scheduled_at desc limit 40) c
   where not exists (select 1 from bookings b where b.member_id = v_me and b.class_id = c.id)
  on conflict do nothing;
  insert into bookings (id, gym_id, member_id, class_id, status, requested_at, approved_at, decided_by)
  select format(id_of, '121', lpad((900 + row_number() over (order by c.scheduled_at))::text, 12, '0'))::uuid, v_gym, v_me, c.id,
         'approved', now() - interval '1 day', now() - interval '20 hours', coalesce(c.trainer_id, v_owner)
    from (select * from classes where gym_id = v_gym and scheduled_at > now() order by scheduled_at limit 2) c
   where not exists (select 1 from bookings b where b.member_id = v_me and b.class_id = c.id)
  on conflict do nothing;

  -- ── 1-on-1 sessions every five weeks, and one next week ──────────────────────
  insert into pt_sessions (id, gym_id, trainer_id, member_id, starts_at, duration_minutes, status, notes, requested_at,
                           approved_at, approved_by, decided_by, decided_by_role, decided_at, created_at)
  select format(id_of, '123', lpad(i::text, 12, '0'))::uuid, v_gym, v_coach, v_me,
         ((v_today - 6 - 35 * i) + time '07:00') at time zone 'Asia/Manila', 60, 'approved',
         (array['Strength check-in', 'Form review — squat and deadlift', 'New block: progressive overload', 'Mobility and recovery'])[1 + i % 4],
         ((v_today - 9 - 35 * i) + time '20:00') at time zone 'Asia/Manila',
         ((v_today - 8 - 35 * i) + time '08:00') at time zone 'Asia/Manila', v_coach, v_coach, 'trainer',
         ((v_today - 8 - 35 * i) + time '08:00') at time zone 'Asia/Manila',
         ((v_today - 9 - 35 * i) + time '20:00') at time zone 'Asia/Manila'
    from generate_series(0, 18) i
  on conflict do nothing;
  insert into pt_sessions (id, gym_id, trainer_id, member_id, starts_at, duration_minutes, status, notes, requested_at,
                           approved_at, approved_by, decided_by, decided_by_role, decided_at, created_at)
  values (format(id_of, '123', '000000000099')::uuid, v_gym, v_coach, v_me, ((v_today + 4) + time '07:00') at time zone 'Asia/Manila', 60,
          'approved', 'Test day: new squat max', now() - interval '1 day', now() - interval '20 hours', v_coach, v_coach, 'trainer',
          now() - interval '20 hours', now() - interval '1 day')
  on conflict do nothing;

  -- A note and a next step after every session; the older ones done.
  insert into trainer_feedback (id, gym_id, trainer_id, member_id, note, recommendation, pt_session_id, created_at, updated_at, seen_at, done_at)
  select format(id_of, '124', lpad(i::text, 12, '0'))::uuid, v_gym, v_coach, v_me,
         (array['Squat depth is consistent now — hips and knees track well.',
                'Bench press bar path improved. Keep the shoulder blades pinned.',
                'Deadlift lockout is strong; the first pull off the floor is the weak point.',
                'Great energy today. Conditioning has clearly gone up since last block.',
                'Rows are cleaner. Slow the lowering phase to three seconds.'])[1 + i % 5],
         (array['Add a pause squat on leg day: 3 sets of 5.',
                'Two sets of face pulls at the end of push day.',
                'Romanian deadlifts 3x8 before the main deadlift.',
                'Keep three sessions a week — consistency is paying off.',
                'Ten minutes of hip mobility before every session.'])[1 + i % 5],
         format(id_of, '123', lpad(i::text, 12, '0'))::uuid,
         ((v_today - 6 - 35 * i) + time '08:15') at time zone 'Asia/Manila', ((v_today - 6 - 35 * i) + time '08:15') at time zone 'Asia/Manila',
         ((v_today - 6 - 35 * i) + time '12:00') at time zone 'Asia/Manila',
         case when i > 0 then ((v_today - 2 - 35 * i) + time '18:00') at time zone 'Asia/Manila' end
    from generate_series(0, 18) i
  on conflict do nothing;

  insert into trainer_ratings (gym_id, member_id, trainer_id, stars, comment, created_at, updated_at, period)
  values (v_gym, v_me, v_coach, 5, 'Patient, explains every cue, and the programme actually works.', now() - interval '20 days', now() - interval '20 days',
          date_trunc('month', v_today - 20)::date)
  on conflict do nothing;

  -- ── Their room with the coach: posts, a check-in turned in and returned ───────
  select id into v_room from rooms where gym_id = v_gym and kind = 'pt' and trainer_id = v_coach and member_id = v_me;
  if v_room is null then
    v_room := format(id_of, '126', '000000000001')::uuid;
    insert into rooms (id, gym_id, kind, trainer_id, member_id, name, description, comments_on, created_at)
    values (v_room, v_gym, 'pt', v_coach, v_me, '1-on-1 coaching', 'Your sessions, your plan and your check-ins.', true, (v_today - 650) at time zone 'Asia/Manila')
    on conflict do nothing;
  end if;
  insert into room_members (gym_id, room_id, member_id, joined_at) values (v_gym, v_room, v_me, (v_today - 650) at time zone 'Asia/Manila')
  on conflict do nothing;
  insert into room_posts (id, gym_id, room_id, author_id, body, created_at)
  select format(id_of, '127', lpad(x.n::text, 12, '0'))::uuid, v_gym, v_room, v_coach, x.body, ((v_today - x.ago) + time '07:30') at time zone 'Asia/Manila'
    from (values (1, 120, 'New block starts Monday: four weeks of heavier triples on squat. Sleep well this week.'),
                 (2, 60, 'Deload week. Same exercises, half the sets. Your joints will thank you.'),
                 (3, 21, 'Video of your last squat is in the chat — compare it with the one from March.'),
                 (4, 3, 'Test day next week. Eat well and arrive 15 minutes early to warm up.')) x(n, ago, body)
  on conflict do nothing;
  insert into room_assignments (id, gym_id, room_id, kind, checkin_type, title, instructions, due_on, created_by, created_at)
  values (format(id_of, '128', '000000000001')::uuid, v_gym, v_room, 'checkin', 'question', 'How did this week''s sessions feel?',
          'One line on energy, sleep and anything that hurt.', v_today - 10, v_coach, (v_today - 14) at time zone 'Asia/Manila')
  on conflict do nothing;
  insert into room_submissions (id, gym_id, assignment_id, member_id, turned_in_at, answer_text, returned_at, return_comment, points_awarded)
  values (format(id_of, '129', '000000000001')::uuid, v_gym, format(id_of, '128', '000000000001')::uuid, v_me,
          (v_today - 11) at time zone 'Asia/Manila', 'Energy good, slept 7 hours most nights. Left knee a bit stiff after lunges.',
          (v_today - 10) at time zone 'Asia/Manila', 'Thanks — swap lunges for step-ups this week and we will check the knee on Friday.', 0)
  on conflict do nothing;

  -- ── A private chat with the coach ──────────────────────────────────────────────
  insert into conversations (id, gym_id, member_id, trainer_id, created_at, last_message_at, member_read_at, trainer_read_at)
  values (format(id_of, '130', '000000000001')::uuid, v_gym, v_me, v_coach, now() - interval '40 days', now() - interval '1 day',
          now() - interval '1 day', now() - interval '1 day')
  on conflict do nothing;
  select id into v_conv from conversations where gym_id = v_gym and member_id = v_me and trainer_id = v_coach;
  insert into messages (id, gym_id, conversation_id, sender_id, body, created_at)
  select format(id_of, '131', lpad(x.n::text, 12, '0'))::uuid, v_gym, v_conv, case when x.coach then v_coach else v_me end, x.body,
         now() - x.ago * interval '1 hour'
    from (values (1, false, 960, 'Coach, can I move Friday''s session to Saturday morning?'),
                 (2, true, 955, 'Saturday 7am works. See you then!'),
                 (3, false, 500, 'Hit 60 kg on squat today for 5 reps!'),
                 (4, true, 498, 'That is a 10 kg jump since the start of the block. Proud of you.'),
                 (5, false, 72, 'My left knee feels stiff after lunges. Should I skip them?'),
                 (6, true, 70, 'Swap them for step-ups this week and tell me how it feels.'),
                 (7, true, 26, 'Test day is next week. Light session Wednesday, rest Thursday.'),
                 (8, false, 24, 'Got it, thank you!')) x(n, coach, ago, body)
  on conflict do nothing;

  -- ── One of the gym's programs, two days in ─────────────────────────────────────
  select p.id into v_prog from gym_programs p
   where p.gym_id = v_gym and p.published and not p.premium and not coalesce(p.hidden, false)
     and exists (select 1 from gym_program_days d where d.program_id = p.id)
   order by p.created_at limit 1;
  if v_prog is not null and not exists (select 1 from program_enrolments where member_id = v_me and status = 'active') then
    insert into program_enrolments (id, gym_id, program_id, member_id, status, started_at, assigned_by)
    values (format(id_of, '132', '000000000001')::uuid, v_gym, v_prog, v_me, 'active', now() - interval '6 days', v_coach)
    on conflict do nothing;
    insert into workout_logs (id, gym_id, member_id, performed_on, activity, duration_minutes, gym_workout_id, program_day_id, completed_at, created_at)
    select format(id_of, '133', lpad(row_number() over (order by d.week, d.day)::text, 12, '0'))::uuid, v_gym, v_me,
           v_today - 6 + 2 * (row_number() over (order by d.week, d.day))::int, 'Program day', 50, d.workout_id, d.id,
           ((v_today - 6 + 2 * (row_number() over (order by d.week, d.day))::int) + time '19:00') at time zone 'Asia/Manila',
           ((v_today - 6 + 2 * (row_number() over (order by d.week, d.day))::int) + time '18:10') at time zone 'Asia/Manila'
      from (select * from gym_program_days where program_id = v_prog order by week, day limit 2) d
    on conflict do nothing;
  end if;

  alter table bookings          enable trigger user;
  alter table pt_sessions       enable trigger user;
  alter table trainer_feedback  enable trigger user;
  alter table trainer_ratings   enable trigger user;
  alter table rooms             enable trigger user;
  alter table room_members      enable trigger user;
  alter table room_posts        enable trigger user;
  alter table room_assignments  enable trigger user;
  alter table room_submissions  enable trigger user;
  alter table conversations     enable trigger user;
  alter table messages          enable trigger user;
  alter table program_enrolments enable trigger user;
  alter table workout_logs      enable trigger user;

  raise notice 'Part 3 block 2: % bookings, % coaching sessions, % coach notes, a room, a chat% for %.',
    (select count(*) from bookings where member_id = v_me), (select count(*) from pt_sessions where member_id = v_me),
    (select count(*) from trainer_feedback where member_id = v_me), case when v_prog is null then '' else ' and a program' end, v_email;
end
$seed$;
