-- ============================================================================
-- 0210 — Every points payout asks about the member's plan, never the caller's
-- ============================================================================
-- 0208 fixed settle_squads() and settle_gym_goals(), and listed the rest that
-- still filtered with plan_allows(member, 'points_earn'). plan_allows() says yes
-- to ANY admin or staff caller (0049, for the desk's screens), so whenever the
-- desk or the owner set one of these off — checking a member in, recording a
-- payment or a shop sale, a referral's first payment, opening Challenges — a
-- member whose plan does not earn points was paid anyway.
--
-- Each function below is its latest body, word for word, with that one check
-- swapped for member_plan_allows() (0206), which reads only the member's own
-- membership. award_points() is the one the check-in, workout, goal, session
-- and membership-paid triggers all go through, so fixing it fixes all of them.
--
-- Sources: award_points, settle_challenges (0102); trg_detect_personal_record
-- (0123); trg_referral_paid (0125); award_classwork (0129); trg_points_shop_sale
-- (0159).
-- ============================================================================

-- ---- award_points (0102), 1 check ----
create or replace function award_points(
  p_member uuid, p_rule text, p_source_table text, p_source_id uuid
) returns void language plpgsql security definer set search_path = public as $fn$
declare
  v_gym    uuid := acting_gym_id();
  v_points int;
begin
  -- Earning is a plan feature (0049). Checked here rather than at each call
  -- site so a new rule cannot forget it.
  if not member_plan_allows(p_member, 'points_earn') then
    return;
  end if;

  select points into v_points from point_rules where gym_id = v_gym and key = p_rule and is_active;
  if v_points is null then
    return;                       -- rule switched off by the gym, or unknown
  end if;

  insert into point_ledger (gym_id, member_id, rule_key, points, source_table, source_id)
  values (v_gym, p_member, p_rule, v_points, p_source_table, p_source_id)
  -- The idempotency guarantee, made explicit. A second award for the same
  -- source is not an error to handle, it is a no-op by design.
  on conflict (gym_id, member_id, rule_key, source_table, source_id) do nothing;
end;
$fn$;

-- ---- settle_challenges (0102), 1 check ----
create or replace function settle_challenges() returns int
language plpgsql security definer set search_path = public as $fn$
declare
  r record;
  n int := 0;
  v_only uuid := case when auth.uid() is not null then current_gym_id() end;
begin
  for r in
    select c.gym_id, p.challenge_id, p.member_id, c.target, c.reward_points
      from challenge_participants p
      join challenges c on c.id = p.challenge_id
     where p.completed_on is null
       and c.is_active
       and (v_only is null or c.gym_id = v_only)
       -- Still running, or finished within the last week: a challenge that
       -- ended on Sunday must still settle on Monday.
       and c.starts_on <= (now() at time zone 'Asia/Manila')::date
       and c.ends_on >= (now() at time zone 'Asia/Manila')::date - 7
     order by c.gym_id
  loop
    perform act_as_gym(r.gym_id);
    if challenge_progress(r.challenge_id, r.member_id) >= r.target then
      update challenge_participants
         set completed_on = (now() at time zone 'Asia/Manila')::date
       where challenge_id = r.challenge_id and member_id = r.member_id;

      if r.reward_points > 0 then
        -- The challenge's own value, in the challenge's gym, through the same
        -- entitlement check and idempotency key every other rule uses (0052).
        insert into point_ledger (gym_id, member_id, rule_key, points, source_table, source_id)
        select r.gym_id, r.member_id, 'challenge_complete', r.reward_points,
               'challenge_participants', r.challenge_id
        where member_plan_allows(r.member_id, 'points_earn')
        on conflict (gym_id, member_id, rule_key, source_table, source_id) do nothing;
      end if;

      n := n + 1;
    end if;
  end loop;
  perform act_as_gym(null);
  return n;
end;
$fn$;

-- ---- trg_detect_personal_record (0123), 1 check ----
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

  -- Points: the gym's rule, the member's plan, and at most three a week.
  select points into v_rule from point_rules
   where gym_id = new.gym_id and key = 'personal_record' and is_active;
  if v_rule is not null and member_plan_allows(v_member, 'points_earn')
     and (select count(*) from personal_records r
           where r.member_id = v_member and r.gym_id = new.gym_id and r.points_awarded > 0
             and (r.achieved_at at time zone 'Asia/Manila')::date >= v_week) < 3 then
    insert into point_ledger (gym_id, member_id, rule_key, points, source_table, source_id)
    values (new.gym_id, v_member, 'personal_record', v_rule, 'personal_records', v_pr)
    on conflict (gym_id, member_id, rule_key, source_table, source_id) do nothing;
    v_pts := v_rule;
    update personal_records set points_awarded = v_pts where id = v_pr;
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

-- ---- trg_referral_paid (0125), 2 checks ----
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

  if v_rule is not null and v_month < 5 and member_plan_allows(r.referrer_id, 'points_earn') then
    v_ref_pts := v_rule;
    insert into point_ledger (gym_id, member_id, rule_key, points, source_table, source_id)
    values (r.gym_id, r.referrer_id, 'referral', v_rule, 'referrals', r.id)
    on conflict (gym_id, member_id, rule_key, source_table, source_id) do nothing;
  end if;
  if v_welcome is not null and member_plan_allows(r.referred_id, 'points_earn') then
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

-- ---- award_classwork (0129), 1 check ----
create or replace function award_classwork(p_submission uuid) returns int
language plpgsql security definer set search_path = public as $$
declare s record; v_pts int; v_prev text := current_setting('cf.acting_gym', true);
begin
  select sb.id, sb.gym_id, sb.member_id, sb.turned_in_at, a.due_on into s
    from room_submissions sb join room_assignments a on a.id = sb.assignment_id where sb.id = p_submission;
  if s.id is null or not turned_in_on_time(s.turned_in_at, s.due_on) then return 0; end if;
  perform act_as_gym(s.gym_id);
  select points into v_pts from point_rules where gym_id = s.gym_id and key = 'classwork_on_time' and is_active;
  if v_pts is not null and member_plan_allows(s.member_id, 'points_earn') then
    insert into point_ledger (gym_id, member_id, rule_key, points, source_table, source_id)
    values (s.gym_id, s.member_id, 'classwork_on_time', v_pts, 'room_submissions', s.id)
    on conflict (gym_id, member_id, rule_key, source_table, source_id) do nothing;
    if found then update room_submissions set points_awarded = v_pts where id = s.id; else v_pts := 0; end if;
  else
    v_pts := 0;
  end if;
  perform set_config('cf.acting_gym', coalesce(v_prev, ''), true);
  return v_pts;
end;
$$;

-- ---- trg_points_shop_sale (0159), 1 check ----
create or replace function trg_points_shop_sale() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_per int; v_pts int; v_had int;
  v_prev text := current_setting('cf.acting_gym', true);
begin
  if new.member_id is null then return null; end if;
  perform act_as_gym(new.gym_id);

  if new.voided_at is null and coalesce(old.total, 0) = 0 and new.total > 0 then
    select points into v_per from point_rules where gym_id = new.gym_id and key = 'shop_purchase' and is_active;
    v_pts := coalesce(v_per, 0) * floor(new.total / 100)::int;
    if v_pts > 0 and member_plan_allows(new.member_id, 'points_earn') then
      insert into point_ledger (gym_id, member_id, rule_key, points, source_table, source_id)
      values (new.gym_id, new.member_id, 'shop_purchase', v_pts, 'shop_sales', new.id)
      on conflict do nothing;
    end if;
  elsif new.voided_at is not null and old.voided_at is null then
    select points into v_had from point_ledger
     where gym_id = new.gym_id and member_id = new.member_id and rule_key = 'shop_purchase'
       and source_table = 'shop_sales' and source_id = new.id;
    if coalesce(v_had, 0) > 0 then
      insert into point_ledger (gym_id, member_id, rule_key, points, source_table, source_id)
      values (new.gym_id, new.member_id, 'shop_purchase', -v_had, 'shop_sales_void', new.id)
      on conflict do nothing;
    end if;
  end if;

  perform set_config('cf.acting_gym', coalesce(v_prev, ''), true);
  return null;
end;
$$;


create or replace function migration_0210_applied() returns boolean language sql stable as $$ select true $$;
grant execute on function migration_0210_applied() to anon, authenticated;
