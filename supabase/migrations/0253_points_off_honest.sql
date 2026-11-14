-- 0253: when a gym switches Points off, nothing promises or announces points it does not pay.
--
-- 0186 made "points off" one guard on the ledger: a positive row is silently dropped. Every writer then
-- carried on as if it had paid. The owner (2026-11-14): "find them and fix". Found and fixed here:
--   * a personal record said "(+N points)" and stored N as paid (trg_detect_personal_record, 0219);
--   * a new badge said "+N points." (trg_achievement_unlocked, 0206);
--   * Invite a friend promised and announced points (trg_referral_paid, 0210).
-- Challenges, gym goals, teams, classwork, shop sales and check-ins already said nothing or stored only what
-- landed. The member and admin screens are fixed in the same commit.
--
-- Invite a friend with points OFF (owner's choice): it keeps working, and the gym gives a DESK REWARD instead
-- — its own words, e.g. "1 free day pass" — to the member who invited (at most five a month, as with points)
-- and/or the friend, when the friend's first payment is recorded. The desk marks each one given. With points
-- ON nothing changes.

create or replace function gym_points_on(p_gym uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from gym_modules m where m.gym_id = p_gym and m.feature_key = 'points' and not m.enabled);
$$;
revoke all on function gym_points_on(uuid) from public, anon, authenticated;

alter table gym_settings add column if not exists referral_reward_referrer text check (char_length(referral_reward_referrer) <= 80);
alter table gym_settings add column if not exists referral_reward_friend   text check (char_length(referral_reward_friend) <= 80);
alter table referrals add column if not exists desk_reward_referrer text;
alter table referrals add column if not exists desk_reward_friend   text;
alter table referrals add column if not exists desk_given_referrer_at timestamptz;
alter table referrals add column if not exists desk_given_friend_at   timestamptz;

-- ---- badges: "+N points" only when they were paid ----
create or replace function trg_achievement_unlocked() returns trigger
language plpgsql security definer set search_path = public as $$
declare a record; v_paid int := 0;
begin
  select * into a from achievements where gym_id = new.gym_id and key = new.achievement_key;
  if not found then return new; end if;
  if a.points > 0 and a.audience = 'member'
     and exists (select 1 from point_rules r where r.gym_id = new.gym_id and r.key = 'achievement' and r.is_active)
     and member_plan_allows(new.user_id, 'points_earn') then
    insert into point_ledger (gym_id, member_id, rule_key, points, source_table, source_id)
    values (new.gym_id, new.user_id, 'achievement', a.points, 'achievement_unlocks', new.id)
    on conflict (gym_id, member_id, rule_key, source_table, source_id) do nothing;
    if found then v_paid := a.points; end if;
  end if;
  if a.tell_member then
    perform notify_once(new.user_id, 'info', 'New badge: ' || a.title,
      a.description || case when v_paid > 0 then ' +' || v_paid || ' points.' else '' end,
      case when a.audience = 'member' then '/member/achievements' else '/trainer/achievements' end,
      'badge:' || new.id, new.gym_id);
  end if;
  return new;
end;
$$;

-- ---- invite a friend: points when the gym runs points, its desk reward when it does not ----
create or replace function trg_referral_paid() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r record; v_rule int; v_welcome int; v_ref_pts int := 0; v_friend_pts int := 0; v_month int; v_name text;
  v_prev text := current_setting('cf.acting_gym', true);
  v_on boolean; v_desk_ref text; v_desk_friend text;
begin
  if new.status <> 'completed' or coalesce(new.amount, 0) <= 0 then return new; end if;
  select * into r from referrals
   where gym_id = new.gym_id and referred_id = new.member_id and status = 'pending'
   for update;
  if r.id is null then return new; end if;
  perform act_as_gym(r.gym_id);
  v_on := gym_points_on(r.gym_id);

  -- Five rewards a month for the member who invited, points or desk reward alike.
  select count(*) into v_month from referrals
   where gym_id = r.gym_id and referrer_id = r.referrer_id
     and (referrer_points > 0 or desk_reward_referrer is not null)
     and (rewarded_at at time zone 'Asia/Manila')::date
         >= date_trunc('month', now() at time zone 'Asia/Manila')::date;

  if v_on then
    select points into v_rule from point_rules where gym_id = r.gym_id and key = 'referral' and is_active;
    select points into v_welcome from point_rules where gym_id = r.gym_id and key = 'referral_welcome' and is_active;
    if v_rule is not null and v_month < 5 and member_plan_allows(r.referrer_id, 'points_earn') then
      insert into point_ledger (gym_id, member_id, rule_key, points, source_table, source_id)
      values (r.gym_id, r.referrer_id, 'referral', v_rule, 'referrals', r.id)
      on conflict (gym_id, member_id, rule_key, source_table, source_id) do nothing;
      if found then v_ref_pts := v_rule; end if;
    end if;
    if v_welcome is not null and member_plan_allows(r.referred_id, 'points_earn') then
      insert into point_ledger (gym_id, member_id, rule_key, points, source_table, source_id)
      values (r.gym_id, r.referred_id, 'referral_welcome', v_welcome, 'referrals', r.id)
      on conflict (gym_id, member_id, rule_key, source_table, source_id) do nothing;
      if found then v_friend_pts := v_welcome; end if;
    end if;
  else
    select nullif(btrim(referral_reward_referrer), ''), nullif(btrim(referral_reward_friend), '')
      into v_desk_ref, v_desk_friend from gym_settings where gym_id = r.gym_id;
    if v_month >= 5 then v_desk_ref := null; end if;
  end if;

  update referrals set status = 'rewarded', rewarded_at = now(), payment_id = new.id,
         referrer_points = v_ref_pts, friend_points = v_friend_pts,
         desk_reward_referrer = v_desk_ref, desk_reward_friend = v_desk_friend
   where id = r.id;

  select first_name into v_name from profiles where id = r.referred_id;
  perform notify_once(r.referrer_id, 'referral', 'Your friend joined',
    coalesce(v_name, 'Your friend') || ' is a paying member now'
      || case when v_ref_pts > 0 then ' — ' || v_ref_pts || ' points for you. Thank you!'
              when v_desk_ref is not null then ' — your reward: ' || v_desk_ref || '. Ask for it at the front desk. Thank you!'
              when v_on and v_month >= 5 then '. You have reached this month''s referral rewards; thank you!'
              else '. Thank you for bringing them!' end,
    '/member/refer', 'referral:' || r.id || ':referrer', r.gym_id);
  perform notify_once(r.referred_id, 'referral', 'Welcome to the gym',
    case when v_friend_pts > 0 then 'You joined through a friend: ' || v_friend_pts || ' welcome points are yours.'
         when v_desk_friend is not null then 'You joined through a friend. Your welcome reward: ' || v_desk_friend || ' — ask at the front desk.'
         else 'You joined through a friend. Welcome!' end,
    case when v_on then '/member/rewards' else '/member/refer' end, 'referral:' || r.id || ':friend', r.gym_id);
  perform set_config('cf.acting_gym', coalesce(v_prev, ''), true);
  return new;
end;
$$;

-- ---- what a member is promised, from the gym's own settings ----
create or replace function my_referral_terms() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_gym uuid := current_gym_id(); s gym_settings;
begin
  if auth.uid() is null or v_gym is null then return null; end if;
  select * into s from gym_settings where gym_id = v_gym;
  return jsonb_build_object(
    'points_on', gym_points_on(v_gym),
    'referrer_points', (select points from point_rules where gym_id = v_gym and key = 'referral' and is_active),
    'friend_points', (select points from point_rules where gym_id = v_gym and key = 'referral_welcome' and is_active),
    'desk_referrer', nullif(btrim(s.referral_reward_referrer), ''),
    'desk_friend', nullif(btrim(s.referral_reward_friend), ''));
end;
$$;
revoke all on function my_referral_terms() from public, anon;
grant execute on function my_referral_terms() to authenticated;

-- my_referrals: the desk reward too (the return type grows, so drop first)
drop function if exists my_referrals();
create function my_referrals()
returns table (friend_name text, status text, created_at timestamptz, rewarded_at timestamptz, points int,
               desk_reward text, desk_given_at timestamptz)
language sql stable security definer set search_path = public as $$
  select (p.first_name || ' ' || left(coalesce(p.last_name, ''), 1) || '.')::text, r.status, r.created_at,
         r.rewarded_at, r.referrer_points, r.desk_reward_referrer, r.desk_given_referrer_at
    from referrals r join profiles p on p.id = r.referred_id
   where r.referrer_id = auth.uid() and r.gym_id = current_gym_id()
   order by r.created_at desc;
$$;
revoke all on function my_referrals() from public, anon;
grant execute on function my_referrals() to authenticated;

-- gym_referrals: the desk rewards and whether they were given
drop function if exists gym_referrals();
create function gym_referrals()
returns table (id uuid, referrer_name text, friend_name text, status text, created_at timestamptz,
               rewarded_at timestamptz, referrer_points int, friend_points int,
               desk_reward_referrer text, desk_reward_friend text, desk_given_referrer_at timestamptz, desk_given_friend_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if coalesce(storage_role_here(), '') not in ('admin', 'staff') then
    raise exception 'Only the gym sees its referrals.' using errcode = '42501';
  end if;
  return query
    select r.id, (a.first_name || ' ' || coalesce(a.last_name, ''))::text, (b.first_name || ' ' || coalesce(b.last_name, ''))::text,
           r.status, r.created_at, r.rewarded_at, r.referrer_points, r.friend_points,
           r.desk_reward_referrer, r.desk_reward_friend, r.desk_given_referrer_at, r.desk_given_friend_at
      from referrals r join profiles a on a.id = r.referrer_id join profiles b on b.id = r.referred_id
     where r.gym_id = current_gym_id()
     order by r.created_at desc;
end;
$$;
revoke all on function gym_referrals() from public, anon;
grant execute on function gym_referrals() to authenticated;

-- The owner sets the desk rewards (empty = none).
create or replace function set_referral_rewards(p_referrer text, p_friend text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(storage_role_here(), '') <> 'admin' then
    raise exception 'Only the owner sets the referral rewards.' using errcode = '42501';
  end if;
  if char_length(coalesce(p_referrer, '')) > 80 or char_length(coalesce(p_friend, '')) > 80 then
    raise exception 'Keep each reward under 80 characters.';
  end if;
  update gym_settings set referral_reward_referrer = nullif(btrim(p_referrer), ''),
                          referral_reward_friend = nullif(btrim(p_friend), '')
   where gym_id = current_gym_id();
  if not found then raise exception 'This gym has no settings yet.'; end if;
end;
$$;
revoke all on function set_referral_rewards(text, text) from public, anon;
grant execute on function set_referral_rewards(text, text) to authenticated;

-- The desk (or owner) marks a desk reward handed over.
create or replace function give_referral_reward(p_referral uuid, p_who text) returns void
language plpgsql security definer set search_path = public as $$
declare r referrals;
begin
  if coalesce(storage_role_here(), '') not in ('admin', 'staff') then
    raise exception 'Only the front desk hands out rewards.' using errcode = '42501';
  end if;
  select * into r from referrals where id = p_referral and gym_id = current_gym_id() for update;
  if r.id is null then raise exception 'That referral is not in this gym.'; end if;
  if p_who = 'referrer' then
    if r.desk_reward_referrer is null then raise exception 'There is no desk reward for the member who invited.'; end if;
    update referrals set desk_given_referrer_at = coalesce(desk_given_referrer_at, now()) where id = r.id;
  elsif p_who = 'friend' then
    if r.desk_reward_friend is null then raise exception 'There is no desk reward for the friend.'; end if;
    update referrals set desk_given_friend_at = coalesce(desk_given_friend_at, now()) where id = r.id;
  else
    raise exception 'Say who: referrer or friend.';
  end if;
end;
$$;
revoke all on function give_referral_reward(uuid, text) from public, anon;
grant execute on function give_referral_reward(uuid, text) to authenticated;

-- ---- personal records: only the points that landed ----
create or replace function trg_detect_personal_record() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_member uuid;
  v_kind   text;
  v_val    numeric;
  v_prev   numeric;
  v_pr     uuid;
  v_pts    int := 0;
  v_rule   int;
  v_week   date := date_trunc('week', now() at time zone 'Asia/Manila')::date;
  v_name   text;
begin
  if new.exercise_id is null then return new; end if;
  select l.member_id into v_member from workout_logs l where l.id = new.log_id;
  if v_member is null then return new; end if;

  if coalesce(new.weight_kg, 0) > 0 then
    v_kind := 'weight'; v_val := new.weight_kg;
    select max(s.weight_kg) into v_prev
      from workout_sets s join workout_logs l on l.id = s.log_id
     where l.member_id = v_member and s.gym_id = new.gym_id and s.exercise_id = new.exercise_id
       and s.id <> new.id and s.weight_kg is not null and not set_is_discounted(s.id);
  elsif coalesce(new.duration_seconds, 0) > 0 then
    v_kind := 'duration'; v_val := new.duration_seconds;
    select max(s.duration_seconds) into v_prev
      from workout_sets s join workout_logs l on l.id = s.log_id
     where l.member_id = v_member and s.gym_id = new.gym_id and s.exercise_id = new.exercise_id
       and s.id <> new.id and s.duration_seconds is not null and not set_is_discounted(s.id);
  else
    return new;
  end if;

  -- The first set is the baseline; a tie is not a record.
  if v_prev is null or v_val <= v_prev then return new; end if;

  insert into personal_records (gym_id, member_id, exercise_id, kind, value, previous, set_id)
  values (new.gym_id, v_member, new.exercise_id, v_kind, v_val, v_prev, new.id)
  on conflict (set_id, kind) do nothing
  returning id into v_pr;
  if v_pr is null then return new; end if;

  -- Points: the gym's rule, the member's plan, and at most three payouts a week —
  -- counted from the ledger, which a deleted record cannot leave (0219).
  select points into v_rule from point_rules
   where gym_id = new.gym_id and key = 'personal_record' and is_active;
  -- An unbelievable jump (over 1.5× the best weight, 2× the best time) is still a
  -- record — a warm-up logged first is a low baseline — but it pays nothing; the
  -- desk can remove a fake one, which also clears the baseline (0219).
  if v_rule is not null and member_plan_allows(v_member, 'points_earn')
     and v_val <= v_prev * (case when v_kind = 'weight' then 1.5 else 2 end)
     and (select count(*) from point_ledger p
           where p.member_id = v_member and p.gym_id = new.gym_id and p.rule_key = 'personal_record'
             and p.source_table = 'personal_records' and p.points > 0
             and (p.created_at at time zone 'Asia/Manila')::date >= v_week) < 3 then
    insert into point_ledger (gym_id, member_id, rule_key, points, source_table, source_id)
    values (new.gym_id, v_member, 'personal_record', v_rule, 'personal_records', v_pr)
    on conflict (gym_id, member_id, rule_key, source_table, source_id) do nothing;
    -- 0253: only what actually landed. With the gym's points switched off, 0186's guard drops the row,
    -- and the record used to say "+N points" (and store N) for points that never arrived.
    if found then
      v_pts := v_rule;
      update personal_records set points_awarded = v_pts where id = v_pr;
    end if;
  end if;

  select name into v_name from exercises where id = new.exercise_id;
  perform notify_once(v_member, 'personal_record', 'New personal record',
    v_name || ': ' || case when v_kind = 'weight' then trim(to_char(v_val, 'FM999990.##')) || ' kg'
                           else v_val::int || ' seconds' end
      || case when v_pts > 0 then ' (+' || v_pts || ' points)' else '' end,
    '/member/season', 'pr:' || v_pr, new.gym_id);
  return new;
end;
$$;

create or replace function migration_0253_applied() returns boolean language sql stable as $$ select true $$;
grant execute on function migration_0253_applied() to anon, authenticated;
