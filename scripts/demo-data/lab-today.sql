-- Core Fitness Lab, "today" queues (2026-11-25): rows that make the owner's Today pages show work to do.
--   Personal training → To decide : 3 session asks the coach already said yes to (the Lab is coach-then-desk),
--                                   2 gym-priced packages paid by GCash waiting for the desk, 1 awaiting payment
--   Money → Payments → To approve : 3 open renewal requests (GCash, Maya, pay at the desk)
--   Money → Shop                  : 5 counter sales earlier today
--
-- Core Fitness Lab ONLY. Never G Fitness. Made-up members (ids 5eed…) only. Re-runnable: fixed ids 5eed7…,
-- `on conflict do nothing`. Dates follow the day it runs (Manila). Remove: delete where id::text like '5eed7%'
-- from pt_sessions, coachings, renewal_requests, shop_sale_items, shop_sales.
do $seed$
declare
  g      constant uuid := 'c0f1e55e-0000-4000-8000-000000000001';
  v_desk constant uuid := 'cf1ab000-0000-4000-8000-000000000002';
  v_today date := (now() at time zone 'Asia/Manila')::date;
  id_of  constant text := '5eed7%s-0000-4000-8000-%s';
  m uuid[]; c uuid[]; prods uuid[]; prices numeric[];
  free_m uuid[]; i int; j int; k int; v_at timestamptz; v_sid uuid; v_tot numeric; v_pi int; v_q int;
  v_plan uuid; v_price numeric;
begin
  if not exists (select 1 from gyms where id = g and name = 'Core Fitness Lab') then raise exception 'No Core Fitness Lab'; end if;
  select array_agg(r.user_id order by r.user_id) into m from gym_roles r
   where r.gym_id = g and r.role = 'member' and r.status = 'active' and r.user_id::text like '5eed%';
  select array_agg(r.user_id order by r.user_id) into c from gym_roles r
   where r.gym_id = g and r.role = 'trainer' and r.status = 'active';
  select array_agg(id order by id), array_agg(price order by id) into prods, prices from shop_products where gym_id = g and active;
  -- Members with no package of any open kind and no open renewal: safe to give one.
  select array_agg(x order by x) into free_m from unnest(m) x
   where not exists (select 1 from coachings co where co.member_id = x and co.status in ('invited','requested','awaiting_payment','payment_sent','active'))
     and not exists (select 1 from renewal_requests rr where rr.member_id = x and rr.status = 'open');
  if cardinality(free_m) < 6 or cardinality(c) < 1 then raise exception 'Not enough made-up members or coaches in the Lab'; end if;

  alter table pt_sessions disable trigger user; alter table coachings disable trigger user;
  alter table renewal_requests disable trigger user; alter table shop_sales disable trigger user; alter table shop_sale_items disable trigger user;

  -- ── 1-on-1 asks the coach already said yes to: the desk confirms (coach_desk) ──
  for k in 1..3 loop
    v_at := ((v_today + k) + time '06:00' + (k * 3) * interval '1 hour') at time zone 'Asia/Manila';
    insert into pt_sessions (id, trainer_id, member_id, starts_at, duration_minutes, status, requested_at, gym_id, coach_ok_by, coach_ok_at, notes)
    values (format(id_of, '001', lpad(k::text, 12, '0'))::uuid, c[1 + k % cardinality(c)], m[1 + (k * 5) % cardinality(m)],
            v_at, 60, 'pending', now() - k * interval '3 hours', g, c[1 + k % cardinality(c)], now() - k * interval '1 hour',
            (array['First session, form check please', 'Want to work on my deadlift', 'Back after a short break'])[k])
    on conflict (id) do nothing;
  end loop;

  -- ── Packages the member pays the gym for: 2 paid by GCash, 1 not yet paid ──
  for k in 1..3 loop
    insert into coachings (id, gym_id, member_id, trainer_id, kind, months, status, fee_mode, price, pay_reference, pay_sent_at, started_by, created_at, coach_ok_at)
    values (format(id_of, '002', lpad(k::text, 12, '0'))::uuid, g, free_m[k], c[1 + (k + 1) % cardinality(c)], 'pt',
            (array[1, 3, 1])[k], case when k <= 2 then 'payment_sent' else 'awaiting_payment' end, 'gym_priced',
            (select price from coaching_prices where gym_id = g and kind = 'pt' and months = (array[1, 3, 1])[k]),
            case when k <= 2 then (array['GC 7421 0938 115', 'GC 7421 1184 302'])[k] end,
            case when k <= 2 then now() - k * interval '2 hours' end, 'member', now() - k * interval '5 hours', now() - k * interval '4 hours')
    on conflict (id) do nothing;
  end loop;

  -- ── Renewal requests from the phone app: GCash, Maya, pay at the desk ──
  for k in 1..3 loop
    select id, price into v_plan, v_price from membership_plans where gym_id = g and is_active and name = (array['Monthly', 'Quarterly', 'Premium'])[k];
    insert into renewal_requests (id, member_id, plan_id, note, status, created_at, gym_id, pay_kind, pay_method_label, pay_reference, pay_amount, paid_on)
    values (format(id_of, '003', lpad(k::text, 12, '0'))::uuid, free_m[3 + k], v_plan,
            (array['Renewing for December', null, 'Will drop by after work'])[k], 'open', now() - k * interval '90 minutes', g,
            (array['gcash', 'maya', null])[k], (array['GCash', 'Maya', null])[k],
            (array['GC 5530 2271 049', 'MY 88 1204 7731', null])[k],
            case when k <= 2 then v_price end, case when k <= 2 then v_today end)
    on conflict (id) do nothing;
  end loop;

  -- ── Counter sales earlier today ──
  for k in 1..5 loop
    v_at := (v_today + time '07:10' + (k * 97) * interval '1 minute') at time zone 'Asia/Manila';
    if v_at > now() then v_at := now() - (6 - k) * interval '9 minutes'; end if;
    v_sid := format(id_of, '004', lpad(k::text, 12, '0'))::uuid;
    if exists (select 1 from shop_sales where id = v_sid) then continue; end if;
    v_tot := 0;
    for j in 1..(1 + k % 2) loop
      v_pi := 1 + (k * 3 + j * 5) % cardinality(prods); v_q := 1 + (k + j) % 2; v_tot := v_tot + v_q * prices[v_pi];
    end loop;
    insert into shop_sales (id, gym_id, sale_day, total, member_id, sold_by, created_at)
    values (v_sid, g, v_today, v_tot, case when k % 2 = 0 then m[1 + (k * 7) % cardinality(m)] end, v_desk, v_at);
    for j in 1..(1 + k % 2) loop
      v_pi := 1 + (k * 3 + j * 5) % cardinality(prods);
      insert into shop_sale_items (id, gym_id, sale_id, product_id, qty, unit_price)
      values (format(id_of, '005', lpad((k * 10 + j)::text, 12, '0'))::uuid, g, v_sid, prods[v_pi], 1 + (k + j) % 2, prices[v_pi]);
    end loop;
  end loop;

  alter table pt_sessions enable trigger user; alter table coachings enable trigger user;
  alter table renewal_requests enable trigger user; alter table shop_sales enable trigger user; alter table shop_sale_items enable trigger user;
end $seed$;
