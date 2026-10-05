-- Demo data part 3 — BLOCK 3 of 3 — the gym's shop, seasons, squads, and the
-- member's place in them
--
-- After blocks 1 and 2. Re-runnable. Expect a NOTICE starting "Part 3 block 3:".
--
-- The shop stocked and selling for three months (some of it to the member),
-- three season tiers with the member's claimed rewards, a squad with demo
-- members, the gym's challenges and events with the member in them, rewards
-- redeemed, streak milestones, and a real-looking notification inbox. Every
-- row has a demo id (5eed3___-…) for Remove demo data.
do $seed$
declare
  v_email  text := 'lealorenzanaa@gmail.com';
  v_gym    uuid;
  v_me     uuid;
  v_owner  uuid;
  v_mates  uuid[];
  v_squad  uuid;
  v_today  date := (now() at time zone 'Asia/Manila')::date;
  id_of constant text := '5eed3%s-0000-4000-8000-%s';
begin
  select id into v_gym from gyms where name = 'G Fitness' order by created_at limit 1;
  select id into v_me from auth.users where lower(email) = lower(v_email);
  if v_gym is null or v_me is null
     or not exists (select 1 from member_profiles where profile_id = v_me and gym_id = v_gym) then
    raise notice 'Part 3 block 3: no G Fitness member %. Nothing added.', v_email;
    return;
  end if;
  select user_id into v_owner from gym_roles where gym_id = v_gym and role = 'admin' and status = 'active' order by user_id limit 1;
  select array_agg(user_id order by user_id) into v_mates from (
    select r.user_id from gym_roles r where r.gym_id = v_gym and r.role = 'member' and r.status = 'active'
       and r.user_id::text like '5eed%' and r.user_id <> v_me order by r.user_id limit 40) m;

  alter table shop_products       disable trigger user;
  alter table shop_sales          disable trigger user;
  alter table shop_sale_items     disable trigger user;
  alter table stock_moves         disable trigger user;
  alter table season_tiers        disable trigger user;
  alter table season_claims       disable trigger user;
  alter table squads              disable trigger user;
  alter table squad_members       disable trigger user;
  alter table squad_weeks         disable trigger user;
  alter table challenge_participants disable trigger user;
  alter table reward_redemptions  disable trigger user;
  alter table event_registrations disable trigger user;
  alter table streak_milestones   disable trigger user;
  alter table notifications       disable trigger user;

  -- ── The shop: ten products, a delivery each, three months of sales ─────────────
  insert into shop_products (id, gym_id, name, category, description, price, track_stock, stock, low_stock_at, shown_in_app, active, created_at, updated_at)
  select format(id_of, '138', lpad(x.n::text, 12, '0'))::uuid, v_gym, x.name, x.cat, x.descr, x.price, true, 0, x.low, true, true,
         (v_today - 120) at time zone 'Asia/Manila', now()
    from (values (1, 'Bottled water 500 ml', 'Drinks', 'Cold, from the counter fridge.', 20, 12),
                 (2, 'Gatorade 500 ml', 'Drinks', 'Blue Bolt and Lemon-Lime.', 45, 8),
                 (3, 'Whey protein shake', 'Supplements', 'One scoop, mixed with cold water or milk.', 75, 6),
                 (4, 'Protein bar', 'Snacks', 'Chocolate peanut, 20 g protein.', 85, 6),
                 (5, 'Banana', 'Snacks', 'From the Mamburao market every morning.', 15, 10),
                 (6, 'Pre-workout single serve', 'Supplements', 'Fruit punch. One sachet.', 60, 5),
                 (7, 'G Fitness towel', 'Gear', 'Microfibre, with the gym logo.', 250, 3),
                 (8, 'Lifting straps', 'Gear', 'Padded cotton straps, one pair.', 350, 2),
                 (9, 'Shaker bottle', 'Gear', '600 ml, leak-proof lid.', 180, 3),
                 (10, 'Day pass', 'Passes', 'One visit for a friend.', 100, 0)) x(n, name, cat, descr, price, low)
   where not exists (select 1 from shop_products p where p.gym_id = v_gym and lower(p.name) = lower(x.name))
  on conflict do nothing;

  insert into stock_moves (id, gym_id, product_id, change, reason, note, moved_by, moved_at)
  select format(id_of, '141', lpad(p.n::text, 12, '0'))::uuid, v_gym, p.id, 200, 'delivery', 'Opening stock', v_owner, (v_today - 120) at time zone 'Asia/Manila'
    from (select id, substr(id::text, 25)::int as n from shop_products where id::text like '5eed3138-%') p
  on conflict do nothing;

  -- ~140 sales: one or two items each; one in five to the member, most to demo members, some walk-ins.
  insert into shop_sales (id, gym_id, sale_day, total, member_id, sold_by, created_at)
  select format(id_of, '139', lpad(s::text, 12, '0'))::uuid, v_gym, v_today - 1 - (s * 83 % 118),
         0, case when s % 5 = 0 then v_me when s % 3 = 0 or v_mates is null then null else v_mates[1 + s % coalesce(array_length(v_mates, 1), 1)] end,
         v_owner, ((v_today - 1 - (s * 83 % 118)) + time '18:00' + (s % 120) * interval '1 minute') at time zone 'Asia/Manila'
    from generate_series(1, 140) s
  on conflict do nothing;
  insert into shop_sale_items (id, gym_id, sale_id, product_id, qty, unit_price)
  select format(id_of, '140', lpad((s * 10 + k)::text, 12, '0'))::uuid, v_gym, format(id_of, '139', lpad(s::text, 12, '0'))::uuid,
         p.id, 1 + (s + k) % 2, p.price
    from generate_series(1, 140) s cross join generate_series(1, 2) k
    join lateral (select id, price from shop_products where id::text like '5eed3138-%'
                  order by id offset ((s * 7 + k * 3) % 9) limit 1) p on true
   where k = 1 or s % 3 = 0
  on conflict do nothing;
  update shop_sales s set total = (select coalesce(sum(i.qty * i.unit_price), 0) from shop_sale_items i where i.sale_id = s.id)
   where s.id::text like '5eed3139-%';
  insert into stock_moves (id, gym_id, product_id, change, reason, sale_id, moved_by, moved_at)
  select ('5eed3241-0000-4000-8000-' || substr(i.id::text, 25))::uuid, v_gym, i.product_id, -i.qty, 'sale', i.sale_id, v_owner, s.created_at
    from shop_sale_items i join shop_sales s on s.id = i.sale_id where i.id::text like '5eed3140-%'
  on conflict do nothing;
  update shop_products p set stock = greatest(0, (select coalesce(sum(m.change), 0) from stock_moves m where m.product_id = p.id))
   where p.id::text like '5eed3138-%';

  -- ── Seasons: three tiers, the member's last three months claimed ─────────────
  insert into season_tiers (id, gym_id, name, points_needed, reward_id, sort_order, created_at)
  select format(id_of, '136', lpad(x.n::text, 12, '0'))::uuid, v_gym, x.name, x.pts,
         (select id from rewards where gym_id = v_gym and is_active order by cost_points offset x.n - 1 limit 1), x.n, (v_today - 200) at time zone 'Asia/Manila'
    from (values (1, 'Bronze', 300), (2, 'Silver', 700), (3, 'Gold', 1200)) x(n, name, pts)
   where not exists (select 1 from season_tiers t where t.gym_id = v_gym and lower(t.name) = lower(x.name))
  on conflict do nothing;
  insert into season_claims (id, gym_id, member_id, tier_id, season_start, claimed_at, handed_over_at, handed_by)
  select format(id_of, '137', lpad(m::text, 12, '0'))::uuid, v_gym, v_me, t.id,
         (date_trunc('month', v_today)::date - (m || ' months')::interval)::date,
         (date_trunc('month', v_today)::date - (m || ' months')::interval + interval '20 days'),
         case when m > 1 then (date_trunc('month', v_today)::date - (m || ' months')::interval + interval '25 days') end,
         case when m > 1 then v_owner end
    from generate_series(1, 3) m
    join lateral (select id from season_tiers where gym_id = v_gym order by sort_order offset (m % 3) limit 1) t on true
  on conflict do nothing;

  -- ── A squad: the member and three demo friends, eight weeks of training days ──
  if v_mates is not null and not exists (select 1 from squad_members where member_id = v_me and left_at is null) then
    v_squad := format(id_of, '147', '000000000001')::uuid;
    insert into squads (id, gym_id, name, code, weekly_target, created_by, created_at)
    values (v_squad, v_gym, 'Sunset Lifters', 'SUNSET', 3, v_me, (v_today - 70) at time zone 'Asia/Manila')
    on conflict do nothing;
    insert into squad_members (id, gym_id, squad_id, member_id, joined_at)
    select format(id_of, '134', lpad(k::text, 12, '0'))::uuid, v_gym, v_squad,
           case k when 1 then v_me else v_mates[k] end, (v_today - 70 + k) at time zone 'Asia/Manila'
      from generate_series(1, least(4, 1 + coalesce(array_length(v_mates, 1), 0))) k
    on conflict do nothing;
    insert into squad_weeks (id, gym_id, squad_id, week_start, days, reached_at)
    select format(id_of, '135', lpad(w::text, 12, '0'))::uuid, v_gym, v_squad,
           (date_trunc('week', v_today)::date - 7 * w), 3 + w % 3,
           ((date_trunc('week', v_today)::date - 7 * w + 5) + time '19:00') at time zone 'Asia/Manila'
      from generate_series(1, 8) w
    on conflict do nothing;
  end if;

  -- ── The member in the gym's challenges, events and rewards ──────────────────────
  insert into challenge_participants (gym_id, challenge_id, member_id, joined_at, completed_on)
  select v_gym, c.id, v_me, (c.starts_on + 1) at time zone 'Asia/Manila',
         case when c.ends_on < v_today then c.ends_on - 3 end
    -- Demo challenges only: a row here has no id of its own, and Remove demo data finds it by its challenge.
    from challenges c where c.gym_id = v_gym and c.parent_id is null and c.id::text like '5eed____-0000-4000-8000-%'
  on conflict do nothing;

  insert into event_registrations (id, gym_id, event_id, member_id, registered_at)
  select format(id_of, '148', lpad(row_number() over (order by e.starts_at)::text, 12, '0'))::uuid, v_gym, e.id, v_me, e.starts_at - interval '5 days'
    from events e
   where e.gym_id = v_gym and not coalesce(e.cancelled, false)
     and not exists (select 1 from event_registrations r where r.event_id = e.id and r.member_id = v_me)
  on conflict do nothing;

  insert into reward_redemptions (id, gym_id, member_id, reward_id, cost_points, status, requested_at, decided_by, decided_at, fulfilled_at, fulfilled_by)
  select format(id_of, '143', lpad(k::text, 12, '0'))::uuid, v_gym, v_me, r.id, r.cost_points, 'fulfilled',
         now() - (k * 45 || ' days')::interval, v_owner, now() - (k * 45 - 1 || ' days')::interval,
         now() - (k * 45 - 2 || ' days')::interval, v_owner
    from generate_series(1, 3) k
    join lateral (select id, cost_points from rewards where gym_id = v_gym and is_active order by cost_points offset k - 1 limit 1) r on true
  on conflict do nothing;

  insert into streak_milestones (id, gym_id, member_id, weeks, reached_at)
  select format(id_of, '145', lpad(w::text, 12, '0'))::uuid, v_gym, v_me, w, now() - ((60 - w) * 7 || ' days')::interval
    from unnest(array[4, 12, 26, 52]) w
   where not exists (select 1 from streak_milestones s where s.member_id = v_me and s.weeks = w)
  on conflict do nothing;

  -- ── An inbox that looks lived in: read, unread, the kinds the gym really sends ─
  insert into notifications (id, gym_id, user_id, type, title, message, action_url, read, created_at)
  select format(id_of, '144', lpad(x.n::text, 12, '0'))::uuid, v_gym, v_me, x.type, x.title, x.msg, x.url, x.ago > 2,
         now() - x.ago * interval '1 day' - x.n * interval '7 minutes'
    from (values
      (1, 'booking', 'Session confirmed', 'Your 1-on-1 on Friday at 7:00 AM is confirmed.', '/member/booking-history', 1),
      (2, 'system', 'Checked in', 'Your QR code was scanned at the front desk and your attendance is logged.', '/member/attendance-history', 1),
      (3, 'coach', 'A new note from your coach', 'Swap lunges for step-ups this week and we will check the knee on Friday.', '/member/coach-notes', 2),
      (4, 'announcement', 'New squat racks are in', 'Two new racks on the main floor — ask the desk for a quick walkthrough.', '/member/events', 3),
      (5, 'achievement', 'Badge unlocked', 'You trained three times a week for a whole month.', '/member/achievements', 5),
      (6, 'payment', 'Payment recorded', 'Receipt for your Premium membership is in Payments.', '/member/payments', 9),
      (7, 'booking', 'Class reminder', 'HIIT starts in one hour. Bring water and a towel.', '/member/booking-history', 12),
      (8, 'announcement', 'Holiday hours', 'The gym opens 8 AM to 6 PM on the holiday. Regular hours resume the next day.', '/member/events', 20),
      (9, 'streak', 'A 26-week streak', 'Half a year of training every week. That is consistency.', '/member/progress', 28),
      (10, 'reward', 'Reward ready at the desk', 'Your G Fitness towel is ready to pick up.', '/member/rewards', 45),
      (11, 'system', 'Renewal reminder', 'Your membership renews soon — renew at the desk or online.', '/member/renew', 31),
      (12, 'announcement', 'Anniversary Open Gym', 'Bring a friend for free on Saturday, with raffle prizes at 5 PM.', '/member/events', 36)
    ) x(n, type, title, msg, url, ago)
  on conflict do nothing;

  alter table shop_products       enable trigger user;
  alter table shop_sales          enable trigger user;
  alter table shop_sale_items     enable trigger user;
  alter table stock_moves         enable trigger user;
  alter table season_tiers        enable trigger user;
  alter table season_claims       enable trigger user;
  alter table squads              enable trigger user;
  alter table squad_members       enable trigger user;
  alter table squad_weeks         enable trigger user;
  alter table challenge_participants enable trigger user;
  alter table reward_redemptions  enable trigger user;
  alter table event_registrations enable trigger user;
  alter table streak_milestones   enable trigger user;
  alter table notifications       enable trigger user;

  raise notice 'Part 3 block 3: the shop has % products and % sales; % is in % challenges and % events.',
    (select count(*) from shop_products where gym_id = v_gym), (select count(*) from shop_sales where gym_id = v_gym), v_email,
    (select count(*) from challenge_participants where member_id = v_me), (select count(*) from event_registrations where member_id = v_me);
end
$seed$;
