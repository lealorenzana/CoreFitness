-- Demo data part 2 — BLOCK 3 of 4 — events, announcements, challenges, rewards, achievements
--
-- Paste ONE file at a time into the Supabase SQL Editor and run it, in
-- order 1 → 4. Split from seed-demo-data-2.sql, which explains every
-- choice made here: the editor has broken on a long paste before.
-- Re-runnable. Expect a NOTICE starting "Block 3:".

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
