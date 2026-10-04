-- ============================================================================
-- 0163 — The AI coach's allowance comes from the gym's Core Fitness plan
-- ============================================================================
--
-- 0143/0147 let every gym's owner set the coach's two limits anywhere up to
-- 500 a member a day and 100,000 a month — and the platform pays for every
-- message. Now each platform plan carries a ceiling (NULL = no ceiling beyond
-- those absolute ones), and a gym's limits always sit at or under it:
--
--   * set_ai_coach_limits() refuses a number above the plan's ceiling and says
--     to upgrade, rather than storing it;
--   * a trigger on gym_settings keeps the stored limits at or under the
--     ceiling whatever writes them, and a trigger on gyms re-applies it when a
--     gym moves to a smaller plan, as does a trigger on platform_plans when the
--     platform lowers a plan's ceiling. So the limit ai_claim_message() enforces
--     is always the effective one — nothing reads two numbers and picks;
--   * gym_ai_usage() also returns the ceiling, so Your app can say "your plan
--     allows up to …" and offer the upgrade.
-- ============================================================================

alter table platform_plans
  add column if not exists ai_daily_cap   int check (ai_daily_cap is null or ai_daily_cap between 1 and 500),
  add column if not exists ai_monthly_cap int check (ai_monthly_cap is null or ai_monthly_cap between 1 and 100000);

-- The caps of a gym's plan; nulls when none.
create or replace function gym_ai_caps(p_gym uuid) returns table (daily int, monthly int)
language sql stable security definer set search_path = public as $$
  select pp.ai_daily_cap, pp.ai_monthly_cap from gyms g join platform_plans pp on pp.key = g.plan where g.id = p_gym;
$$;
revoke all on function gym_ai_caps(uuid) from public, anon, authenticated;

create or replace function trg_ai_limits_within_plan() returns trigger
language plpgsql security definer set search_path = public as $$
declare c record;
begin
  select * into c from gym_ai_caps(new.gym_id);
  if c.daily is not null and new.ai_daily_messages > c.daily then new.ai_daily_messages := c.daily; end if;
  if c.monthly is not null and new.ai_monthly_messages > c.monthly then new.ai_monthly_messages := c.monthly; end if;
  return new;
end;
$$;
drop trigger if exists gym_settings_ai_within_plan on gym_settings;
create trigger gym_settings_ai_within_plan before insert or update of ai_daily_messages, ai_monthly_messages on gym_settings
  for each row execute function trg_ai_limits_within_plan();

-- A move to another plan, or the platform lowering a plan's ceiling, re-applies it.
create or replace function trg_ai_reclamp_gym() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update gym_settings set ai_daily_messages = ai_daily_messages where gym_id = new.id;
  return null;
end;
$$;
drop trigger if exists gyms_ai_reclamp on gyms;
create trigger gyms_ai_reclamp after update of plan on gyms for each row execute function trg_ai_reclamp_gym();

create or replace function trg_ai_reclamp_plan() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update gym_settings s set ai_daily_messages = s.ai_daily_messages
    from gyms g where g.id = s.gym_id and g.plan = new.key;
  return null;
end;
$$;
drop trigger if exists platform_plans_ai_reclamp on platform_plans;
create trigger platform_plans_ai_reclamp after update of ai_daily_cap, ai_monthly_cap on platform_plans
  for each row execute function trg_ai_reclamp_plan();

-- ---- the owner's setter says the ceiling out loud ----------------------------------------------------
create or replace function set_ai_coach_limits(p_daily int, p_monthly int) returns void
language plpgsql security definer set search_path = public as $$
declare v_gym uuid := current_gym_id(); v_n int; c record;
begin
  if auth.uid() is null or v_gym is null or not exists (
       select 1 from gym_roles r where r.gym_id = v_gym and r.user_id = auth.uid()
          and r.role = 'admin' and r.status = 'active') then
    raise exception 'Only the gym''s owner can change the coach''s limits.' using errcode = '42501';
  end if;
  if not gym_writable(v_gym) then
    raise exception 'This gym is read-only right now.' using errcode = '42501';
  end if;
  if p_daily is null or p_daily not between 1 and 500 then
    raise exception 'A daily limit is 1 to 500 messages.' using errcode = '22023';
  end if;
  if p_monthly is null or p_monthly not between 1 and 100000 then
    raise exception 'A monthly limit is 1 to 100,000 messages.' using errcode = '22023';
  end if;
  select * into c from gym_ai_caps(v_gym);
  if c.daily is not null and p_daily > c.daily then
    raise exception 'Your Core Fitness plan allows up to % messages a member a day. Upgrade under Your plan for more.', c.daily using errcode = '22023';
  end if;
  if c.monthly is not null and p_monthly > c.monthly then
    raise exception 'Your Core Fitness plan allows up to % messages a month for the whole gym. Upgrade under Your plan for more.', c.monthly using errcode = '22023';
  end if;
  update gym_settings set ai_daily_messages = p_daily, ai_monthly_messages = p_monthly where gym_id = v_gym;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'This gym has no settings yet. Finish setting it up first.';
  end if;
end;
$$;
revoke all on function set_ai_coach_limits(int, int) from public, anon;
grant execute on function set_ai_coach_limits(int, int) to authenticated;

-- ---- the totals now carry the ceiling ----------------------------------------------------------------------
create or replace function gym_ai_usage() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_gym uuid := current_gym_id();
  v_today date := manila_today();
  v_start date := date_trunc('month', manila_today())::date;
  v_daily int; v_monthly int; c record;
  v_msgs int; v_in bigint; v_out bigint; v_today_n int; v_people int; v_days jsonb;
begin
  if auth.uid() is null or v_gym is null or not exists (
       select 1 from gym_roles r where r.gym_id = v_gym and r.user_id = auth.uid()
          and r.role in ('admin', 'staff') and r.status = 'active') then
    raise exception 'Only the gym''s owner and desk can see the coach''s usage.' using errcode = '42501';
  end if;

  select coalesce(s.ai_daily_messages, 30), coalesce(s.ai_monthly_messages, 1500)
    into v_daily, v_monthly from gym_settings s where s.gym_id = v_gym;
  v_daily := coalesce(v_daily, 30); v_monthly := coalesce(v_monthly, 1500);
  select * into c from gym_ai_caps(v_gym);

  select coalesce(sum(u.messages), 0)::int, coalesce(sum(u.tokens_in), 0)::bigint,
         coalesce(sum(u.tokens_out), 0)::bigint,
         count(distinct u.member_id) filter (where u.messages > 0)::int
    into v_msgs, v_in, v_out, v_people
    from ai_usage_days u where u.gym_id = v_gym and u.day between v_start and v_today;
  select coalesce(sum(u.messages), 0)::int into v_today_n
    from ai_usage_days u where u.gym_id = v_gym and u.day = v_today;

  select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'messages', coalesce(t.n, 0)) order by d.day), '[]'::jsonb)
    into v_days
    from (select g::date as day from generate_series(v_start, v_today, interval '1 day') g) d
    left join (select u.day, sum(u.messages)::int as n from ai_usage_days u
                where u.gym_id = v_gym and u.day between v_start and v_today group by u.day) t
      on t.day = d.day;

  return jsonb_build_object(
    'daily_limit', v_daily, 'monthly_limit', v_monthly, 'month_start', v_start,
    'plan_daily_cap', c.daily, 'plan_monthly_cap', c.monthly,
    'messages_month', v_msgs, 'tokens_in_month', v_in, 'tokens_out_month', v_out,
    'messages_today', v_today_n, 'members_using_month', v_people,
    'est_cost_usd_month', round(v_in * 2 / 1e6 + v_out * 10 / 1e6, 4)::numeric(10,4),
    'days', v_days);
end;
$$;
revoke all on function gym_ai_usage() from public, anon;
grant execute on function gym_ai_usage() to authenticated;

-- ---- the platform sets a plan's ceiling ----------------------------------------------------------------------
create or replace function set_plan_ai_caps(p_plan text, p_daily int, p_monthly int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'Only the platform sets a plan''s AI allowance.' using errcode = '42501'; end if;
  update platform_plans set ai_daily_cap = p_daily, ai_monthly_cap = p_monthly where key = p_plan;
  if not found then raise exception 'No such plan.'; end if;
  perform platform_log(null, 'plan.ai_caps', 'AI allowance on ' || p_plan || ': '
    || coalesce(p_daily::text, 'no ceiling') || ' a member a day, ' || coalesce(p_monthly::text, 'no ceiling') || ' a month',
    jsonb_build_object('plan', p_plan, 'daily', p_daily, 'monthly', p_monthly));
end;
$$;
revoke all on function set_plan_ai_caps(text, int, int) from public, anon;
grant execute on function set_plan_ai_caps(text, int, int) to authenticated;

create or replace function migration_0163_applied() returns boolean
language sql immutable as $marker$ select true $marker$;
revoke all on function migration_0163_applied() from public, anon;
grant execute on function migration_0163_applied() to authenticated;
comment on function migration_0163_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0163.sql
