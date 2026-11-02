-- 0230 — Plans that pay: size AND features, and a member limit that holds (2026-11-02).
--
-- Until now every plan unlocked all 25 features (0189: "tiers differ by size,
-- never by holding features back") and max_members was a number nothing read —
-- a Starter gym could take 1,000 members. The owner asked for plans that earn:
--
--   Plan     Members  Staff  Monthly  Yearly (two months free)
--   Starter       75      2   ₱1,299   ₱12,990   the essentials
--   Growth       300      6   ₱2,999   ₱29,990   + packages, engagement, the shop, Lobby TV
--   Pro          any    any   ₱5,999   ₱59,990   + the assistant, online payments, analytics
--   Free trial   any    any       ₱0   7 days    everything
--
-- Starter keeps coaches (single sessions) — personal training is the app's core
-- since 0220 — and Growth adds package rooms and coach chat. A gym already on a
-- plan keeps it; nothing is switched off for a gym that is not on the new rows.
-- Features are locked by platform_plan_features.enabled, which gym_plan_allows()
-- (0141) and RLS already read, and Your app already shows as "not in your plan".
--
-- The member limit: a new member — a sign-up, an invitation, a switch from
-- another gym, or the desk approving one — is refused once the gym's ACTIVE
-- members reach its plan's max_members, with words for whoever is acting.
-- Nobody already in is touched. (0108 already refused activating past the cap, but
-- told the desk to archive someone, and let sign-ups queue without end.) my_member_allowance() lets the admin app warn
-- from 90%. Standard and Premium (no price, no gym) are retired.
-- Safe to paste again.

update platform_plans set max_members = 75,  max_staff = 2, price_monthly = 1299, price_yearly = 12990,
       blurb = 'For a gym up to 75 members: the front desk, check-in, members and coaches' where key = 'starter';
update platform_plans set max_members = 300, max_staff = 6, price_monthly = 2999, price_yearly = 29990,
       blurb = 'Up to 300 members, with packages, points and rewards, the shop and Lobby TV' where key = 'growth';
update platform_plans set max_members = null, max_staff = null, price_monthly = 5999, price_yearly = 59990,
       blurb = 'No limit, with the assistant, online payments and analytics' where key = 'pro';
update platform_plans set is_active = false, is_public = false
 where key in ('standard', 'premium') and not exists (select 1 from gyms g where g.plan = platform_plans.key);

-- What each plan unlocks. Every row first (a feature added later opens on), then the locks.
select sync_platform_plan_features();
update platform_plan_features set enabled = true where plan_key in ('trial', 'pro');
update platform_plan_features set enabled = (feature_key in (
  'front_desk', 'checkin', 'requests', 'coaching', 'progress', 'programs', 'photos', 'targets', 'equipment'))
 where plan_key = 'starter';
update platform_plan_features set enabled = (feature_key not in ('assistant', 'online_pay', 'analytics'))
 where plan_key = 'growth';

-- ---- the member limit -------------------------------------------------------------------------------
create or replace function gym_member_limit(p_gym uuid)
returns table (plan_name text, max_members int, active_members int)
language sql stable security definer set search_path = public as $$
  select p.name, p.max_members,
         (select count(*)::int from gym_roles r where r.gym_id = g.id and r.role = 'member' and r.status = 'active')
    from gyms g left join platform_plans p on p.key = g.plan
   where g.id = p_gym;
$$;
revoke all on function gym_member_limit(uuid) from public, anon, authenticated;

-- The admin app's warning: its own gym only.
create or replace function my_member_allowance()
returns table (plan_name text, max_members int, active_members int)
language sql stable security definer set search_path = public as $$
  select * from gym_member_limit(current_gym_id()) where get_my_role() in ('admin', 'staff');
$$;
revoke all on function my_member_allowance() from public, anon;
grant execute on function my_member_allowance() to authenticated;

create or replace function trg_member_limit() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare l record;
begin
  if new.role <> 'member' or new.status not in ('active', 'pending_approval') then return new; end if;
  -- Already counted: an active member staying active, or a pending sign-up waiting (it is refused at approval).
  if tg_op = 'UPDATE' and old.role = 'member' and (old.status = 'active' or new.status = 'pending_approval') then return new; end if;
  select * into l from gym_member_limit(new.gym_id);
  if l.max_members is null or l.active_members < l.max_members then return new; end if;
  if auth.uid() is not distinct from new.user_id then
    raise exception 'This gym is full on its current plan. Ask the front desk — they can make room by upgrading.'
      using errcode = 'P0001', hint = 'member_limit';
  end if;
  raise exception 'Your plan (%) allows % members and you have %. Upgrade your plan to add more.',
    l.plan_name, l.max_members, l.active_members using errcode = 'P0001', hint = 'member_limit';
end;
$fn$;
-- Named to fire before 0108's gym_roles_plan_limits (triggers run in name order): that one still
-- guards staff seats and stays the backstop; this one adds sign-ups and says "upgrade".
drop trigger if exists member_limit on gym_roles;
drop trigger if exists gym_roles_member_limit on gym_roles;
create trigger gym_roles_member_limit before insert or update of status, role on gym_roles
  for each row execute function trg_member_limit();

-- The sign-up screen asks before anyone types: Supabase Auth hides a trigger's words behind
-- "Database error saving new user", so the refusal above cannot speak for itself there.
create or replace function gym_is_full(p_gym uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select l.max_members is not null and l.active_members >= l.max_members from gym_member_limit(p_gym) l), false);
$$;
revoke all on function gym_is_full(uuid) from public;
grant execute on function gym_is_full(uuid) to anon, authenticated;

-- The probe (scripts/probe-migrations.py) asks with the anon key, as for every marker.
create or replace function migration_0230_applied() returns boolean language sql stable as $$ select true $$;
grant execute on function migration_0230_applied() to anon, authenticated;
