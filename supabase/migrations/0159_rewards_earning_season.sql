-- ============================================================================
-- 0159 — Rewards that cannot run out silently, two new ways to earn, and the
--        season as the owner sees it
-- ============================================================================
--
-- 1. APPROVING THE LAST ONE TWICE
--    Stock drops when a redemption is approved (0051). Two members asking for
--    the last free shake both reached "Waiting", and approving the second ran
--    `stock = stock - 1` into the `stock >= 0` check: the owner saw a raw
--    constraint error. decide_redemption() now says it is out of stock — restock
--    or decline — before anything changes.
--
-- 2. TWO NEW WAYS TO EARN (both shipped OFF; the owner turns them on)
--    A rule the database never awards is a control writing a flag nothing
--    reads, so "add a way to earn" can only add what a trigger here pays:
--      shop_purchase   — points for every ₱100 a member spends at the counter
--                        (the till's "Who is buying?"), taken back if voided
--      membership_paid — points when a membership payment is completed
--    Both go through the plan check award_points() uses (points_earn), and the
--    ledger's uniqueness makes a re-fired trigger pay nothing twice.
--
-- 4. CHALLENGES SETTLE WITHOUT pg_cron — settle_challenges() is callable by a
--    signed-in user for their own gym, and the screens call it on load.
--
-- 3. THE SEASON, FOR THE OWNER
--    season_overview(): this month's dates, how many active members reached
--    each tier and how many claimed it, and the top ten by score — names
--    included, for the gym's own owner and desk only (members see boards with
--    first names and an initial, opt-in, as 0123 decided).
-- ============================================================================

-- ---- 1. out of stock is said, not hit ------------------------------------------------------------
create or replace function decide_redemption(p_id uuid, p_status text, p_note text default null)
returns void
language plpgsql security definer set search_path = public as $fn$
declare r record; v_stock int; v_name text;
begin
  if auth.uid() is not null and get_my_role() is distinct from 'admin' then
    raise exception 'Only an admin can approve or decline a reward.';
  end if;
  if p_status not in ('approved', 'rejected') then
    raise exception 'A decision is approved or rejected.';
  end if;
  if p_status = 'rejected' and coalesce(btrim(p_note), '') = '' then
    raise exception 'Say why — the member reads it.';
  end if;
  if p_status = 'approved' then
    select w.stock, w.name into v_stock, v_name
      from reward_redemptions q join rewards w on w.id = q.reward_id
     where q.id = p_id and in_my_gym(q.gym_id)
     for update of w;
    if v_stock is not null and v_stock <= 0 then
      raise exception '% is out of stock. Add stock in Rewards first, or decline with a reason.', v_name;
    end if;
  end if;

  update reward_redemptions
     set status = p_status, decided_by = auth.uid(), decided_at = now(),
         decision_note = nullif(btrim(p_note), '')
   where id = p_id and status = 'pending' and in_my_gym(gym_id)
  returning gym_id, member_id, reward_id into r;
  if r.member_id is null then
    raise exception 'That request has already been decided.';
  end if;

  perform act_as_gym(r.gym_id);
  perform notify_once(r.member_id, 'system',
    case when p_status = 'approved' then 'Reward approved' else 'Reward request declined' end,
    case when p_status = 'approved'
      then (select name from rewards where id = r.reward_id) || ' is ready — collect it at the front desk.'
      else (select name from rewards where id = r.reward_id) || ': ' || btrim(p_note) || ' Your points were not spent.'
    end,
    '/member/rewards', 'redemption:' || p_id || ':' || p_status);
end;
$fn$;

-- ---- 2. the two new rules, off in every gym ----------------------------------------------------------
insert into point_rules (gym_id, key, label, points, is_active, sort_order)
select g.id, 'shop_purchase', 'Points for every ₱100 spent at the counter', 5, false, 40 from gyms g
on conflict (gym_id, key) do nothing;
insert into point_rules (gym_id, key, label, points, is_active, sort_order)
select g.id, 'membership_paid', 'Paid for a membership', 50, false, 41 from gyms g
on conflict (gym_id, key) do nothing;

-- A counter sale with a member named on it: points per whole ₱100, once.
-- record_sale() inserts the sale at ₱0 and sets the total last, so the award
-- waits for that update; a void takes the same points back with a negative row.
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
    if v_pts > 0 and plan_allows(new.member_id, 'points_earn') then
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
drop trigger if exists shop_sales_points on shop_sales;
create trigger shop_sales_points after update of total, voided_at on shop_sales
  for each row execute function trg_points_shop_sale();

-- A completed membership payment above ₱0, once per payment.
create or replace function trg_points_membership_paid() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_prev text := current_setting('cf.acting_gym', true);
begin
  if new.status <> 'completed' or coalesce(new.amount, 0) <= 0 then return null; end if;
  if tg_op = 'UPDATE' and old.status = 'completed' then return null; end if;
  perform act_as_gym(new.gym_id);
  perform award_points(new.member_id, 'membership_paid', 'payments', new.id);
  perform set_config('cf.acting_gym', coalesce(v_prev, ''), true);
  return null;
end;
$$;
drop trigger if exists payments_points on payments;
create trigger payments_points after insert or update of status on payments
  for each row execute function trg_points_membership_paid();

-- ---- 3. the season, as the owner and desk see it --------------------------------------------------------
create or replace function season_overview() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_gym uuid := current_gym_id(); v jsonb;
begin
  if coalesce(storage_role_here(), '') not in ('admin', 'staff') then
    raise exception 'Only the gym''s owner and desk see the season.' using errcode = '42501';
  end if;
  with scores as (
    select r.user_id, season_score(r.user_id) as s
      from gym_roles r where r.gym_id = v_gym and r.role = 'member' and r.status = 'active'
  )
  select jsonb_build_object(
    'season_start', season_start(),
    'season_end', (season_start() + interval '1 month' - interval '1 day')::date,
    'members', (select count(*) from scores),
    'scoring', (select count(*) from scores where s > 0),
    'tiers', coalesce((select jsonb_agg(jsonb_build_object(
        'id', t.id, 'name', t.name, 'points_needed', t.points_needed,
        'reward', (select name from rewards w where w.id = t.reward_id),
        'reached', (select count(*) from scores where s >= t.points_needed),
        'claimed', (select count(*) from season_claims c where c.tier_id = t.id and c.season_start = season_start()),
        'handed_over', (select count(*) from season_claims c where c.tier_id = t.id and c.season_start = season_start() and c.handed_over_at is not null))
        order by t.points_needed)
      from season_tiers t where t.gym_id = v_gym), '[]'::jsonb),
    'top', coalesce((select jsonb_agg(x order by (x->>'score')::int desc) from (
        select jsonb_build_object('member_id', p.id, 'name', trim(p.first_name || ' ' || coalesce(p.last_name, '')), 'score', sc.s) as x
          from scores sc join profiles p on p.id = sc.user_id
         where sc.s > 0 order by sc.s desc limit 10) q), '[]'::jsonb)
  ) into v;
  return v;
end;
$$;
revoke all on function season_overview() from public, anon;
grant execute on function season_overview() to authenticated;

-- ---- 4. challenges settle without pg_cron ------------------------------------------------------------
-- settle_challenges() (0052/0102) marks a member done and pays the challenge's
-- points — but only pg_cron called it, and pg_cron is optional here, so on a
-- project without it a member could reach the target and never be marked done.
-- A signed-in caller already settles only their own gym (its `v_only`), from
-- real counts, idempotently, so any signed-in screen may run it: the member's
-- Challenges screen and the owner's Challenges page do, on load.
grant execute on function settle_challenges() to authenticated;

create or replace function migration_0159_applied() returns boolean
language sql immutable as $marker$ select true $marker$;
revoke all on function migration_0159_applied() from public, anon;
grant execute on function migration_0159_applied() to authenticated;
comment on function migration_0159_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0159.sql
