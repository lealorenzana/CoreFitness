-- 0125 — Refer a friend.
-- Spec: docs/superpowers/specs/2026-09-27-referrals-design.md
--
-- ---- NOTHING IS PAID FOR SIGNING UP -------------------------------------------------------
--
-- A referral is recorded when the friend arrives in the gym through a member's
-- code, and paid only when the desk records the friend's first completed
-- payment above ₱0 — a free plan or a trial earns nothing, so inventing friends
-- costs real money. Then both are paid once: the referrer (the gym's `referral`
-- rule, at most five rewarded referrals a Manila month) and the friend
-- (`referral_welcome`), through the ledger's idempotency key.
--
-- A friend is referred once per gym, never by themselves, and never after they
-- have already paid there. `referrals` and `referral_codes` have no write
-- policy: only the functions and the two triggers below write them.
--
-- ---- TWO WAYS IN, ONE RULE ---------------------------------------------------------------
--
-- A new account carries the code in its sign-up metadata (`referral_code`); a
-- trigger on gym_roles records it when the member's row lands in that gym, and
-- swallows any refusal — a bad code must never break somebody's sign-up. An
-- existing account joining another gym calls claim_referral() after
-- request_to_join(), which reports a refusal instead.

-- ---- 1. the rules --------------------------------------------------------------------------

insert into point_rules (gym_id, key, label, points, sort_order)
select g.id, 'referral', 'A friend you invited joined and paid', 100, 10 from gyms g
on conflict (gym_id, key) do nothing;
insert into point_rules (gym_id, key, label, points, sort_order)
select g.id, 'referral_welcome', 'Welcome bonus for joining through a friend', 50, 11 from gyms g
on conflict (gym_id, key) do nothing;

-- ---- 2. codes and referrals ------------------------------------------------------------------

create table if not exists referral_codes (
  gym_id     uuid not null default acting_gym_id() references gyms(id),
  member_id  uuid not null references profiles(id) on delete cascade,
  code       text not null check (code ~ '^[A-Z]{6}$'),
  created_at timestamptz not null default now(),
  primary key (gym_id, member_id),
  unique (gym_id, code)
);

create table if not exists referrals (
  id              uuid primary key default gen_random_uuid(),
  gym_id          uuid not null default acting_gym_id() references gyms(id),
  referrer_id     uuid not null references profiles(id) on delete cascade,
  referred_id     uuid not null references profiles(id) on delete cascade,
  code            text not null,
  status          text not null default 'pending' check (status in ('pending', 'rewarded', 'void')),
  created_at      timestamptz not null default now(),
  rewarded_at     timestamptz,
  payment_id      uuid,
  referrer_points int not null default 0,
  friend_points   int not null default 0,
  unique (gym_id, referred_id),
  check (referrer_id <> referred_id)
);
create index if not exists referrals_referrer_idx on referrals (gym_id, referrer_id, rewarded_at);

create or replace function my_referral_code() returns text
language plpgsql security definer set search_path = public as $$
declare v_gym uuid := current_gym_id(); v_code text; i int := 0;
begin
  if storage_role_here() is distinct from 'member' then
    raise exception 'Only a member of this gym has a referral code.' using errcode = '42501';
  end if;
  select code into v_code from referral_codes where gym_id = v_gym and member_id = auth.uid();
  if v_code is not null then return v_code; end if;
  loop
    v_code := (select string_agg(chr(65 + floor(random() * 26)::int), '') from generate_series(1, 6));
    exit when not exists (select 1 from referral_codes where gym_id = v_gym and code = v_code);
    i := i + 1;
    if i > 20 then raise exception 'Could not make a code. Try again.'; end if;
  end loop;
  insert into referral_codes (gym_id, member_id, code) values (v_gym, auth.uid(), v_code)
  on conflict (gym_id, member_id) do nothing;
  select code into v_code from referral_codes where gym_id = v_gym and member_id = auth.uid();
  return v_code;
end;
$$;

-- The one place the rules are checked. Raises with a sentence; callers decide
-- whether a refusal is shown (claim_referral) or swallowed (sign-up).
create or replace function record_referral(p_gym uuid, p_friend uuid, p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_referrer uuid; v_id uuid;
begin
  select member_id into v_referrer from referral_codes
   where gym_id = p_gym and code = upper(btrim(coalesce(p_code, '')));
  if v_referrer is null then raise exception 'No member here has that code.'; end if;
  if v_referrer = p_friend then raise exception 'You cannot refer yourself.'; end if;
  if not exists (select 1 from gym_roles where gym_id = p_gym and user_id = v_referrer
                  and role = 'member' and status = 'active') then
    raise exception 'That code belongs to someone who is not an active member here.';
  end if;
  if exists (select 1 from referrals where gym_id = p_gym and referred_id = p_friend) then
    raise exception 'You were already referred to this gym.';
  end if;
  if exists (select 1 from payments where gym_id = p_gym and member_id = p_friend
              and status = 'completed' and amount > 0) then
    raise exception 'A referral is for new members; you have already paid here.';
  end if;
  insert into referrals (gym_id, referrer_id, referred_id, code)
  values (p_gym, v_referrer, p_friend, upper(btrim(p_code)))
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function record_referral(uuid, uuid, text) from public, anon, authenticated;

create or replace function claim_referral(p_gym uuid, p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if not exists (select 1 from gym_roles where gym_id = p_gym and user_id = auth.uid() and role = 'member') then
    raise exception 'Ask to join the gym first, then add the code.';
  end if;
  return record_referral(p_gym, auth.uid(), p_code);
end;
$$;

-- A new account's code, when its member row lands in the gym it signed up to.
create or replace function trg_referral_from_signup() returns trigger
language plpgsql security definer set search_path = public as $$
declare meta jsonb;
begin
  if new.role <> 'member' then return new; end if;
  select raw_user_meta_data into meta from auth.users where id = new.user_id;
  if coalesce(meta->>'referral_code', '') = '' or meta->>'gym_id' is distinct from new.gym_id::text then
    return new;
  end if;
  begin
    perform record_referral(new.gym_id, new.user_id, meta->>'referral_code');
  exception when others then
    null;   -- a bad or stale code never blocks a sign-up
  end;
  return new;
end;
$$;
drop trigger if exists gym_roles_referral on gym_roles;
create trigger gym_roles_referral after insert on gym_roles
  for each row execute function trg_referral_from_signup();

-- ---- 3. the paid moment ---------------------------------------------------------------------

create or replace function trg_referral_paid() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r record; v_rule int; v_welcome int; v_ref_pts int := 0; v_friend_pts int := 0; v_month int; v_name text;
  v_prev text := current_setting('cf.acting_gym', true);
begin
  if new.status <> 'completed' or coalesce(new.amount, 0) <= 0 then return new; end if;
  select * into r from referrals
   where gym_id = new.gym_id and referred_id = new.member_id and status = 'pending'
   for update;
  if r.id is null then return new; end if;
  -- plan_allows() reads the member's membership in the *acting* gym. Whoever
  -- records the payment — the desk, the owner, a script with no session — the
  -- gym is the payment's. The caller's own setting is put back at the end.
  perform act_as_gym(r.gym_id);

  select count(*) into v_month from referrals
   where gym_id = r.gym_id and referrer_id = r.referrer_id and referrer_points > 0
     and (rewarded_at at time zone 'Asia/Manila')::date
         >= date_trunc('month', now() at time zone 'Asia/Manila')::date;

  select points into v_rule from point_rules where gym_id = r.gym_id and key = 'referral' and is_active;
  select points into v_welcome from point_rules where gym_id = r.gym_id and key = 'referral_welcome' and is_active;

  if v_rule is not null and v_month < 5 and plan_allows(r.referrer_id, 'points_earn') then
    v_ref_pts := v_rule;
    insert into point_ledger (gym_id, member_id, rule_key, points, source_table, source_id)
    values (r.gym_id, r.referrer_id, 'referral', v_rule, 'referrals', r.id)
    on conflict (gym_id, member_id, rule_key, source_table, source_id) do nothing;
  end if;
  if v_welcome is not null and plan_allows(r.referred_id, 'points_earn') then
    v_friend_pts := v_welcome;
    insert into point_ledger (gym_id, member_id, rule_key, points, source_table, source_id)
    values (r.gym_id, r.referred_id, 'referral_welcome', v_welcome, 'referrals', r.id)
    on conflict (gym_id, member_id, rule_key, source_table, source_id) do nothing;
  end if;

  update referrals set status = 'rewarded', rewarded_at = now(), payment_id = new.id,
         referrer_points = v_ref_pts, friend_points = v_friend_pts
   where id = r.id;

  select first_name into v_name from profiles where id = r.referred_id;
  perform notify_once(r.referrer_id, 'referral', 'Your friend joined',
    coalesce(v_name, 'Your friend') || ' is a paying member now'
      || case when v_ref_pts > 0 then ' — ' || v_ref_pts || ' points for you. Thank you!'
              else '. You have reached this month''s referral rewards; thank you!' end,
    '/member/refer', 'referral:' || r.id || ':referrer', r.gym_id);
  perform notify_once(r.referred_id, 'referral', 'Welcome to the gym',
    case when v_friend_pts > 0 then 'You joined through a friend: ' || v_friend_pts || ' welcome points are yours.'
         else 'You joined through a friend. Welcome!' end,
    '/member/rewards', 'referral:' || r.id || ':friend', r.gym_id);
  perform set_config('cf.acting_gym', coalesce(v_prev, ''), true);
  return new;
end;
$$;
drop trigger if exists payments_referral on payments;
create trigger payments_referral after insert or update of status, amount on payments
  for each row execute function trg_referral_paid();

-- ---- 4. 0124's sweeps, for a caller with no session -------------------------------------------
-- settle_squads() and settle_gym_goals() check plan_allows() per member, which
-- reads the acting gym. From a member's or owner's screen that is their gym and
-- they pay correctly; from pg_cron (no session) it was nobody's, and they would
-- have paid 0 points. Found writing 0125's payout. Same bodies, plus
-- act_as_gym() per squad and per goal, as settle_challenges() has done since 0102.

create or replace function settle_squads() returns int
language plpgsql security definer set search_path = public as $$
declare
  v_only uuid := case when auth.uid() is not null then current_gym_id() end;
  s record; wk date; v_days int; v_week uuid; v_pts int; n int := 0;
begin
  for s in select * from squads where archived_at is null and (v_only is null or gym_id = v_only) loop
    perform act_as_gym(s.gym_id);
    foreach wk in array array[manila_week_start(), manila_week_start(-1)] loop
      v_days := squad_days(s.id, wk);
      continue when v_days < s.weekly_target;
      insert into squad_weeks (gym_id, squad_id, week_start, days)
      values (s.gym_id, s.id, wk, v_days)
      on conflict (squad_id, week_start) do nothing
      returning id into v_week;
      continue when v_week is null;
      select points into v_pts from point_rules where gym_id = s.gym_id and key = 'squad_week' and is_active;
      if v_pts is not null then
        insert into point_ledger (gym_id, member_id, rule_key, points, source_table, source_id)
        select s.gym_id, m.member_id, 'squad_week', v_pts, 'squad_weeks', v_week
          from squad_members m
         where m.squad_id = s.id and m.left_at is null and plan_allows(m.member_id, 'points_earn')
        on conflict (gym_id, member_id, rule_key, source_table, source_id) do nothing;
      end if;
      n := n + 1;
    end loop;
  end loop;
  perform act_as_gym(null);
  return n;
end;
$$;

create or replace function settle_gym_goals() returns int
language plpgsql security definer set search_path = public as $$
declare
  v_only uuid := case when auth.uid() is not null then current_gym_id() end;
  g record; n int := 0;
begin
  for g in select * from gym_goals
            where is_active and reached_at is null and (v_only is null or gym_id = v_only)
              and starts_on <= (now() at time zone 'Asia/Manila')::date
              and ends_on >= (now() at time zone 'Asia/Manila')::date - 7 loop
    perform act_as_gym(g.gym_id);
    continue when (select progress from gym_goal_progress(g.id)) < g.target;
    update gym_goals set reached_at = now() where id = g.id and reached_at is null;
    if g.reward_points > 0 then
      insert into point_ledger (gym_id, member_id, rule_key, points, source_table, source_id)
      select g.gym_id, r.user_id, 'gym_goal', g.reward_points, 'gym_goals', g.id
        from gym_roles r
       where r.gym_id = g.gym_id and r.role = 'member'
         and gym_goal_contribution(g.id, r.user_id) > 0 and plan_allows(r.user_id, 'points_earn')
      on conflict (gym_id, member_id, rule_key, source_table, source_id) do nothing;
    end if;
    n := n + 1;
  end loop;
  perform act_as_gym(null);
  return n;
end;
$$;

-- ---- 5. reading them ----------------------------------------------------------------------------

create or replace function my_referrals()
returns table (friend_name text, status text, created_at timestamptz, rewarded_at timestamptz, points int)
language sql stable security definer set search_path = public as $$
  select (p.first_name || ' ' || left(coalesce(p.last_name, ''), 1) || '.')::text, r.status, r.created_at,
         r.rewarded_at, r.referrer_points
    from referrals r join profiles p on p.id = r.referred_id
   where r.referrer_id = auth.uid() and r.gym_id = current_gym_id()
   order by r.created_at desc;
$$;

create or replace function gym_referrals()
returns table (id uuid, referrer_name text, friend_name text, status text, created_at timestamptz,
               rewarded_at timestamptz, referrer_points int, friend_points int)
language plpgsql stable security definer set search_path = public as $$
begin
  if coalesce(storage_role_here(), '') not in ('admin', 'staff') then
    raise exception 'Only the gym sees its referrals.' using errcode = '42501';
  end if;
  return query
    select r.id, (a.first_name || ' ' || coalesce(a.last_name, ''))::text, (b.first_name || ' ' || coalesce(b.last_name, ''))::text,
           r.status, r.created_at, r.rewarded_at, r.referrer_points, r.friend_points
      from referrals r join profiles a on a.id = r.referrer_id join profiles b on b.id = r.referred_id
     where r.gym_id = current_gym_id()
     order by r.created_at desc;
end;
$$;

alter table referral_codes enable row level security;
alter table referrals      enable row level security;
grant select on referral_codes, referrals to authenticated;
drop policy if exists referral_codes_read on referral_codes;
create policy referral_codes_read on referral_codes for select to authenticated
  using (member_id = auth.uid() or coalesce(storage_role_here() in ('admin', 'staff'), false));
drop policy if exists referrals_read on referrals;
create policy referrals_read on referrals for select to authenticated
  using (referrer_id = auth.uid() or referred_id = auth.uid()
         or coalesce(storage_role_here() in ('admin', 'staff'), false));

-- ---- 6. tenancy -------------------------------------------------------------------------------

create or replace function tenancy_gym_tables() returns text[] language sql immutable as $$
  select array['account_status_events','achievement_unlocks','achievements','activity_log',
    'assistant_conversations','assistant_messages','attendance','body_measurements','bookings',
    'cancellation_reasons','cash_closeouts','challenge_participants','challenges','class_templates',
    'class_waitlist','classes','event_registrations','events','fitness_goals','freemium_trials',
    'goal_templates','gym_exercise_media','gym_goals','gym_invitations','gym_modules','gym_photos','gym_plans',
    'gym_program_days','gym_programs','gym_settings','gym_waivers','gym_workout_items','gym_workouts',
    'invoice_counters','member_profiles','member_share_prefs','membership_events',
    'membership_plans','membership_requests','memberships',
    'notifications','payments','pending_registrations','personal_records','plan_features',
    'point_ledger','point_rules',
    'program_enrolments','pt_sessions','referral_codes','referrals','refund_rules','renewal_requests',
    'reward_redemptions','rewards',
    'saved_resources','season_claims','season_tiers','squad_members','squad_weeks','squads',
    'trainer_availability','trainer_credentials','trainer_feedback','trainer_profiles',
    'trainer_ratings','waiver_acceptances','workout_logs','workout_plans',
    'workout_routine_exercises','workout_routines','workout_sets']::text[]
$$;

do $$
declare t text;
begin
  foreach t in array array['referral_codes', 'referrals'] loop
    execute format('drop policy if exists tenant_select on %I', t);
    execute format('drop policy if exists tenant_insert on %I', t);
    execute format('drop policy if exists tenant_update on %I', t);
    execute format('drop policy if exists tenant_delete on %I', t);
    execute format('create policy tenant_select on %I as restrictive for select to anon, authenticated
                      using (gym_id = current_gym_id())', t);
    execute format('create policy tenant_insert on %I as restrictive for insert to anon, authenticated
                      with check (gym_id = current_gym_id() and gym_writable())', t);
    execute format('create policy tenant_update on %I as restrictive for update to anon, authenticated
                      using (gym_id = current_gym_id() and gym_writable())
                      with check (gym_id = current_gym_id())', t);
    execute format('create policy tenant_delete on %I as restrictive for delete to anon, authenticated
                      using (gym_id = current_gym_id() and gym_writable())', t);
  end loop;
end $$;

-- ---- grants ------------------------------------------------------------------------------------

revoke all on function my_referral_code(), claim_referral(uuid, text), my_referrals(), gym_referrals()
  from public, anon;
grant execute on function my_referral_code(), claim_referral(uuid, text), my_referrals(), gym_referrals()
  to authenticated;

-- ---- the probe's marker ------------------------------------------------------------------

create or replace function migration_0125_applied() returns boolean
language sql immutable as $marker$ select true $marker$;
revoke all on function migration_0125_applied() from public, anon;
grant execute on function migration_0125_applied() to authenticated;
comment on function migration_0125_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0125.sql
