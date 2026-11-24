-- Fill Core Fitness Lab's empty and stale pages with made-up data (2026-11-24).
--
-- Core Fitness Lab ONLY (gym c0f1e55e-…0001). Never G Fitness.
-- Re-runnable: every row has a fixed demo id 5eed9KKK-0000-4000-8000-… and is
-- skipped if already there. Dates are relative to the day it runs (Manila).
--
-- Rows tied to the made-up members/coaches (5eed…@seed.corefitness-test.com)
-- go with the platform's Remove demo data. Gym-level rows (notes, cash
-- closeouts, goals, feature requests, coaching prices, time slots) do not:
-- lab-populate-remove.sql takes those out.
do $seed$
declare
  g       constant uuid := 'c0f1e55e-0000-4000-8000-000000000001';
  v_owner constant uuid := 'cf1ab000-0000-4000-8000-000000000001';
  v_desk  constant uuid := 'cf1ab000-0000-4000-8000-000000000002';
  v_today date := (now() at time zone 'Asia/Manila')::date;
  m uuid[]; c uuid[]; p record; prods uuid[]; prices numeric[]; eq uuid[]; cls uuid[];
  n int; i int; d int; k int; j int;
  v_day date; v_at timestamptz; v_plan uuid; v_pname text; v_price numeric; v_len int;
  v_mid uuid; v_pid uuid; v_sid uuid; v_tot numeric; v_q int; v_pi int;
  v_exp numeric; v_cnt int;
  function_id text := '5eed9%s-0000-4000-8000-%s';
begin
  if not exists (select 1 from gyms where id = g and name = 'Core Fitness Lab') then
    raise exception 'Core Fitness Lab not found; nothing added.';
  end if;

  select array_agg(r.user_id order by r.user_id) into m from gym_roles r
   where r.gym_id = g and r.role = 'member' and r.status = 'active' and r.user_id::text like '5eed%';
  select array_agg(r.user_id order by r.user_id) into c from gym_roles r
   where r.gym_id = g and r.role = 'trainer' and r.status = 'active';
  select array_agg(id order by id), array_agg(price order by id) into prods, prices
    from shop_products where gym_id = g and active;
  select array_agg(id order by id) into eq from gym_equipment where gym_id = g;
  select array_agg(id order by scheduled_at) into cls from classes
   where gym_id = g and scheduled_at between now() and now() + interval '10 days';
  n := cardinality(m);

  alter table memberships disable trigger user;  alter table payments disable trigger user;
  alter table attendance disable trigger user;   alter table pt_sessions disable trigger user;
  alter table shop_sales disable trigger user;   alter table shop_sale_items disable trigger user;
  alter table bookings disable trigger user;     alter table class_waitlist disable trigger user;
  alter table coach_checkins disable trigger user; alter table cash_closeouts disable trigger user;
  alter table membership_requests disable trigger user; alter table referrals disable trigger user;
  alter table slot_bookings disable trigger user;

  -- ── Memberships: most members on a current term, paid at the desk ──────────
  for i in 1..n loop
    if exists (select 1 from memberships where member_id = m[i] and gym_id = g
                and status = 'active' and expiry_date >= v_today) then continue; end if;
    if i % 7 = 0 then continue; end if;  -- a few stay expired, to renew
    if i % 5 = 0 then v_pname := 'Quarterly'; v_len := 90; elsif i % 3 = 0 then v_pname := 'Premium'; v_len := 30;
    else v_pname := 'Monthly'; v_len := 30; end if;
    select id, price into v_plan, v_price from membership_plans where gym_id = g and name = v_pname and is_active;
    v_day := v_today - case when i % 11 = 0 then 27 else (i * 3) % 27 end;  -- some expire this week
    update memberships set status = 'expired'
     where member_id = m[i] and gym_id = g and status = 'active' and expiry_date < v_today;
    v_mid := format(function_id, '001', lpad(i::text, 12, '0'))::uuid;
    insert into memberships (id, member_id, plan_id, status, start_date, expiry_date, created_at, gym_id)
    values (v_mid, m[i], v_plan, 'active', v_day, v_day + v_len, (v_day + time '09:00') at time zone 'Asia/Manila', g)
    on conflict (id) do nothing;
    insert into payments (id, member_id, membership_id, amount, method, status, invoice_number, recorded_by,
                          created_at, paid_on, plan_id, plan_name, gym_id)
    values (format(function_id, '002', lpad(i::text, 12, '0'))::uuid, m[i], v_mid, v_price,
            case when i % 4 = 0 then 'GCash' else 'cash' end, 'completed', 'INV-2026-9' || lpad(i::text, 3, '0'),
            v_desk, (v_day + time '09:00' + (i * 7) * interval '1 minute') at time zone 'Asia/Manila', v_day, v_plan, v_pname, g)
    on conflict (id) do nothing;
  end loop;

  -- ── Check-ins: the last 14 days, today up to now ───────────────────────────
  for d in 0..13 loop
    v_day := v_today - d;
    for k in 1..(10 + (d * 7) % 9) loop
      v_at := (v_day + time '06:00' + ((k * 47 + d * 13) % 900) * interval '1 minute') at time zone 'Asia/Manila';
      if v_at > now() then continue; end if;
      insert into attendance (id, member_id, check_in_time, method, recorded_by, gym_id, source, activity_by)
      values (format(function_id, '003', lpad((d * 100 + k)::text, 12, '0'))::uuid, m[1 + (d * 5 + k * 3) % n], v_at,
              case when k % 3 = 0 then 'manual' else 'qr' end::checkin_method,
              case when k % 3 = 0 then v_desk end, g, case when k % 3 = 0 then 'desk' else 'kiosk' end, 'member')
      on conflict (id) do nothing;
    end loop;
  end loop;

  -- ── Coaching sessions: requests to decide, the week ahead, last week ───────
  for k in 1..22 loop
    if k <= 14 then v_day := v_today + (k % 7); else v_day := v_today - (k - 14); end if;
    v_at := (v_day + time '07:00' + (k % 5) * interval '2 hours') at time zone 'Asia/Manila';
    insert into pt_sessions (id, trainer_id, member_id, starts_at, duration_minutes, status, requested_at,
                             approved_at, decided_by, decided_by_role, decided_at, gym_id, attended, attended_at)
    values (format(function_id, '004', lpad(k::text, 12, '0'))::uuid, c[1 + k % cardinality(c)], m[1 + (k * 2) % n],
            v_at, 60, case when k <= 4 then 'pending' else 'approved' end::booking_status, v_at - interval '3 days',
            case when k > 4 then v_at - interval '2 days' end, case when k > 4 then c[1 + k % cardinality(c)] end,
            case when k > 4 then 'trainer' end, case when k > 4 then v_at - interval '2 days' end, g,
            case when k > 14 then case when k = 18 then 'no_show' else 'came' end end,
            case when k > 14 then v_at + interval '1 hour' end)
    on conflict (id) do nothing;
  end loop;

  -- ── Class bookings for the coming classes, one class with a waitlist ───────
  if cls is not null then
    for i in 1..cardinality(cls) loop
      for k in 1..(4 + i % 5) loop
        insert into bookings (id, member_id, class_id, status, requested_at, approved_at, decided_by_role, decided_at, gym_id)
        values (format(function_id, '022', lpad((i * 100 + k)::text, 12, '0'))::uuid, m[1 + (i * 7 + k * 3) % n], cls[i],
                case when k = 1 and i % 2 = 0 then 'pending' else 'approved' end::booking_status, now() - interval '1 day',
                case when not (k = 1 and i % 2 = 0) then now() - interval '20 hours' end, 'trainer', now() - interval '20 hours', g)
        on conflict (id) do nothing;
      end loop;
    end loop;
    for k in 1..3 loop
      insert into class_waitlist (class_id, member_id, joined_at, gym_id)
      select cls[1], m[1 + (30 + k) % n], now() - k * interval '2 hours', g
      where not exists (select 1 from class_waitlist where class_id = cls[1] and member_id = m[1 + (30 + k) % n]);
    end loop;
  end if;

  -- ── Shop: two weeks of counter sales ───────────────────────────────────────
  for d in 0..13 loop
    v_day := v_today - d;
    for k in 1..(3 + d % 4) loop
      v_at := (v_day + time '07:30' + ((k * 131 + d * 17) % 780) * interval '1 minute') at time zone 'Asia/Manila';
      if v_at > now() then continue; end if;
      v_sid := format(function_id, '005', lpad((d * 100 + k)::text, 12, '0'))::uuid;
      if exists (select 1 from shop_sales where id = v_sid) then continue; end if;
      v_tot := 0;
      for j in 1..(1 + k % 2) loop
        v_pi := 1 + (d * 3 + k * 5 + j * 7) % cardinality(prods);
        v_q := 1 + (k + j) % 2;
        v_tot := v_tot + v_q * prices[v_pi];
      end loop;
      insert into shop_sales (id, gym_id, sale_day, total, member_id, sold_by, created_at)
      values (v_sid, g, v_day, v_tot, case when k % 2 = 0 then m[1 + (d + k * 4) % n] end, v_desk, v_at);
      for j in 1..(1 + k % 2) loop
        v_pi := 1 + (d * 3 + k * 5 + j * 7) % cardinality(prods);
        insert into shop_sale_items (id, gym_id, sale_id, product_id, qty, unit_price)
        values (format(function_id, '006', lpad((d * 1000 + k * 10 + j)::text, 12, '0'))::uuid, g, v_sid, prods[v_pi],
                1 + (k + j) % 2, prices[v_pi]);
      end loop;
    end loop;
  end loop;

  -- ── End of day: the last 10 closed days, two with a small difference ──────
  for d in 1..10 loop
    v_day := v_today - d;
    select coalesce(sum(amount), 0), count(*) into v_exp, v_cnt from payments
     where gym_id = g and paid_on = v_day and lower(method) = 'cash' and status = 'completed';
    v_exp := v_exp + coalesce((select sum(total) from shop_sales where gym_id = g and sale_day = v_day and voided_at is null), 0);
    insert into cash_closeouts (gym_id, day, expected, counted, payment_count, refunds_out, note, closed_by, closed_at)
    values (g, v_day, v_exp, v_exp + case d when 3 then -50 when 7 then 20 else 0 end, v_cnt, 0,
            case d when 3 then 'Short ₱50, change given twice' when 7 then 'Over ₱20, a tip left at the counter' end,
            v_desk, (v_day + time '21:15') at time zone 'Asia/Manila')
    on conflict do nothing;
  end loop;

  -- ── Coaches checking in ────────────────────────────────────────────────────
  for d in 0..9 loop
    v_day := v_today - d;
    for j in 1..cardinality(c) loop
      if (d + j) % 4 = 0 then continue; end if;
      v_at := (v_day + time '05:40' + ((j * 23 + d * 7) % 120) * interval '1 minute') at time zone 'Asia/Manila';
      if v_at > now() then continue; end if;
      insert into coach_checkins (id, gym_id, trainer_id, check_in_time, day, method, source)
      values (format(function_id, '008', lpad((d * 10 + j)::text, 12, '0'))::uuid, g, c[j], v_at, v_day, 'qr', 'kiosk')
      on conflict do nothing;
    end loop;
  end loop;

  -- ── Equipment reports ──────────────────────────────────────────────────────
  insert into equipment_reports (id, gym_id, equipment_id, member_id, note, status, created_at, resolved_at, resolved_by) values
    (format(function_id, '009', lpad('1', 12, '0'))::uuid, g, eq[1], m[4], 'The seat pin is loose and slips out mid set.', 'open', now() - interval '5 hours', null, null),
    (format(function_id, '009', lpad('2', 12, '0'))::uuid, g, eq[2 % cardinality(eq) + 1], m[9], 'Cable is fraying near the top pulley.', 'open', now() - interval '2 days', null, null),
    (format(function_id, '009', lpad('3', 12, '0'))::uuid, g, eq[3 % cardinality(eq) + 1], m[15], 'Display shows no numbers after ten minutes.', 'resolved', now() - interval '6 days', now() - interval '4 days', v_owner)
  on conflict (id) do nothing;

  -- ── Owner's notes, feature ideas, gym goals ────────────────────────────────
  insert into gym_notes (id, gym_id, body, pinned, author_id, created_at) values
    (format(function_id, '011', lpad('1', 12, '0'))::uuid, g, 'Aircon service on Saturday morning. Open at 9 instead of 6.', true, v_owner, now() - interval '1 day'),
    (format(function_id, '011', lpad('2', 12, '0'))::uuid, g, 'Restock whey and bottled water before the weekend.', false, v_desk, now() - interval '2 days'),
    (format(function_id, '011', lpad('3', 12, '0'))::uuid, g, 'One coach is off on the 30th; move the 7am sessions.', false, v_owner, now() - interval '3 days')
  on conflict (id) do nothing;
  insert into feature_requests (id, gym_id, author_id, title, body, status, created_at) values
    (format(function_id, '010', lpad('1', 12, '0'))::uuid, g, v_owner, 'Print a member card with the QR code', 'Older members want a plastic card instead of the phone.', 'open', now() - interval '4 days'),
    (format(function_id, '010', lpad('2', 12, '0'))::uuid, g, v_owner, 'Text reminder before a plan expires', 'Some members do not install the app.', 'planned', now() - interval '12 days')
  on conflict (id) do nothing;
  insert into gym_goals (id, gym_id, title, metric, target, starts_on, ends_on, reward_points, is_active, created_by) values
    (format(function_id, '012', lpad('1', 12, '0'))::uuid, g, '400 check-ins this month', 'checkins', 400,
     date_trunc('month', v_today)::date, (date_trunc('month', v_today) + interval '1 month - 1 day')::date, 50, true, v_owner),
    (format(function_id, '012', lpad('2', 12, '0'))::uuid, g, '150 workouts logged together', 'workouts_logged', 150,
     date_trunc('month', v_today)::date, (date_trunc('month', v_today) + interval '1 month - 1 day')::date, 30, true, v_owner)
  on conflict (id) do nothing;

  -- ── Freeze and cancel requests ─────────────────────────────────────────────
  insert into membership_requests (id, gym_id, member_id, kind, reason, requested_days, status, created_at, closed_at, closed_by, close_note) values
    (format(function_id, '013', lpad('1', 12, '0'))::uuid, g, m[2], 'freeze', 'Going home to the province for two weeks.', 14, 'open', now() - interval '6 hours', null, null, null),
    (format(function_id, '013', lpad('2', 12, '0'))::uuid, g, m[13], 'cancel', 'Moving to Manila for work next month.', null, 'open', now() - interval '1 day', null, null, null),
    (format(function_id, '013', lpad('3', 12, '0'))::uuid, g, m[22], 'freeze', 'Knee injury, doctor said rest.', 21, 'granted', now() - interval '9 days', now() - interval '8 days', v_desk, 'Frozen from the 16th.')
  on conflict (id) do nothing;

  -- ── Referrals, testimonials ────────────────────────────────────────────────
  insert into referrals (id, gym_id, referrer_id, referred_id, code, status, created_at, rewarded_at, referrer_points, friend_points) values
    (format(function_id, '014', lpad('1', 12, '0'))::uuid, g, m[1], m[30], 'ANDREA1', 'rewarded', now() - interval '20 days', now() - interval '18 days', 100, 50),
    (format(function_id, '014', lpad('2', 12, '0'))::uuid, g, m[1], m[31], 'ANDREA1', 'pending', now() - interval '3 days', null, 100, 50),
    (format(function_id, '014', lpad('3', 12, '0'))::uuid, g, m[5], m[32], 'DEMO5', 'pending', now() - interval '1 day', null, 100, 50)
  on conflict do nothing;
  insert into testimonials (id, gym_id, author_id, quote, shown_name, shown_role, status, created_at, decided_at) values
    (format(function_id, '015', lpad('1', 12, '0'))::uuid, g, m[3], 'The coaches remember my numbers every week. I finally squat my bodyweight.', 'Member since 2025', 'Member', 'approved', now() - interval '15 days', now() - interval '14 days'),
    (format(function_id, '015', lpad('2', 12, '0'))::uuid, g, m[8], 'Clean place, friendly desk, and the app tells me when it is not crowded.', 'Regular, 6am crowd', 'Member', 'pending', now() - interval '2 days', null),
    (format(function_id, '015', lpad('3', 12, '0'))::uuid, g, m[17], 'Lost eight kilos in four months with the coaching package here.', 'Coaching client', 'Member', 'pending', now() - interval '5 hours', null)
  on conflict (id) do nothing;

  -- ── Coach credentials (stand-in files: no document is stored) ─────────────
  insert into trainer_credentials (id, trainer_id, title, file_path, mime_type, status, uploaded_at, gym_id, issuer, credential_number, issued_on, expires_on, reviewed_by, reviewed_at)
  select format(function_id, '016', lpad(x.k::text, 12, '0'))::uuid, c[x.k], x.t, 'demo/lab-credential-' || x.k || '.pdf', 'application/pdf',
         x.s, now() - x.k * interval '3 days', g, x.iss, x.num, v_today - 400, v_today + 330,
         case when x.s = 'verified' then v_owner end, case when x.s = 'verified' then now() - interval '1 day' end
    from (values (1, 'Certified Personal Trainer', 'pending', 'PhilSports Fitness Academy', 'CPT-2025-0417'),
                 (2, 'First Aid and CPR', 'verified', 'Philippine Red Cross', 'FA-88213'),
                 (3, 'Strength and Conditioning Coach', 'pending', 'NSCA', 'CSCS-551902')) x(k, t, s, iss, num)
   where x.k <= cardinality(c)
  on conflict do nothing;

  -- ── Coaching prices and time slots ─────────────────────────────────────────
  insert into coaching_prices (gym_id, kind, months, price)
  select g, 'pt', x.mo, x.pr from (values (1, 2500), (3, 6900), (6, 12900)) x(mo, pr)
   where not exists (select 1 from coaching_prices where gym_id = g)
  ;
  if not exists (select 1 from slot_templates where gym_id = g) then
    for d in 1..6 loop
      insert into slot_templates (id, gym_id, day_of_week, starts, ends, capacity) values
        (format(function_id, '018', lpad((d * 10 + 1)::text, 12, '0'))::uuid, g, d, '06:00', '09:00', 25),
        (format(function_id, '018', lpad((d * 10 + 2)::text, 12, '0'))::uuid, g, d, '09:00', '12:00', 20),
        (format(function_id, '018', lpad((d * 10 + 3)::text, 12, '0'))::uuid, g, d, '16:00', '19:00', 25),
        (format(function_id, '018', lpad((d * 10 + 4)::text, 12, '0'))::uuid, g, d, '19:00', '22:00', 20);
    end loop;
  end if;
  for d in 0..3 loop
    v_day := v_today + d;
    if extract(dow from v_day) = 0 then continue; end if;
    for k in 1..8 loop
      insert into slot_bookings (id, gym_id, member_id, slot_date, starts, ends, created_at)
      values (format(function_id, '019', lpad((d * 100 + k)::text, 12, '0'))::uuid, g, m[1 + (d * 9 + k * 4) % n], v_day,
              case k % 4 when 0 then time '06:00' when 1 then time '09:00' when 2 then time '16:00' else time '19:00' end,
              case k % 4 when 0 then time '09:00' when 1 then time '12:00' when 2 then time '19:00' else time '22:00' end,
              now() - interval '1 day')
      on conflict (id) do nothing;
    end loop;
  end loop;

  alter table memberships enable trigger user;  alter table payments enable trigger user;
  alter table attendance enable trigger user;   alter table pt_sessions enable trigger user;
  alter table shop_sales enable trigger user;   alter table shop_sale_items enable trigger user;
  alter table bookings enable trigger user;     alter table class_waitlist enable trigger user;
  alter table coach_checkins enable trigger user; alter table cash_closeouts enable trigger user;
  alter table membership_requests enable trigger user; alter table referrals enable trigger user;
  alter table slot_bookings enable trigger user;

  raise notice 'Lab populated: % members, % coaches.', n, cardinality(c);
end $seed$;
