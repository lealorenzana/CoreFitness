-- Demo data, so every paginated admin screen has more than one page.
--
-- Paste into the Supabase SQL Editor and run. Three blocks, each atomic: if a
-- block fails, nothing it did survives. Re-runnable — a second run adds
-- nothing. Remove it all with remove-demo-data.sql, one paste.
--
-- ## What it creates
--
--   150 members        Members page, 15 pages of 10
--   ~210 payments      Premium members only, ~60 of them - Payments page
--                      (grouped by member, 8 per page), on a visible SEED-
--                      invoice series
--   72 past classes    ~380 bookings — Bookings page, 12 per page
--   ~2,100 check-ins   Attendance History; ~24 today on the desk log, 10 per page
--   freeze / cancel    with reasons, so member drawers have history
--   suspensions        with reasons, so Account history is not empty
--
-- ## What it deliberately does NOT create, and why
--
-- Anything a **real member** would see in the phone app:
--
--   * trainers   — left to seed-demo-data-2.sql, which adds them with no
--                  bookable hours (`public_trainers` shows every active
--                  trainer to members, so an active one is listed)
--   * events     — the member app lists past events as well as future ones
--   * future classes — members are offered every future class
--   * PT sessions, announcements, rewards — the same reason
--
-- The classes here are all in the past and have no trainer, which is exactly
-- the combination no member or trainer screen ever shows.
--
-- ## The one place real people WILL see it: trainers' rosters
--
-- Every trainer may read every member's profile, membership and check-ins —
-- `*_select_trainer` in 0006, deliberately, because the trainer app's Members
-- tab is the whole gym. So **each real trainer's roster will list the 150 demo
-- members**, with plans and visit counts, until remove-demo-data.sql runs.
-- Nothing a trainer does to one reaches a person: they cannot sign in, and a
-- recommendation sent to one is removed with them. Tell the coaches, or seed
-- only while the demo needs it.
--
-- ## Why the triggers are switched off while it runs
--
-- Each block disables the user triggers on the tables it writes and re-enables
-- them before it finishes. Inside one transaction, so **no other session ever
-- sees them off**, and a failure rolls the disable back with everything else.
-- Foreign keys stay enforced — `disable trigger user` leaves those alone.
--
-- Left on, the triggers would have done real damage to a live gym:
--
--   * **the invoice trigger overwrites every number** and advances the gym's
--     real counter. ~210 dummy payments would push the next real receipt from
--     INV-2026-0012 to about INV-2026-0222, and deleting them would leave the gap
--     forever
--   * check-ins award CORE Points, bookings notify trainers, and every write
--     lands in the audit log the gym relies on
--
-- ## How to tell it apart, and how it is removed
--
-- Every row's id matches `5eed____-0000-4000-8000-…`. A random v4 UUID has a
-- roughly 1-in-10^16 chance of matching that, so removal by pattern cannot
-- reach a real row. Member emails are `…@seed.corefitness-test.com`.
--
-- The dummy members **cannot sign in**: no password, no identity row.
--
-- ## Before a real report
--
-- The dashboard WILL count this: members, check-ins and revenue from the
-- SEED- payments. **Remove it before any figure is read out as the gym's.**

-- ============================================================================
-- BLOCK 1 of 3 — people and memberships
-- ============================================================================
do $seed$
declare
  v_free    uuid;
  v_trial   uuid;
  v_premium uuid;
  v_today   date := (now() at time zone 'Asia/Manila')::date;
  v_col     text;
  v_n       int;
begin
  select id into v_free    from membership_plans where name = 'Free Plan'  limit 1;
  select id into v_trial   from membership_plans where name = 'Free Trial' limit 1;
  select id into v_premium from membership_plans where name = 'Premium'    limit 1;
  if v_free is null or v_trial is null or v_premium is null then
    raise exception 'Free Plan, Free Trial and Premium must all exist. Nothing was written.';
  end if;

  alter table profiles              disable trigger user;
  alter table member_profiles       disable trigger user;
  alter table memberships           disable trigger user;
  alter table account_status_events disable trigger user;

  drop table if exists _seed_people;
  create temp table _seed_people as
  with b as (
    select g.n,
           ('5eed0001-0000-4000-8000-' || lpad(g.n::text, 12, '0'))::uuid as id,
           (hashtext('first' || g.n)::bigint + 2147483648) as h1,
           (hashtext('last'  || g.n)::bigint + 2147483648) as h2,
           (hashtext('plan'  || g.n)::bigint + 2147483648) % 100 as hp,
           (hashtext('state' || g.n)::bigint + 2147483648) % 100 as hs,
           (hashtext('msta'  || g.n)::bigint + 2147483648) % 100 as hm,
           (hashtext('when'  || g.n)::bigint + 2147483648) as hw
      from generate_series(1, 150) as g(n)
  )
  select b.*,
         case when b.n % 2 = 1 then 'female' else 'male' end as gender,
         case when b.n % 2 = 1
           then (array['Maria','Ana','Kristine','Angelica','Jasmine','Nicole','Camille',
                       'Patricia','Joanna','Mae','Princess','Rhea','Lovely','Jennylyn',
                       'Katrina','Bea','Czarina','Aileen','Grace','Rowena'])[1 + (b.h1 % 20)::int]
           else (array['Juan','Jose','Mark','John Paul','Christian','Ramon','Paolo','Jerome',
                       'Carlo','Miguel','Rafael','Joshua','Kevin','Arnel','Dennis','Rodel',
                       'Jomar','Erwin','Noel','Bryan'])[1 + (b.h1 % 20)::int]
         end as first_name,
         (array['Santos','Reyes','Cruz','Bautista','Ocampo','Garcia','Mendoza','Torres',
                'Tomas','Andrada','Castillo','Flores','Villanueva','Ramos','Castro','Rivera',
                'Aquino','Navarro','Salazar','Mercado','Dela Cruz','De Leon','Manalo',
                'Pascual','Soriano','Gonzales','Lopez','Fernandez','Aguilar','Valdez'])[1 + (b.h2 % 30)::int]
           as last_name,
         case when b.hp < 45 then 'free' when b.hp < 65 then 'trial' else 'premium' end as plan_kind,
         case when b.hs < 4 then 'suspended' when b.hs < 7 then 'archived' else 'active' end
           as profile_status,
         (now() - make_interval(days => (b.hw % 365)::int, mins => (b.hw % 600)::int)) as joined,
         null::date as start_date,
         null::date as expiry_date,
         false as never_expires,
         'active'::text as member_status,
         null::date as frozen_at
    from b;

  -- The current membership period, by plan.
  update _seed_people set
    start_date    = (joined at time zone 'Asia/Manila')::date,
    never_expires = true
   where plan_kind = 'free';

  update _seed_people set
    start_date  = v_today - (hw % 45)::int,
    expiry_date = v_today - (hw % 45)::int + 30
   where plan_kind in ('trial', 'premium');

  -- A trial is the member's first month, so they joined the day it started.
  update _seed_people set
    joined = ((start_date + time '09:00') at time zone 'Asia/Manila')
   where plan_kind = 'trial';

  update _seed_people set member_status = 'expired'
   where plan_kind in ('trial', 'premium') and expiry_date < v_today;

  update _seed_people set member_status = 'frozen', frozen_at = v_today - (hm % 8)::int
   where plan_kind = 'premium' and member_status = 'active' and hm < 12;

  update _seed_people set member_status = 'cancelled'
   where plan_kind = 'premium' and member_status = 'active' and hm between 12 and 18;

  -- ── Auth rows. No password and no identity, so nobody can sign in as these.
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at)
  select p.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         lower(replace(p.first_name, ' ', '')) || '.' || lower(replace(p.last_name, ' ', ''))
           || '.' || p.n || '@seed.corefitness-test.com',
         '', p.joined,
         '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
         p.joined, p.joined
    from _seed_people p
  on conflict (id) do nothing;

  -- GoTrue scans these as non-null strings; a NULL here breaks the dashboard's
  -- Users list for every account, real ones included. Only the columns this
  -- Auth version actually has are touched.
  for v_col in
    select column_name from information_schema.columns
     where table_schema = 'auth' and table_name = 'users'
       and column_name in ('confirmation_token', 'recovery_token', 'email_change',
                           'email_change_token_new', 'email_change_token_current',
                           'phone_change', 'phone_change_token', 'reauthentication_token')
  loop
    execute format(
      'update auth.users set %I = '''' where id::text like %L and %I is null',
      v_col, '5eed0001-0000-4000-8000-%', v_col);
  end loop;

  insert into profiles (id, role, first_name, last_name, email, phone, status, created_at)
  select p.id, 'member', p.first_name, p.last_name, u.email,
         '+639' || lpad(((hashtext('phone' || p.n)::bigint + 2147483648) % 1000000000)::text, 9, '0'),
         p.profile_status, p.joined
    from _seed_people p
    join auth.users u on u.id = p.id
  on conflict (id) do nothing;

  insert into member_profiles (profile_id, qr_code, address, gender, date_of_birth,
                               experience_level, emergency_contact_name,
                               emergency_contact_phone, emergency_contact_relationship,
                               onboarding_completed_at, created_at)
  select p.id, p.id::text,
         'Brgy. ' || (array['Payompon','Balansay','Fatima','San Luis','Talabaan','Tangkalan',
                            'Tayamaan','Poblacion 1','Poblacion 3','Poblacion 5','Poblacion 8'])
                       [1 + (p.h2 % 11)::int] || ', Mamburao, Occidental Mindoro',
         p.gender,
         v_today - make_interval(years => 18 + (p.h1 % 38)::int, days => (p.hw % 360)::int)::interval,
         (array['beginner','beginner','intermediate','advanced'])[1 + (p.h1 % 4)::int],
         (array['Rosario','Eduardo','Lorna','Ricardo','Teresita','Danilo'])[1 + (p.hw % 6)::int]
           || ' ' || p.last_name,
         '+639' || lpad(((hashtext('ecph' || p.n)::bigint + 2147483648) % 1000000000)::text, 9, '0'),
         (array['Mother','Father','Spouse','Sibling'])[1 + (p.hs % 4)::int],
         p.joined + interval '12 minutes',
         p.joined
    from _seed_people p
  on conflict (profile_id) do nothing;

  insert into memberships (id, member_id, plan_id, status, start_date, expiry_date,
                           never_expires, frozen_at, freeze_count, created_at, updated_at)
  select ('5eed0002-0000-4000-8000-' || lpad(p.n::text, 12, '0'))::uuid,
         p.id,
         case p.plan_kind when 'free' then v_free when 'trial' then v_trial else v_premium end,
         p.member_status::membership_status,
         p.start_date, p.expiry_date, p.never_expires, p.frozen_at,
         (p.frozen_at is not null)::int,
         greatest(p.joined, ((p.start_date + time '09:00') at time zone 'Asia/Manila')),
         greatest(p.joined, ((coalesce(p.frozen_at, p.start_date) + time '09:00') at time zone 'Asia/Manila'))
    from _seed_people p
  on conflict (id) do nothing;

  insert into account_status_events (id, profile_id, status, previous_status, reason,
                                     recorded_by, created_at)
  select ('5eed0008-0000-4000-8000-' || lpad(p.n::text, 12, '0'))::uuid,
         p.id, p.profile_status, 'active',
         case p.profile_status
           when 'suspended' then (array[
             'Unpaid dues since last month. Spoke to them at the desk on the 3rd.',
             'Repeated no-shows on booked classes after two warnings.',
             'Lent their QR code to a non-member. Explained the rule; suspended for two weeks.'
           ])[1 + (p.n % 3)]
           else (array[
             'Moved to Manila for work and asked us to close the account.',
             'No longer training. Asked to stop receiving messages from the gym.'
           ])[1 + (p.n % 2)]
         end,
         null,
         now() - make_interval(days => 3 + (p.n % 20))
    from _seed_people p
   where p.profile_status in ('suspended', 'archived')
  on conflict (id) do nothing;

  alter table profiles              enable trigger user;
  alter table member_profiles       enable trigger user;
  alter table memberships           enable trigger user;
  alter table account_status_events enable trigger user;

  drop table _seed_people;

  select count(*) into v_n from profiles where id::text like '5eed0001-0000-4000-8000-%';
  raise notice 'Block 1: % demo members present.', v_n;
end
$seed$;

-- ============================================================================
-- BLOCK 2 of 3 — payments (Premium only; the two free plans cost nothing)
-- ============================================================================
do $seed$
declare
  v_n int;
begin
  alter table payments disable trigger user;

  -- One payment per month the member has been on Premium, newest first. The
  -- newest is left pending for about one member in ten, so the chip shows.
  insert into payments (id, member_id, membership_id, amount, method, status, due_date,
                        invoice_number, notes, recorded_by, paid_on, created_at)
  select ('5eed0003-0000-4000-8000-' || lpad((m.n * 10 + k.k)::text, 12, '0'))::uuid,
         m.member_id, m.id, mp.price, 'cash',
         case when k.k = 1 and m.pend then 'pending' else 'completed' end::payment_status,
         case when k.k = 1 and m.pend then m.start_date end,
         'SEED-' || to_char(m.start_date - (k.k - 1) * 30, 'YYYY') || '-'
           || lpad((m.n * 10 + k.k)::text, 5, '0'),
         null, null,
         m.start_date - (k.k - 1) * 30,
         ((m.start_date - (k.k - 1) * 30 + time '10:30') at time zone 'Asia/Manila')
    from (
      select ms.*, right(ms.id::text, 12)::int as n,
             ((hashtext('pend' || ms.id)::bigint + 2147483648) % 10) = 0 as pend,
             1 + ((hashtext('months' || ms.id)::bigint + 2147483648) % 6)::int as months
        from memberships ms
       where ms.id::text like '5eed0002-0000-4000-8000-%'
    ) m
    join membership_plans mp on mp.id = m.plan_id and mp.tier = 'premium'
    cross join lateral generate_series(1, m.months) as k(k)
  on conflict (id) do nothing;

  alter table payments enable trigger user;

  select count(*) into v_n from payments where id::text like '5eed0003-0000-4000-8000-%';
  raise notice 'Block 2: % demo payments present, all on the SEED- invoice series.', v_n;
end
$seed$;

-- ============================================================================
-- BLOCK 3 of 3 — past classes, bookings, check-ins, freeze and cancel history
-- ============================================================================
do $seed$
declare
  v_today    date := (now() at time zone 'Asia/Manila')::date;
  -- Minutes since 06:00 today, so no check-in is ever stamped in the future.
  v_open_min int := floor(extract(epoch from
                      (now() at time zone 'Asia/Manila') - (v_today + time '06:00')) / 60)::int;
  v_c int; v_b int; v_a int; v_e int;
begin
  alter table classes           disable trigger user;
  alter table bookings          disable trigger user;
  alter table attendance        disable trigger user;
  alter table membership_events disable trigger user;

  -- Six weeks back, Monday to Saturday, 07:00 and 18:00. All in the past and
  -- with no trainer: no member is offered them, no trainer's app lists them.
  insert into classes (id, name, trainer_id, level, capacity, location, class_type,
                       scheduled_at, duration_minutes, created_at)
  select ('5eed0005-0000-4000-8000-' || lpad(c.idx::text, 12, '0'))::uuid,
         (array['Morning Yoga','Strength Basics','HIIT Circuit','Boxing Fundamentals',
                'Mobility Flow','Zumba Party'])[1 + (c.idx % 6)::int],
         null,
         (array['all_levels','beginner','intermediate','advanced'])[1 + (c.idx % 4)::int]::class_level,
         12 + (c.idx % 3)::int * 4,
         (array['Studio A','Main Floor','Studio B'])[1 + (c.idx % 3)::int],
         'group',
         ((c.d + c.slot) at time zone 'Asia/Manila'),
         60,
         ((c.d - 7 + time '08:00') at time zone 'Asia/Manila')
    from (
      select row_number() over (order by g.dd, s.slot) as idx, g.dd::date as d, s.slot
        from generate_series(v_today - 42, v_today - 1, interval '1 day') as g(dd)
        cross join (values (time '07:00'), (time '18:00')) as s(slot)
       where extract(dow from g.dd) between 1 and 6
    ) c
  on conflict (id) do nothing;

  -- Premium members book often, trial members rarely, the Free Plan not at
  -- all (it cannot). One class per slot, so nobody is double-booked. Nothing
  -- is left pending: the sweep would start messaging the real admin about it.
  insert into bookings (id, member_id, class_id, status, requested_at, approved_at,
                        rejected_at, approved_by, decided_by, decided_by_role, decided_at)
  select ('5eed0006-0000-4000-8000-' || lpad((x.cidx * 1000 + x.n)::text, 12, '0'))::uuid,
         x.member_id, x.class_id,
         x.status::booking_status,
         x.requested,
         case when x.status = 'approved' then x.requested + interval '3 hours' end,
         case when x.status = 'rejected' then x.scheduled_at end,
         null, null,
         case when x.status = 'rejected' then 'system' end,
         case when x.status = 'rejected' then x.scheduled_at
              when x.status = 'approved' then x.requested + interval '3 hours' end
    from (
      select c.id as class_id, right(c.id::text, 12)::int as cidx, c.scheduled_at, c.capacity,
             m.member_id, right(m.id::text, 12)::int as n,
             c.scheduled_at - make_interval(days => 1 + (h.v % 4)::int, hours => (h.v % 9)::int)
               as requested,
             case when h.s < 80 then 'approved' when h.s < 92 then 'cancelled' else 'rejected' end
               as status,
             row_number() over (partition by c.id order by h.v) as seat
        from classes c
        join memberships m on m.id::text like '5eed0002-0000-4000-8000-%'
        join membership_plans mp on mp.id = m.plan_id
        join profiles pr on pr.id = m.member_id and pr.status = 'active'
        cross join lateral (
          select (hashtext('bk' || c.id || m.id)::bigint + 2147483648) % 100 as v,
                 (hashtext('bs' || c.id || m.id)::bigint + 2147483648) % 100 as s
        ) h
       where c.id::text like '5eed0005-0000-4000-8000-%'
         and pr.created_at < c.scheduled_at
         and ((mp.tier = 'premium' and h.v < 9) or (mp.tier = 'freemium' and h.v < 3))
    ) x
   where x.seat <= x.capacity
  on conflict (id) do nothing;

  -- Check-ins over sixty days, between opening and now. Nobody checks in
  -- while frozen, after their membership ran out, before they joined, or in
  -- the fortnight since they were suspended or archived.
  insert into attendance (id, member_id, gym_id, check_in_time, method, recorded_by, activity)
  select ('5eed0004-0000-4000-8000-' || lpad((x.n * 100 + x.k)::text, 12, '0'))::uuid,
         x.member_id, null,
         (((v_today - x.k) + time '06:00') at time zone 'Asia/Manila')
           -- Today, spread across the minutes actually elapsed since opening —
           -- clamping to "now" would stack every early-morning check-in on one time.
           + make_interval(mins => case when x.k = 0 then x.mins % greatest(v_open_min, 1) else x.mins end),
         case when x.h % 100 < 85 then 'qr' else 'manual' end::checkin_method,
         null,
         (array['Strength','Cardio','Group Class','Personal Training','Other'])[1 + (x.h % 5)::int]
    from (
      select m.member_id, right(m.id::text, 12)::int as n, d.k,
             (hashtext('in' || m.id || d.k)::bigint + 2147483648) as h,
             ((hashtext('at' || m.id || d.k)::bigint + 2147483648) % 900)::int as mins,
             mp.tier, m.status as mstatus, m.frozen_at, m.expiry_date, m.never_expires,
             pr.status as pstatus, pr.created_at as joined
        from memberships m
        join membership_plans mp on mp.id = m.plan_id
        join profiles pr on pr.id = m.member_id
        cross join generate_series(0, 59) as d(k)
       where m.id::text like '5eed0002-0000-4000-8000-%'
    ) x
   where (x.k > 0 or v_open_min > 0)
     and ((v_today - x.k) + time '06:00') at time zone 'Asia/Manila' >= x.joined - interval '1 day'
     and (x.pstatus = 'active' or x.k > 14)
     and (x.frozen_at is null or (v_today - x.k) < x.frozen_at)
     and (x.never_expires or x.expiry_date is null or (v_today - x.k) <= x.expiry_date)
     and (x.h % 100) < case
           when x.k = 0 then 22
           when extract(dow from v_today - x.k) = 0 then 10
           when x.tier = 'premium' then 45
           when x.tier = 'freemium' then 35
           else 20
         end
  on conflict (id) do nothing;

  -- The freeze that explains every frozen membership, and the cancellation
  -- that explains every cancelled one — each with the reason the desk needs.
  insert into membership_events (id, membership_id, member_id, kind, reason,
                                 refund_requested, refund_note, recorded_by, created_at)
  select ('5eed0007-0000-4000-8000-' || lpad((right(m.id::text, 12)::int * 10 + 1)::text, 12, '0'))::uuid,
         m.id, m.member_id,
         case m.status when 'frozen' then 'freeze' else 'cancel' end,
         case m.status
           when 'frozen' then (array['Injury — sprained ankle, cleared to return in two weeks',
                                     'Travelling — visiting family in Batangas',
                                     'Working away — assigned to the San Jose branch for a month',
                                     'Medical — recovering from minor surgery'])
                              [1 + (right(m.id::text, 12)::int % 4)]
           else (array['Moving away — relocating to Calapan',
                       'Too expensive — will come back after harvest season',
                       'Not using it — schedule changed at work',
                       'Went elsewhere — a gym closer to home'])
                [1 + (right(m.id::text, 12)::int % 4)]
         end,
         m.status = 'cancelled' and right(m.id::text, 12)::int % 3 = 0,
         case when m.status = 'cancelled' and right(m.id::text, 12)::int % 3 = 0
              then 'Asked about a refund. Walked them through the policy and the quote.' end,
         null,
         ((coalesce(m.frozen_at, v_today - 5) + time '11:00') at time zone 'Asia/Manila')
    from memberships m
   where m.id::text like '5eed0002-0000-4000-8000-%'
     and m.status in ('frozen', 'cancelled')
  on conflict (id) do nothing;

  -- An older freeze and its unfreeze for some active Premium members, so the
  -- freeze history and the "days frozen this year" counter have something to show.
  insert into membership_events (id, membership_id, member_id, kind, reason,
                                 refund_requested, recorded_by, created_at)
  select ('5eed0007-0000-4000-8000-' || lpad((right(m.id::text, 12)::int * 10 + e.j)::text, 12, '0'))::uuid,
         m.id, m.member_id,
         case e.j when 2 then 'freeze' else 'unfreeze' end,
         case e.j when 2 then 'Travelling — town fiesta week, back after' end,
         false, null,
         (((v_today - 70 - (right(m.id::text, 12)::int % 20)) + time '10:00') at time zone 'Asia/Manila')
           + case e.j when 3 then make_interval(days => 7 + (right(m.id::text, 12)::int % 8)) else interval '0' end
    from memberships m
    join membership_plans mp on mp.id = m.plan_id and mp.tier = 'premium'
    cross join (values (2), (3)) as e(j)
   where m.id::text like '5eed0002-0000-4000-8000-%'
     and m.status = 'active'
     and right(m.id::text, 12)::int % 4 = 0
  on conflict (id) do nothing;

  alter table classes           enable trigger user;
  alter table bookings          enable trigger user;
  alter table attendance        enable trigger user;
  alter table membership_events enable trigger user;

  select count(*) into v_c from classes           where id::text like '5eed0005-0000-4000-8000-%';
  select count(*) into v_b from bookings          where id::text like '5eed0006-0000-4000-8000-%';
  select count(*) into v_a from attendance        where id::text like '5eed0004-0000-4000-8000-%';
  select count(*) into v_e from membership_events where id::text like '5eed0007-0000-4000-8000-%';
  raise notice 'Block 3: % classes, % bookings, % check-ins, % freeze/cancel events.', v_c, v_b, v_a, v_e;
end
$seed$;
