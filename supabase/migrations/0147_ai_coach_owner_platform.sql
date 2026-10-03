-- ============================================================================
-- 0147 — the AI coach, Phase 5: the owner's limits and totals, the platform's spend
-- ============================================================================
-- Spec: docs/superpowers/specs/2026-09-29-ai-coach-design.md (Phase 5).
--
-- 0143 gave the coach two limits (gym_settings.ai_daily_messages /
-- ai_monthly_messages) and counted every message in ai_usage_days, which only
-- the member can read row by row. This adds:
--   1. set_ai_coach_limits() — the gym's OWNER (an active admin) changes the two
--      limits, refused in plain sentences; the desk cannot.
--   2. gym_ai_usage() — the owner and the desk read this Manila month's TOTALS:
--      messages, tokens, an estimated cost, and how many members used it — a
--      count, never who, never any message text.
--   3. platform_ai_usage() — the platform reads messages, tokens and estimated
--      spend per gym, nothing per member.
--   4. platform_gym_usage() — 0140's body, unchanged, plus a `coach` feature.
--
-- The estimate is the coach model's list price, Claude Sonnet 5.5: $2 per
-- million input tokens, $10 per million output tokens. It is an estimate; the
-- real bill is on console.anthropic.com.
-- ============================================================================

-- ---- 1. the limits: the owner only -------------------------------------------------------------
create or replace function set_ai_coach_limits(p_daily int, p_monthly int) returns void
language plpgsql security definer set search_path = public as $$
declare v_gym uuid := current_gym_id(); v_n int;
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
  update gym_settings set ai_daily_messages = p_daily, ai_monthly_messages = p_monthly
   where gym_id = v_gym;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'This gym has no settings yet. Finish setting it up first.';
  end if;
end;
$$;

-- ---- 2. the gym's totals: owner and desk, counts only ------------------------------------------
create or replace function gym_ai_usage() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_gym uuid := current_gym_id();
  v_today date := manila_today();
  v_start date := date_trunc('month', manila_today())::date;
  v_daily int; v_monthly int;
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
    'messages_month', v_msgs, 'tokens_in_month', v_in, 'tokens_out_month', v_out,
    'messages_today', v_today_n, 'members_using_month', v_people,
    'est_cost_usd_month', round(v_in * 2 / 1e6 + v_out * 10 / 1e6, 4)::numeric(10,4),
    'days', v_days);
end;
$$;

-- ---- 3. the platform: per gym, the last p_days Manila days -------------------------------------
create or replace function platform_ai_usage(p_days int default 30)
returns table (gym_id uuid, messages bigint, tokens_in bigint, tokens_out bigint, est_cost_usd numeric)
language sql stable security definer set search_path = public as $$
  select u.gym_id, sum(u.messages)::bigint, sum(u.tokens_in)::bigint, sum(u.tokens_out)::bigint,
         round(sum(u.tokens_in) * 2 / 1e6 + sum(u.tokens_out) * 10 / 1e6, 4)
    from ai_usage_days u
   where is_platform_admin()
     and u.day > manila_today() - greatest(1, least(coalesce(p_days, 30), 365))
   group by u.gym_id
   order by 5 desc;
$$;

-- ---- 4. what each gym uses: 0140's body, plus the coach ----------------------------------------
create or replace function platform_gym_usage(p_days int default 30)
returns table (gym_id uuid, feature text, n bigint)
language plpgsql stable security definer set search_path = public as $$
declare f record; v_days int := greatest(1, least(coalesce(p_days, 30), 365));
begin
  if not is_platform_admin() then return; end if;
  for f in select * from (values
      ('checkins', 'attendance', 'check_in_time'), ('classes', 'bookings', 'created_at'),
      ('pt', 'pt_sessions', 'created_at'), ('workouts', 'workout_logs', 'created_at'),
      ('programs', 'program_enrolments', 'created_at'), ('rooms', 'room_posts', 'created_at'),
      ('chat', 'messages', 'created_at'), ('shop', 'shop_sales', 'created_at'),
      ('rewards', 'reward_redemptions', 'created_at'), ('squads', 'squads', 'created_at'),
      ('referrals', 'referrals', 'created_at'), ('photos', 'progress_photos', 'created_at'),
      ('payments', 'payments', 'created_at')
    ) as t(key, tbl, col) loop
    if to_regclass('public.' || f.tbl) is null then continue; end if;
    begin
      return query execute format(
        'select gym_id, %L::text, count(*)::bigint from %I where %I > now() - make_interval(days => %s) group by gym_id',
        f.key, f.tbl, f.col, v_days);
    exception when undefined_column then continue;
    end;
  end loop;
  -- The coach is counted in messages (a day row holds many), by Manila day.
  return query
    select u.gym_id, 'coach'::text, sum(u.messages)::bigint
      from ai_usage_days u where u.day > manila_today() - v_days group by u.gym_id;
end;
$$;

revoke all on function set_ai_coach_limits(int, int), gym_ai_usage(), platform_ai_usage(int),
  platform_gym_usage(int) from public, anon;
grant execute on function set_ai_coach_limits(int, int), gym_ai_usage(), platform_ai_usage(int),
  platform_gym_usage(int) to authenticated;

create or replace function migration_0147_applied() returns boolean
language sql immutable as $$ select true $$;
revoke all on function migration_0147_applied() from public, anon;
grant execute on function migration_0147_applied() to authenticated;
comment on function migration_0147_applied() is 'Probe marker: 0147 (AI coach owner limits and usage, platform spend) is live.';
