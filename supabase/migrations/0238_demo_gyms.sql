-- ============================================================================
-- 0238 — Fifty demo gyms for a load test, built and removed from the platform
-- ============================================================================
--
-- The evaluators asked (2026-11-08) for 50 gyms with 200 members each — real
-- accounts that sign in — and an easy way to remove them afterwards, on the
-- free Supabase plan. The owner's answers:
--
--   * Two buttons on the platform (super admin) app: Create demo gyms and
--     Remove demo gyms, typed confirmation, a progress bar.
--   * Per gym: 1 owner, 1 front desk, 3 coaches, 200 members; ~6 months of
--     payments, check-ins (about one a week each), points for the last 30
--     days, badges each member truly met, 1-on-1 packages and sessions, chats.
--   * Made-up Filipino names in real Philippine towns; listed publicly with a
--     Demo mark (gyms.is_demo, list_gyms puts real gyms first); a mix of the
--     Growth and Pro plans, never billed (paid until 2099, like Lab 2).
--   * Sign-in by username — gym07.owner, gym07.desk, gym07.coach1..3,
--     gym07.m001..m200 — one shared password chosen by the platform app; the
--     address behind each is a stand-in <username>@no-email.invalid (0236:
--     never mailed, never shown).
--
-- HOW. A request from the app has 8 seconds (statement_timeout), so the work
-- is in steps the platform app calls one after another:
--   demo_gym_step(n, step, password)   n = 1..50, step 1..6
--     1  the gym, its settings, priced plans, owner, desk, 3 coaches, hours,
--        equipment, rewards
--     2..5  members, 50 per step: account, profile, membership, payments,
--        check-ins
--     6  packages, 1-on-1 sessions, chats, points (last 30 days), badges
--   demo_remove_step(n, step)          step 1 the gym's rows, step 2 its people
--   demo_summary()                     what exists, for the buttons
-- Every id a step writes starts with de3a<NNNN>- (the gym's number), so a
-- step can be run again (it skips what exists) and removal finds every row.
-- While a step writes, the tables it touches have their user triggers paused
-- (inside the step's own transaction — an error undoes everything, the
-- triggers included): a demo payment must not notify, push, award points or
-- write the activity log 10,000 times.
--
-- Only a platform admin may call any of this (is_platform_admin()).
-- ============================================================================

alter table gyms add column if not exists is_demo boolean not null default false;

-- What the buttons read and write: one row per demo gym, its steps done.
create table if not exists demo_gyms (
  n          int primary key check (n between 1 and 99),
  gym_id     uuid,
  name       text not null,
  town       text not null,
  steps_done int not null default 0,
  updated_at timestamptz not null default now()
);
alter table demo_gyms enable row level security;   -- no policy: definer functions only
revoke all on demo_gyms from anon, authenticated;

-- ---- ids --------------------------------------------------------------------
-- de3a<gym>-<kind>-4000-8000-<i>. Kinds: 0000 the gym, 0001 people (1 owner,
-- 2 desk, 3..5 coaches, 101..300 members), 0002 memberships, 0003 payments,
-- 0004 check-ins, 0005 conversations, 0006 messages, 0007 1-on-1 sessions,
-- 0008 packages.
create or replace function demo_uid(p_n int, p_kind int, p_i bigint) returns uuid
language sql immutable as $$
  select format('de3a%s-%s-4000-8000-%s', lpad(p_n::text, 4, '0'), lpad(p_kind::text, 4, '0'), lpad(p_i::text, 12, '0'))::uuid
$$;
revoke execute on function demo_uid(int, int, bigint) from public, anon, authenticated;

-- A demo gym's town and province (two plain lists: a 2-D slice would come back nested).
create or replace function demo_town(p_n int) returns text[]
language sql immutable as $$
  select array[(array['Mamburao', 'Calapan', 'San Jose', 'Batangas City', 'Lipa', 'Lucena', 'Puerto Princesa', 'Iloilo City', 'Bacolod', 'Cebu City', 'Mandaue', 'Lapu-Lapu', 'Tagbilaran', 'Dumaguete', 'Tacloban', 'Ormoc', 'Cagayan de Oro', 'Iligan', 'Davao City', 'General Santos', 'Zamboanga City', 'Butuan', 'Surigao City', 'Koronadal', 'Cotabato City', 'Legazpi', 'Naga', 'Sorsogon City', 'Masbate City', 'Baguio', 'Dagupan', 'San Fernando', 'Vigan', 'Laoag', 'Tuguegarao', 'Santiago', 'Cabanatuan', 'Angeles', 'Olongapo', 'Malolos', 'Antipolo', 'Tagaytay', 'Calamba', 'San Pablo', 'Odiongan', 'Boac', 'Roxas City', 'Kalibo', 'Tacurong', 'Marawi'])[1 + (p_n - 1) % 50],
               (array['Occidental Mindoro', 'Oriental Mindoro', 'Occidental Mindoro', 'Batangas', 'Batangas', 'Quezon', 'Palawan', 'Iloilo', 'Negros Occidental', 'Cebu', 'Cebu', 'Cebu', 'Bohol', 'Negros Oriental', 'Leyte', 'Leyte', 'Misamis Oriental', 'Lanao del Norte', 'Davao del Sur', 'South Cotabato', 'Zamboanga del Sur', 'Agusan del Norte', 'Surigao del Norte', 'South Cotabato', 'Maguindanao', 'Albay', 'Camarines Sur', 'Sorsogon', 'Masbate', 'Benguet', 'Pangasinan', 'La Union', 'Ilocos Sur', 'Ilocos Norte', 'Cagayan', 'Isabela', 'Nueva Ecija', 'Pampanga', 'Zambales', 'Bulacan', 'Rizal', 'Cavite', 'Laguna', 'Laguna', 'Romblon', 'Marinduque', 'Capiz', 'Aklan', 'Sultan Kudarat', 'Lanao del Sur'])[1 + (p_n - 1) % 50]]
$$;
revoke execute on function demo_town(int) from public, anon, authenticated;

create or replace function demo_first(p_k int) returns text language sql immutable as $$
  select (array['Andrea','Bea','Carlo','Dan','Ella','Franco','Gia','Hans','Ivy','Jomar','Kat','Leo','Mika','Nico',
                'Olive','Pia','Quino','Rhea','Sam','Tess','Aira','Bong','Carmela','Dindo','Erica','Fritz','Grace','Harold',
                'Ines','Jun','Kristine','Lito','Marites','Nestor','Oscar','Princess','Ramon','Shiela','Tonyo','Vilma'])[1 + abs(p_k) % 40]
$$;
create or replace function demo_last(p_k int) returns text language sql immutable as $$
  select (array['Santos','Cruz','Bautista','Ocampo','Garcia','Mendoza','Torres','Flores','Ramos','Aquino',
                'Castillo','Navarro','Del Rosario','Pascual','Salazar','Manalo','Lopez','Tolentino','Villanueva','Reyes',
                'Dimaculangan','Soriano','Abad','Tan','Lim','Gonzales','Dela Cruz','Mercado','Aguilar','Valdez',
                'Fernandez','Morales','Rivera','Domingo','Gutierrez','Serrano','Padilla','Medina','Sarmiento','Javier'])[1 + abs(p_k) % 40]
$$;
revoke execute on function demo_first(int) from public, anon, authenticated;
revoke execute on function demo_last(int) from public, anon, authenticated;

-- The user triggers of the tables a step writes, paused or back on (inside the step's transaction).
create or replace function demo_triggers(p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
declare t text;
begin
  foreach t in array array['gyms', 'gym_settings', 'membership_plans', 'plan_features', 'profiles', 'gym_roles',
                           'member_profiles', 'trainer_profiles', 'trainer_availability', 'memberships', 'payments',
                           'attendance', 'pt_sessions', 'coachings', 'conversations', 'messages', 'point_ledger',
                           'achievement_unlocks', 'rewards', 'gym_equipment', 'notifications'] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I %s trigger user', t, case when p_on then 'enable' else 'disable' end);
    end if;
  end loop;
end;
$$;
revoke execute on function demo_triggers(boolean) from public, anon, authenticated;

-- One account: sign-in (auth.users + identity, every token column a string — GoTrue
-- breaks on NULL), profile, the gym role.
create or replace function demo_account(p_id uuid, p_gym uuid, p_username text, p_first text, p_last text,
                                        p_role user_role, p_hash text, p_phone text, p_joined timestamptz)
returns void language plpgsql security definer set search_path = public as $$
declare v_email text := p_username || '@no-email.invalid';
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                          confirmation_token, recovery_token, email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated', v_email, p_hash, now(),
          '{"provider":"email","providers":["email"]}'::jsonb,
          jsonb_build_object('first_name', p_first, 'last_name', p_last, 'demo', true), p_joined, now(), '', '', '', '')
  on conflict (id) do nothing;
  insert into auth.identities (user_id, provider, provider_id, identity_data, created_at, updated_at)
  select p_id, 'email', p_id::text, jsonb_build_object('sub', p_id::text, 'email', v_email, 'email_verified', true), now(), now()
   where not exists (select 1 from auth.identities i where i.user_id = p_id and i.provider = 'email');
  insert into profiles (id, role, first_name, last_name, email, phone, status, active_gym_id, username, created_at)
  values (p_id, p_role, p_first, p_last, v_email, p_phone, 'active', p_gym, p_username, p_joined)
  on conflict (id) do update set role = excluded.role, first_name = excluded.first_name, last_name = excluded.last_name,
                                 status = 'active', active_gym_id = excluded.active_gym_id, username = excluded.username;
  insert into gym_roles (gym_id, user_id, role, status)
  values (p_gym, p_id, p_role, 'active')
  on conflict (gym_id, user_id) do update set role = excluded.role, status = 'active';
end;
$$;
revoke execute on function demo_account(uuid, uuid, text, text, text, user_role, text, text, timestamptz) from public, anon, authenticated;

create or replace function demo_gym_step(p_n int, p_step int, p_password text) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_gym     uuid := demo_uid(p_n, 0, 0);
  v_town    text[] := demo_town(p_n);
  v_tag     text := lpad(p_n::text, 2, '0');
  v_prefix  text := (array['Iron Haven', 'Peak Form', 'Forge Fitness', 'Pulse Gym', 'Titan Strength', 'Summit Fitness',
                           'Core Strength', 'Flex Point', 'Apex Gym', 'Grit House'])[1 + (p_n - 1) % 10];
  v_name    text;
  v_slug    text;
  v_today   date := manila_today();
  v_hash    text;
  v_owner   uuid := demo_uid(p_n, 1, 1);
  v_desk    uuid := demo_uid(p_n, 1, 2);
  v_free    uuid; v_monthly uuid; v_premium uuid;
  v_from    int; v_to int;
  v_col     text;
  v_hour    int := extract(hour from now() at time zone 'Asia/Manila')::int;
begin
  if not is_platform_admin() then
    raise exception 'Only the platform can build demo gyms.' using errcode = '42501';
  end if;
  if p_n not between 1 and 50 or p_step not between 1 and 6 then
    raise exception 'Demo gyms are 1 to 50, steps 1 to 6.';
  end if;
  if coalesce(length(p_password), 0) < 8 then
    raise exception 'The shared password needs at least 8 characters.';
  end if;
  v_name := v_prefix || ' ' || v_town[1];
  v_slug := 'demo-' || v_tag || '-' || btrim(regexp_replace(lower(v_town[1]), '[^a-z0-9]+', '-', 'g'), '-');
  if p_step > 1 and not exists (select 1 from gyms where id = v_gym) then
    raise exception 'Demo gym % has not been started — run step 1 first.', p_n;
  end if;
  -- One hash for the whole step: the same shared password, salted once.
  v_hash := extensions.crypt(p_password, extensions.gen_salt('bf'));

  perform demo_triggers(false);

  if p_step = 1 then
    insert into gyms (id, name, slug, status, plan, paid_until, onboarded_at, hidden, is_demo, created_at)
    values (v_gym, v_name, v_slug, 'active', case when p_n % 3 = 0 then 'pro' else 'growth' end, date '2099-12-31',
            now() - interval '200 days', false, true, now() - interval '200 days')
    on conflict (id) do nothing;
    perform seed_gym_defaults(v_gym);
    update gym_settings set
        gym_name = v_name, short_name = split_part(v_prefix, ' ', 1),
        tagline = (array['Train hard, train here', 'Stronger every week', 'Your town''s gym', 'Show up, level up'])[1 + p_n % 4],
        address = 'Poblacion, ' || v_town[1] || ', ' || v_town[2],
        phone = '+63 9' || lpad(((p_n * 7919) % 1000000000)::text, 9, '0'),
        opening_time = '06:00', closing_time = '22:00',
        accent = (array['violet','indigo','blue','teal','emerald','rose','orange','sky','cyan','lime','fuchsia','slate'])[1 + (p_n - 1) % 12],
        welcome_message = 'Demo gym — made-up members and history for testing Core Fitness.',
        join_policy = 'open', join_approval = 'desk', min_age = 16, waiver_required = false,
        pt_booking_approval = 'coach', coaching_modes = array['pick_pt', 'desk_assigns', 'coach_invites'],
        coaching_lengths = array[1, 3, 6], coaching_fee_mode = 'included'
     where gym_id = v_gym;
    update membership_plans set price = case name when 'Monthly' then 700 + (p_n % 4) * 100 when 'Premium' then 1300 + (p_n % 5) * 100 else 0 end,
                                price_unset = false
     where gym_id = v_gym;
    insert into demo_gyms (n, gym_id, name, town) values (p_n, v_gym, v_name, v_town[1] || ', ' || v_town[2])
    on conflict (n) do update set gym_id = excluded.gym_id, name = excluded.name, town = excluded.town;

    perform demo_account(v_owner, v_gym, 'gym' || v_tag || '.owner', demo_first(p_n * 3), demo_last(p_n * 5), 'admin', v_hash,
                         '+63 917 ' || lpad((p_n * 101)::text, 7, '0'), now() - interval '200 days');
    perform demo_account(v_desk, v_gym, 'gym' || v_tag || '.desk', demo_first(p_n * 3 + 1), demo_last(p_n * 5 + 1), 'staff', v_hash,
                         '+63 917 ' || lpad((p_n * 101 + 1)::text, 7, '0'), now() - interval '200 days');
    for i in 1 .. 3 loop
      perform demo_account(demo_uid(p_n, 1, 2 + i), v_gym, 'gym' || v_tag || '.coach' || i, demo_first(p_n * 3 + 1 + i), demo_last(p_n * 5 + 1 + i),
                           'trainer', v_hash, '+63 917 ' || lpad((p_n * 101 + 1 + i)::text, 7, '0'), now() - interval '200 days');
      insert into trainer_profiles (profile_id, gym_id, specialization, bio, years_experience, certifications, focus_areas, presence)
      values (demo_uid(p_n, 1, 2 + i), v_gym,
              (array['Strength and conditioning', 'Mobility and yoga', 'Boxing and conditioning'])[i],
              (array['Lifts, form first, then the numbers.', 'Steady, gentle and serious about form.', 'Pads, footwork and conditioning.'])[i],
              3 + (p_n + i) % 8, array['NASM CPT'], array[(array['Strength', 'Mobility', 'Boxing'])[i], 'Beginners'], 'available')
      on conflict do nothing;
      insert into trainer_availability (gym_id, trainer_id, day_of_week, start_time, end_time, slot_minutes)
      select v_gym, demo_uid(p_n, 1, 2 + i), d, s.st, s.en, 60
        from generate_series(1, 6) d
        cross join (values (time '07:00', time '11:00'), (time '15:00', time '19:00')) as s(st, en)
       where not exists (select 1 from trainer_availability t where t.trainer_id = demo_uid(p_n, 1, 2 + i));
    end loop;

    insert into gym_equipment (gym_id, name, category, quantity, location_note, status, sort_order)
    select v_gym, x.name, x.cat, x.qty, x.loc, 'available', x.k
      from (values (1, 'Treadmill', 'cardio', 4, 'By the windows'), (2, 'Spin bike', 'cardio', 6, 'Studio'),
                   (3, 'Leg press', 'machines', 1, 'Back wall'), (4, 'Dumbbells 2.5–40 kg', 'free_weights', 1, 'Mirror wall'),
                   (5, 'Squat rack', 'benches_racks', 2, 'Platforms'), (6, 'Adjustable bench', 'benches_racks', 4, 'Mirror wall'))
           as x(k, name, cat, qty, loc)
     where not exists (select 1 from gym_equipment e where e.gym_id = v_gym);
    insert into rewards (gym_id, name, description, cost_points, stock, is_active, category, featured)
    select v_gym, x.name, x.descr, x.cost, x.stock, true, x.cat, x.k = 1
      from (values (1, 'Free protein shake', 'One shake from the counter.', 150, 30, 'Drinks'),
                   (2, 'Gym shirt', 'Dri-fit, in your size.', 800, 12, 'Gear'),
                   (3, 'Day pass for a friend', 'Bring someone along for a day.', 400, null, 'Passes')) as x(k, name, descr, cost, stock, cat)
     where not exists (select 1 from rewards r where r.gym_id = v_gym);

  elsif p_step between 2 and 5 then
    select id into v_free    from membership_plans where gym_id = v_gym and name = 'Free';
    select id into v_monthly from membership_plans where gym_id = v_gym and name = 'Monthly';
    select id into v_premium from membership_plans where gym_id = v_gym and name = 'Premium';
    v_from := (p_step - 2) * 50 + 1;
    v_to   := v_from + 49;

    create temp table if not exists _demo_people (i int, id uuid, first text, last text, kind text, joined int, thr int) on commit drop;
    truncate _demo_people;
    insert into _demo_people
    select i, demo_uid(p_n, 1, 100 + i), demo_first(p_n * 7 + i * 3), demo_last(p_n * 11 + i * 7),
           case when (i * 37 + p_n * 11) % 20 < 8 then 'premium' when (i * 37 + p_n * 11) % 20 < 14 then 'monthly'
                when (i * 37 + p_n * 11) % 20 < 17 then 'free' when (i * 37 + p_n * 11) % 20 < 19 then 'expired' else 'frozen' end,
           60 + (i * 13 + p_n * 7) % 121,
           (array[1, 2, 2, 3])[1 + (i * 7 + p_n) % 4]
      from generate_series(v_from, v_to) i;

    perform demo_account(p.id, v_gym, 'gym' || v_tag || '.m' || lpad(p.i::text, 3, '0'), p.first, p.last, 'member', v_hash,
                         '+639' || lpad(((170000000 + p_n * 100003 + p.i * 7919) % 1000000000)::text, 9, '0'),
                         now() - make_interval(days => p.joined))
      from _demo_people p;
    insert into member_profiles (profile_id, gym_id, qr_code, experience_level, gender, address, onboarding_completed_at,
                                 terms_accepted_at, show_on_boards, streak_target, created_at)
    select p.id, v_gym, p.id::text, (array['beginner','intermediate','advanced'])[1 + p.i % 3],
           (array['female','male','prefer_not_to_say'])[1 + p.i % 3], 'Poblacion, ' || v_town[1],
           now() - make_interval(days => p.joined), now() - make_interval(days => p.joined), p.i % 4 <> 0, 2 + p.i % 2,
           now() - make_interval(days => p.joined)
      from _demo_people p
    on conflict do nothing;

    insert into memberships (id, gym_id, member_id, plan_id, status, start_date, expiry_date, never_expires, frozen_at, created_at)
    select demo_uid(p_n, 2, p.i), v_gym, p.id,
           case p.kind when 'premium' then v_premium when 'frozen' then v_premium when 'free' then v_free else v_monthly end,
           (case p.kind when 'expired' then 'expired' when 'frozen' then 'frozen' else 'active' end)::membership_status,
           case p.kind when 'expired' then v_today - 45 - p.i % 20 when 'frozen' then v_today - 12 else v_today - (p.i * 3 + p_n) % 28 end,
           case p.kind when 'free' then null when 'expired' then v_today - 16 - p.i % 20 when 'frozen' then v_today + 17
                       else v_today - (p.i * 3 + p_n) % 28 + 29 end,
           p.kind = 'free', case when p.kind = 'frozen' then v_today - 5 end,
           now() - make_interval(days => (p.i * 3 + p_n) % 28)
      from _demo_people p
    on conflict (id) do nothing;

    -- Up to six months of payments at the desk, never before they joined.
    insert into payments (id, gym_id, member_id, membership_id, amount, method, status, paid_on, invoice_number,
                          recorded_by, plan_id, plan_name, created_at)
    select demo_uid(p_n, 3, p.i * 10 + k), v_gym, p.id, case when k = 0 then m.id end, pl.price,
           case when (p.i + k) % 4 = 0 then 'GCash' else 'Cash' end, 'completed', m.start_date - 30 * k,
           'DEMO' || v_tag || '-' || lpad(p.i::text, 3, '0') || '-' || k, v_desk, pl.id, pl.name,
           ((m.start_date - 30 * k) + time '09:30') at time zone 'Asia/Manila'
      from _demo_people p
      join memberships m on m.id = demo_uid(p_n, 2, p.i)
      join membership_plans pl on pl.id = m.plan_id
      cross join generate_series(0, 5) k
     where pl.price > 0 and k <= (p.i + p_n) % 6 and m.start_date - 30 * k >= v_today - p.joined
    on conflict (id) do nothing;

    -- Check-ins: about one a week each, regulars more; none while frozen or after it ran out.
    insert into attendance (id, gym_id, member_id, check_in_time, method, recorded_by, activity)
    select demo_uid(p_n, 4, p.i * 1000 + d), v_gym, p.id,
           ((v_today - d) + make_time(6 + (p.i * 5 + d) % 14, (p.i * 13 + d * 7) % 60, 0)) at time zone 'Asia/Manila',
           (case when (p.i + d) % 3 = 0 then 'manual' else 'qr' end)::checkin_method,
           case when (p.i + d) % 3 = 0 then v_desk end,
           (array['Gym floor', 'Gym floor', 'Gym floor', 'Cardio', 'Strength'])[1 + (p.i + d) % 5]
      from _demo_people p
      cross join generate_series(0, 179) d
     where d <= p.joined
       and ((p.i * 31 + d * 17 + p_n * 5) % 14) < case when p.kind = 'free' then 1 else p.thr end
       and not (p.kind = 'expired' and d <= 16) and not (p.kind = 'frozen' and d <= 5)
       and (d > 0 or 6 + (p.i * 5) % 14 < v_hour)
    on conflict (id) do nothing;

  else
    -- 6: each coach takes eight package trainees: sessions every week, chats.
    insert into coachings (id, gym_id, member_id, trainer_id, kind, months, status, fee_mode, starts_on, ends_on, started_by)
    select demo_uid(p_n, 8, i), v_gym, demo_uid(p_n, 1, 100 + i), demo_uid(p_n, 1, 3 + i % 3), 'pt', 3, 'active', 'included',
           v_today - 30 - i % 40, v_today + 60 - i % 40, 'desk'
      from generate_series(1, 24) i
     where exists (select 1 from profiles where id = demo_uid(p_n, 1, 100 + i))
    on conflict (id) do nothing;
    insert into pt_sessions (id, gym_id, trainer_id, member_id, starts_at, duration_minutes, status, notes,
                             requested_at, approved_at, decided_by, decided_by_role, decided_at)
    select demo_uid(p_n, 7, i * 100 + w + 20), v_gym, demo_uid(p_n, 1, 3 + i % 3), demo_uid(p_n, 1, 100 + i),
           ((v_today + w * 7 + i % 5) + make_time(8 + i % 10, 0, 0)) at time zone 'Asia/Manila', 60,
           (case when w = 1 and i % 3 = 0 then 'pending' else 'approved' end)::booking_status,
           case when w < 0 then 'Session notes: form check, then conditioning.' end,
           now() + make_interval(days => w * 7 - 3),
           case when not (w = 1 and i % 3 = 0) then now() + make_interval(days => w * 7 - 2) end,
           case when not (w = 1 and i % 3 = 0) then demo_uid(p_n, 1, 3 + i % 3) end,
           case when not (w = 1 and i % 3 = 0) then 'trainer' end,
           case when not (w = 1 and i % 3 = 0) then now() + make_interval(days => w * 7 - 2) end
      from generate_series(1, 24) i cross join generate_series(-6, 1) w
     where exists (select 1 from profiles where id = demo_uid(p_n, 1, 100 + i))
    on conflict (id) do nothing;
    insert into conversations (id, gym_id, member_id, trainer_id, created_at, last_message_at, member_read_at, trainer_read_at)
    select demo_uid(p_n, 5, i), v_gym, demo_uid(p_n, 1, 100 + i), demo_uid(p_n, 1, 3 + i % 3),
           now() - interval '20 days', now() - make_interval(hours => i), now() - make_interval(hours => i), now() - make_interval(hours => i + 2)
      from generate_series(1, 24) i
     where exists (select 1 from profiles where id = demo_uid(p_n, 1, 100 + i))
    on conflict (id) do nothing;
    insert into messages (id, gym_id, conversation_id, sender_id, body, created_at)
    select demo_uid(p_n, 6, i * 10 + k), v_gym, demo_uid(p_n, 5, i),
           case when k % 2 = 1 then demo_uid(p_n, 1, 100 + i) else demo_uid(p_n, 1, 3 + i % 3) end,
           (array['Coach, can we move Thursday to 6 PM?', 'Sure — 6 PM Thursday works. Bring your lifting shoes.',
                  'Thank you! Legs were sore after last time.', 'Good sore. Walk it off and drink water — see you Thursday.'])[k],
           now() - make_interval(hours => i + (4 - k) * 3)
      from generate_series(1, 24) i cross join generate_series(1, 4) k
     where exists (select 1 from conversations where id = demo_uid(p_n, 5, i))
    on conflict (id) do nothing;

    -- Points for the last 30 days of check-ins, at the gym's own rate.
    insert into point_ledger (gym_id, member_id, rule_key, points, source_table, source_id, created_at)
    select v_gym, a.member_id, 'checkin', coalesce((select points from point_rules where gym_id = v_gym and key = 'checkin'), 10),
           'attendance', a.id, a.check_in_time
      from attendance a
     where a.gym_id = v_gym and a.check_in_time > now() - interval '30 days'
       and not exists (select 1 from point_ledger l where l.source_table = 'attendance' and l.source_id = a.id);

    -- The badges each member has truly met, by their own check-ins and time as a member.
    insert into achievement_unlocks (user_id, achievement_key, unlocked_on, seen, gym_id)
    select s.member_id, b.key, v_today - 1, true, v_gym
      from (select a.member_id, count(distinct (a.check_in_time at time zone 'Asia/Manila')::date) as days
              from attendance a where a.gym_id = v_gym group by a.member_id) s
      join profiles pr on pr.id = s.member_id
      cross join lateral (values ('first_checkin', s.days >= 1), ('days_10', s.days >= 10), ('days_25', s.days >= 25),
                                 ('days_50', s.days >= 50),
                                 ('loyal_six_months', pr.created_at <= now() - interval '180 days')) as b(key, met)
     where b.met
       and exists (select 1 from achievements x where x.gym_id = v_gym and x.key = b.key)
       and not exists (select 1 from achievement_unlocks u where u.user_id = s.member_id and u.achievement_key = b.key);
  end if;

  perform demo_triggers(true);
  update demo_gyms set steps_done = greatest(steps_done, p_step), updated_at = now() where n = p_n;
  return format('Demo gym %s (%s): step %s of 6 done.', p_n, v_name, p_step);
end;
$$;
revoke execute on function demo_gym_step(int, int, text) from public, anon;
grant execute on function demo_gym_step(int, int, text) to authenticated;

-- ---- removal ------------------------------------------------------------------
-- Step 1: every row the gym holds (children first, by retrying). Step 2: its people —
-- every row pointing at them, their profiles, the gym, then their sign-ins.
create or replace function demo_remove_step(p_n int, p_step int) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_gym    uuid := demo_uid(p_n, 0, 0);
  v_people uuid[];
  t        record;
  fk       record;
  v_pass   int;
  v_left   boolean;
  v_tabs   text[] := '{}';
  v_name   text;
begin
  if not is_platform_admin() then
    raise exception 'Only the platform can remove demo gyms.' using errcode = '42501';
  end if;
  if p_step not between 1 and 2 then raise exception 'Removal has two steps.'; end if;
  -- Only ever a gym this migration made, and marked as a demo.
  if not exists (select 1 from gyms where id = v_gym and is_demo) then
    delete from demo_gyms where n = p_n;
    return format('Demo gym %s is already gone.', p_n);
  end if;
  select name into v_name from gyms where id = v_gym;
  select coalesce(array_agg(id), '{}') into v_people from profiles where id::text like 'de3a' || lpad(p_n::text, 4, '0') || '-0001-%';

  -- Pause the user triggers of every table holding this gym's rows (refusals, logs, points).
  for t in
    select c.table_name from information_schema.columns c
      join information_schema.tables x on x.table_schema = c.table_schema and x.table_name = c.table_name
     where c.table_schema = 'public' and c.column_name = 'gym_id' and x.table_type = 'BASE TABLE'
  loop
    execute format('select exists (select 1 from public.%I where gym_id = $1)', t.table_name) into v_left using v_gym;
    if v_left then v_tabs := v_tabs || t.table_name::text; end if;
  end loop;
  v_tabs := v_tabs || array['profiles', 'member_profiles', 'trainer_profiles', 'gym_roles', 'gyms'];
  for t in select unnest(v_tabs) as tbl loop
    execute format('alter table public.%I disable trigger user', t.tbl);
  end loop;

  if p_step = 1 then
    for v_pass in 1 .. 12 loop
      v_left := false;
      for t in
        select c.table_name from information_schema.columns c
          join information_schema.tables x on x.table_schema = c.table_schema and x.table_name = c.table_name
         where c.table_schema = 'public' and c.column_name = 'gym_id' and x.table_type = 'BASE TABLE'
           and c.table_name not in ('profiles', 'member_profiles', 'trainer_profiles', 'gym_roles')
      loop
        begin
          execute format('delete from public.%I where gym_id = $1', t.table_name) using v_gym;
        exception when foreign_key_violation or restrict_violation then v_left := true;
        end;
      end loop;
      exit when not v_left;
    end loop;
  else
    for v_pass in 1 .. 12 loop
      v_left := false;
      -- Anything still pointing at the gym by another column (a person's current gym): cleared.
      for fk in
        select c.conrelid::regclass::text as tbl, a.attname as col, a.attnotnull as notnull
          from pg_constraint c
          cross join lateral unnest(c.conkey, c.confkey) as k(att, fatt)
          join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.att
         where c.contype = 'f' and c.connamespace = 'public'::regnamespace
           and c.confrelid = 'public.gyms'::regclass
      loop
        begin
          if fk.notnull then execute format('delete from %s where %I = $1', fk.tbl, fk.col) using v_gym;
          else execute format('update %s set %I = null where %I = $1', fk.tbl, fk.col, fk.col) using v_gym; end if;
        exception when foreign_key_violation or restrict_violation or not_null_violation or check_violation then v_left := true;
        end;
      end loop;
      -- Every row pointing at one of its people: gone, or a nullable "recorded by" cleared.
      for fk in
        select c.conrelid::regclass::text as tbl, a.attname as col, a.attnotnull as notnull
          from pg_constraint c
          cross join lateral unnest(c.conkey, c.confkey) as k(att, fatt)
          join pg_attribute a  on a.attrelid = c.conrelid and a.attnum = k.att
          join pg_attribute fa on fa.attrelid = c.confrelid and fa.attnum = k.fatt
         where c.contype = 'f' and c.connamespace = 'public'::regnamespace
           and c.confrelid in ('public.profiles'::regclass, 'public.member_profiles'::regclass,
                               'public.trainer_profiles'::regclass, 'auth.users'::regclass)
           and fa.attname in ('id', 'profile_id')
           and c.conrelid not in ('public.profiles'::regclass, 'public.member_profiles'::regclass, 'public.trainer_profiles'::regclass)
      loop
        begin
          if fk.notnull then execute format('delete from %s where %I = any ($1)', fk.tbl, fk.col) using v_people;
          else execute format('update %s set %I = null where %I = any ($1)', fk.tbl, fk.col, fk.col) using v_people; end if;
        exception when foreign_key_violation or restrict_violation or not_null_violation or check_violation then v_left := true;
        end;
      end loop;
      begin delete from member_profiles  where profile_id = any (v_people); exception when foreign_key_violation or restrict_violation then v_left := true; end;
      begin delete from trainer_profiles where profile_id = any (v_people); exception when foreign_key_violation or restrict_violation then v_left := true; end;
      begin delete from gym_roles        where user_id = any (v_people) or gym_id = v_gym; exception when foreign_key_violation or restrict_violation then v_left := true; end;
      begin delete from profiles         where id = any (v_people); exception when foreign_key_violation or restrict_violation then v_left := true; end;
      begin delete from gyms             where id = v_gym; exception when foreign_key_violation or restrict_violation then v_left := true; end;
      exit when not v_left;
    end loop;
    delete from auth.users where id = any (v_people);
    delete from demo_gyms where n = p_n;
  end if;

  for t in select unnest(v_tabs) as tbl loop
    if to_regclass('public.' || t.tbl) is not null then
      execute format('alter table public.%I enable trigger user', t.tbl);
    end if;
  end loop;
  return format('Demo gym %s (%s): removal step %s of 2 done.', p_n, coalesce(v_name, '?'), p_step);
end;
$$;
revoke execute on function demo_remove_step(int, int) from public, anon;
grant execute on function demo_remove_step(int, int) to authenticated;

-- What exists, for the buttons and the login list.
create or replace function demo_summary()
returns table (n int, name text, town text, slug text, plan text, steps_done int, members bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_platform_admin() then
    raise exception 'Only the platform can see demo gyms.' using errcode = '42501';
  end if;
  return query
    select d.n, d.name, d.town, g.slug, g.plan, d.steps_done,
           (select count(*) from gym_roles r where r.gym_id = d.gym_id and r.role = 'member')
      from demo_gyms d left join gyms g on g.id = d.gym_id
     order by d.n;
end;
$$;
revoke execute on function demo_summary() from public, anon;
grant execute on function demo_summary() to authenticated;

-- ---- the public gym list: real gyms first, demo gyms after them, marked ----
drop function if exists list_gyms(text);
create or replace function list_gyms(p_search text default null)
returns table (id uuid, slug text, name text, short_name text, logo_url text, accent text, accent_action text, tagline text, is_demo boolean)
language sql stable security definer set search_path = public as $$
  select g.id, g.slug, g.name, s.short_name, s.logo_url, coalesce(s.accent, 'violet'), s.accent_action,
         nullif(btrim(coalesce(s.tagline, '')), ''), g.is_demo
    from gyms g left join gym_settings s on s.gym_id = g.id
   where g.status = 'active' and g.id <> gym_one() and not g.hidden
     and coalesce(s.join_policy, 'open') = 'open'
     and (p_search is null or g.name ilike '%' || p_search || '%' or g.slug ilike '%' || p_search || '%')
   order by g.is_demo, g.name
   limit 120;
$$;
grant execute on function list_gyms(text) to anon, authenticated;

-- The phone app's "Find a gym" (0182): the same Demo mark, real gyms first.
drop function if exists gym_finder(text);
create or replace function gym_finder(p_search text default null)
returns table (id uuid, slug text, name text, short_name text, logo_url text, accent text, tagline text,
               join_policy text, latitude numeric, longitude numeric, address text, is_demo boolean)
language sql stable security definer set search_path = public as $$
  select g.id, g.slug, g.name, s.short_name, s.logo_url, coalesce(s.accent, 'violet'),
         nullif(btrim(coalesce(s.tagline, '')), ''),
         coalesce(s.join_policy, 'open'), g.latitude, g.longitude, nullif(btrim(coalesce(s.address, '')), ''), g.is_demo
    from gyms g left join gym_settings s on s.gym_id = g.id
   where g.status = 'active'
     and g.id <> gym_one()
     and not g.hidden
     and (nullif(btrim(coalesce(p_search, '')), '') is null
          or g.name ilike '%' || btrim(p_search) || '%' or g.slug ilike '%' || btrim(p_search) || '%'
          or coalesce(s.address, '') ilike '%' || btrim(p_search) || '%')
   order by g.is_demo, g.name
   limit 300;
$$;
grant execute on function gym_finder(text) to anon, authenticated;

create or replace function migration_0238_applied() returns boolean language sql stable as $$ select true $$;
grant execute on function migration_0238_applied() to anon, authenticated;
