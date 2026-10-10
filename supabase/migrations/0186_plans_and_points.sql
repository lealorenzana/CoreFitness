-- ============================================================================
-- 0186 — Plans and points: expired means the free tier, starter plans,
--        announcement audiences, and points a gym can switch off
-- ============================================================================
--
-- D1. EXPIRED → THE GYM'S FREE TIER. plan_allows() (0049) answered "no" to
--     everything once a paid plan lapsed, so an expired member lost even what
--     the gym gives away. Now a lapsed or cancelled member keeps exactly what
--     the gym's free tier allows; paid areas lock and explain as before. A
--     FROZEN member still gets nothing (MEMBERSHIP_POLICY: frozen means no
--     access at all). The free library, history and Renew were never gated.
--     And announcements get an audience: members_in_audience() — Everyone ·
--     Free tier · Paid plans · specific plans; an expired member falls in
--     Free tier, never Paid plans.
--
-- D2. STARTER PLANS. A new gym got a copy of Gym #1's plans, prices and all.
--     Now it gets Free, Monthly and Premium with sensible features and NO
--     price yet (price_unset): members never see a plan the owner has not
--     priced, and the setup wizard asks for the prices.
--
-- D4. POINTS OFF. A switch, `points` (a child of Engagement; Seasons, which
--     run on points, move under it). Off: nothing earns points — one guard on
--     the ledger itself, because points arrive from eight different places —
--     while badges, streaks and challenges keep working; the rewards shop and
--     seasons hide.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- D1: plan_allows() — 0049's body, with the free-tier fallback.
-- ---------------------------------------------------------------------------
create or replace function plan_allows(p_member uuid, p_feature text)
returns boolean
language plpgsql stable security definer set search_path = public as $fn$
declare
  m       record;
  v_plan  uuid;
  v_on    boolean;
begin
  -- The gym is never gated by a member's tier (0049, 0048's NULL-safe shape).
  if get_my_role() is not distinct from 'admin'
     or get_my_role() is not distinct from 'staff' then
    return true;
  end if;

  select * into m from current_membership_of(p_member);

  if m.plan_id is not null and membership_is_usable(m.status, m.expiry_date, m.never_expires) then
    v_plan := m.plan_id;
  elsif m.status is not null and m.status::text = 'frozen' then
    -- Frozen means no access at all, and Today says so.
    return false;
  else
    -- Lapsed, cancelled, or never started: the gym's free tier.
    select p.id into v_plan from membership_plans p
     where p.gym_id = coalesce(acting_gym_id(), current_gym_id()) and p.tier = 'free' and p.is_active
     order by p.price, p.created_at limit 1;
    if v_plan is null then return false; end if;
  end if;

  select pf.enabled into v_on
    from plan_features pf
   where pf.plan_id = v_plan
     and pf.feature_key = p_feature;

  return coalesce(v_on, true);
end;
$fn$;

-- Who an announcement reaches. Desk only; ids of active people in the gym.
--   everyone · all_members · all_trainers · free_tier · paid · plans (p_plans)
create or replace function members_in_audience(p_kind text, p_plans uuid[] default null)
returns table (user_id uuid)
language plpgsql stable security definer set search_path = public as $$
declare v_gym uuid := current_gym_id();
begin
  if not is_front_desk() then return; end if;
  if p_kind = 'everyone' then
    return query select r.user_id from gym_roles r where r.gym_id = v_gym and r.status = 'active';
  elsif p_kind = 'all_trainers' then
    return query select r.user_id from gym_roles r where r.gym_id = v_gym and r.status = 'active' and r.role = 'trainer';
  elsif p_kind = 'all_members' then
    return query select r.user_id from gym_roles r where r.gym_id = v_gym and r.status = 'active' and r.role = 'member';
  elsif p_kind in ('free_tier', 'paid', 'plans') then
    perform act_as_gym(v_gym);
    return query
      select r.user_id
        from gym_roles r
        left join lateral (select * from current_membership_of(r.user_id)) m on true
        left join membership_plans p on p.id = m.plan_id
       where r.gym_id = v_gym and r.status = 'active' and r.role = 'member'
         and coalesce(m.status::text, '') <> 'frozen'
         and case p_kind
               when 'free_tier' then not coalesce(membership_is_usable(m.status, m.expiry_date, m.never_expires), false)
                                     or p.tier = 'free'
               when 'paid' then coalesce(membership_is_usable(m.status, m.expiry_date, m.never_expires), false)
                                and p.tier is distinct from 'free'
               else coalesce(membership_is_usable(m.status, m.expiry_date, m.never_expires), false)
                    and m.plan_id = any(coalesce(p_plans, '{}'))
             end;
  end if;
end;
$$;
revoke all on function members_in_audience(text, uuid[]) from public, anon;
grant execute on function members_in_audience(text, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- D2: plans with no price yet.
-- ---------------------------------------------------------------------------
alter table membership_plans add column if not exists price_unset boolean not null default false;

-- Setting a price (any price, ₱0 included, on purpose) means it is set.
create or replace function trg_plan_price_set() returns trigger language plpgsql as $$
begin
  if new.price_unset and new.price is distinct from old.price then new.price_unset := false; end if;
  return new;
end;
$$;
drop trigger if exists plan_price_set on membership_plans;
create trigger plan_price_set before update of price on membership_plans for each row execute function trg_plan_price_set();

-- Members never see a plan the owner has not priced.
drop policy if exists plans_priced_for_members on membership_plans;
create policy plans_priced_for_members on membership_plans as restrictive for select to authenticated
  using (not price_unset or is_front_desk() or is_platform_admin());

create or replace function public_plans(p_gym uuid)
returns table (id uuid, name text, tier plan_tier, price numeric, duration_days int, description text)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.tier, p.price, p.duration_days, p.description
    from membership_plans p
    join gyms g on g.id = p.gym_id and g.status = 'active'
   where p.gym_id = p_gym and p.is_active and not p.price_unset
   order by p.price, p.name;
$$;
revoke all on function public_plans(uuid) from public;
grant execute on function public_plans(uuid) to anon, authenticated;

-- A new gym's defaults: 0098's body, except plans — Free, Monthly and Premium
-- with sensible features and the price left for the owner.
create or replace function seed_gym_defaults(p_gym uuid, p_from uuid default gym_one()) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_new uuid; sp record;
begin
  if auth.uid() is not null and not is_platform_admin() then
    raise exception 'Only the platform can set up a gym.';
  end if;
  if not exists (select 1 from gyms where id = p_gym) then
    raise exception 'No such gym.';
  end if;
  perform act_as_gym(p_gym);

  insert into gym_settings (gym_id, gym_name, activity_options, max_freeze_days_per_year,
                            max_freeze_days_at_once, refund_processing_fee, refund_fee_reason)
  select p_gym, g.name, s.activity_options, s.max_freeze_days_per_year,
         s.max_freeze_days_at_once, s.refund_processing_fee, s.refund_fee_reason
  from gyms g, gym_settings s
  where g.id = p_gym and s.gym_id = p_from
  on conflict (gym_id) do nothing;

  insert into point_rules (gym_id, key, label, points, is_active, sort_order)
  select p_gym, key, label, points, is_active, sort_order from point_rules where gym_id = p_from
  on conflict do nothing;

  insert into cancellation_reasons (gym_id, key, label, applies_to, needs_note, sort_order, is_active)
  select p_gym, key, label, applies_to, needs_note, sort_order, is_active
  from cancellation_reasons where gym_id = p_from
  on conflict do nothing;

  insert into goal_templates (gym_id, key, label, description, measured_as, metric, period_days,
                              target_default, is_active, sort_order)
  select p_gym, key, label, description, measured_as, metric, period_days,
         target_default, is_active, sort_order
  from goal_templates where gym_id = p_from
  on conflict do nothing;

  insert into achievements (gym_id, key, audience, title, description, requirement, icon, tier,
                            category, rule_kind, metric, threshold, metric2, threshold2, active,
                            builtin, sort_order)
  select p_gym, key, audience, title, description, requirement, icon, tier,
         category, rule_kind, metric, threshold, metric2, threshold2, active, builtin, sort_order
  from achievements where gym_id = p_from
  on conflict do nothing;

  insert into refund_rules (gym_id, priority, label, min_days, max_days, requires_visits, percent, is_active)
  select p_gym, priority, label, min_days, max_days, requires_visits, percent, is_active
  from refund_rules where gym_id = p_from
    and not exists (select 1 from refund_rules x where x.gym_id = p_gym);

  -- Starter plans (0186): what each unlocks; the price is the owner's to set.
  -- Tiers are labels (0017, 0056): never 'freemium', which is the one-per-member trial.
  if not exists (select 1 from membership_plans where gym_id = p_gym) then
    for sp in select * from (values
        ('Free',    'free'::plan_tier,    null::int, 'The free library, check-in and the gym''s news.', false, false,
         array[]::text[]),
        ('Monthly', 'premium'::plan_tier,  30,       'Class booking, the workout tracker, challenges and points.', true, false,
         array['workout_tracker', 'challenges', 'points_earn', 'points_redeem']),
        ('Premium', 'pro'::plan_tier,      30,       'Everything in Monthly, plus 1-on-1 coaching, coaching rooms, programs and the AI coach.', true, true,
         array['workout_tracker', 'challenges', 'points_earn', 'points_redeem', 'plan_builder', 'ai_model', 'premium_programs', 'coaching_rooms'])
      ) as t(name, tier, days, description, classes, pt, on_keys) loop
      insert into membership_plans (gym_id, name, tier, price, duration_days, description, is_active,
                                    can_book_classes, can_book_pt, price_unset)
      values (p_gym, sp.name, sp.tier, 0, sp.days, sp.description, true, sp.classes, sp.pt, sp.tier <> 'free')
      returning id into v_new;
      insert into plan_features (gym_id, plan_id, feature_key, enabled, quota)
      select p_gym, v_new, f.key, f.key = any(sp.on_keys), null from features f
      on conflict (plan_id, feature_key) do update set enabled = excluded.enabled;
    end loop;
  end if;

  perform act_as_gym(null);
end;
$$;
revoke all on function seed_gym_defaults(uuid, uuid) from public, anon;

-- ---------------------------------------------------------------------------
-- D4: points, a switch.
-- ---------------------------------------------------------------------------
insert into platform_features (key, label, description, sort_order, parent_key) values
  ('points', 'Points',
   'Members earn points for visits, workouts and challenges, and spend them on rewards. Off: badges, streaks and challenges still work; the rewards shop and seasons hide.',
   55, 'engagement')
on conflict (key) do nothing;
-- Seasons are scored from points, so they live under the points switch.
update platform_features set parent_key = 'points' where key = 'seasons';

-- One guard where every point lands: with points off, nothing is earned.
-- A spend (negative) is still written — a reward redeemed before the switch
-- went off is honoured.
--
-- It reads the OWNER's switch only — not whether the gym's platform plan sells
-- engagement: a gym on a plan without it earned points before 0186 and still
-- does, invisibly, until it upgrades (the shop and seasons are what hide).
create or replace function trg_points_switch() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.points > 0 and exists (select 1 from gym_modules m
                                 where m.gym_id = new.gym_id and m.feature_key = 'points' and not m.enabled) then
    return null;
  end if;
  return new;
end;
$$;
drop trigger if exists a_points_switch on point_ledger;
create trigger a_points_switch before insert on point_ledger for each row execute function trg_points_switch();

create or replace function migration_0186_applied() returns boolean
language sql immutable as $marker$ select true $marker$;
revoke all on function migration_0186_applied() from public, anon;
grant execute on function migration_0186_applied() to authenticated;
comment on function migration_0186_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0186.sql
