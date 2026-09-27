-- 0136: GYM HEALTH & GROWTH — the platform's own retention radar and numbers
--
-- The member-side radar (0130) asks "which members are about to quit this
-- gym?". This asks the same of the service: which GYMS are about to leave
-- Core Fitness, and how is the business moving. All computed on read, never
-- stored; counts and dates only, never a gym's rows (TENANCY).
--
-- Gym risk (0–100, high ≥ 50, medium ≥ 25):
--   no check-ins in 14 days (a gym with members) ........................... 40
--   check-ins in the last 14 days under half its usual (8 weeks before) .... 25
--   no owner has signed in for 21 days ...................................... 20
--   past its paid-until date ................................................ 30
--   paid-until within 7 days ................................................ 10
--   on a free trial that ends within 7 days, nothing paid yet ............... 25
--   let in 7+ days ago and still not set up ................................. 20
--   no members at all after 14 days ......................................... 15

create or replace function platform_gym_health()
returns table (gym_id uuid, name text, logo_url text, accent text, score int, level text, reasons text[],
               checkins_14 int, usual_14 numeric, owner_seen timestamptz)
language sql stable security definer set search_path = public as $$
  with g as (
    select g.id, g.name, g.created_at, g.onboarded_at, g.plan, g.status,
           nullif(btrim(s.logo_url), '') as logo, coalesce(s.accent, 'violet') as accent,
           pp.price_monthly, pp.trial_days,
           case when g.paid_until is null then null
                else (g.paid_until - (now() at time zone 'Asia/Manila')::date)::int end as days_left,
           (select count(*)::int from gym_roles r where r.gym_id = g.id and r.role = 'member' and r.status = 'active') as members,
           (select count(*)::int from attendance a where a.gym_id = g.id and a.check_in_time > now() - interval '14 days') as c14,
           (select count(*)::numeric / 4 from attendance a where a.gym_id = g.id
             and a.check_in_time between now() - interval '70 days' and now() - interval '14 days') as usual,
           (select max(u.last_sign_in_at) from gym_roles r join auth.users u on u.id = r.user_id
             where r.gym_id = g.id and r.role = 'admin' and r.status = 'active') as owner_seen,
           (select coalesce(sum(x.amount), 0) from gym_payments x where x.gym_id = g.id) as paid,
           coalesce(g.paid_until, (g.created_at at time zone 'Asia/Manila')::date + coalesce(pp.trial_days, 0)) as trial_end
      from gyms g
      left join gym_settings s on s.gym_id = g.id
      left join platform_plans pp on pp.key = g.plan
     where is_platform_admin() and g.status = 'active'
  ),
  s as (
    select g.*,
      case when g.members > 0 and g.c14 = 0 and g.created_at < now() - interval '14 days' then 40 else 0 end as s_dead,
      case when g.c14 > 0 and g.usual >= 2 and g.c14 < g.usual / 2 then 25 else 0 end as s_drop,
      case when g.owner_seen is not null and g.owner_seen < now() - interval '21 days' then 20 else 0 end as s_owner,
      case when g.days_left is not null and g.days_left < 0 then 30
           when g.days_left is not null and g.days_left <= 7 then 10 else 0 end as s_pay,
      case when coalesce(g.price_monthly, 0) = 0 and g.trial_days is not null and g.paid = 0
                and g.trial_end - (now() at time zone 'Asia/Manila')::date between 0 and 7 then 25 else 0 end as s_trial,
      case when g.onboarded_at is null and g.created_at < now() - interval '7 days' then 20 else 0 end as s_setup,
      case when g.members = 0 and g.created_at < now() - interval '14 days' then 15 else 0 end as s_empty
      from g
  )
  select s.id, s.name, s.logo, s.accent,
         least(100, s.s_dead + s.s_drop + s.s_owner + s.s_pay + s.s_trial + s.s_setup + s.s_empty),
         case when s.s_dead + s.s_drop + s.s_owner + s.s_pay + s.s_trial + s.s_setup + s.s_empty >= 50 then 'high'
              when s.s_dead + s.s_drop + s.s_owner + s.s_pay + s.s_trial + s.s_setup + s.s_empty >= 25 then 'medium'
              else 'healthy' end,
         array_remove(array[
           case when s.s_dead > 0 then 'No check-ins in 14 days' end,
           case when s.s_drop > 0 then s.c14 || ' check-ins in 2 weeks (usually about ' || round(s.usual) || ')' end,
           case when s.s_owner > 0 then 'Owner last signed in ' || ((now()::date) - (s.owner_seen::date)) || ' days ago' end,
           case when s.s_pay = 30 then (-s.days_left) || ' days past its paid-until date'
                when s.s_pay = 10 then 'Due in ' || s.days_left || ' days' end,
           case when s.s_trial > 0 then 'Free trial ends in ' || (s.trial_end - (now() at time zone 'Asia/Manila')::date) || ' days, nothing paid' end,
           case when s.s_setup > 0 then 'Let in ' || ((now()::date) - (s.created_at::date)) || ' days ago, not set up' end,
           case when s.s_empty > 0 then 'No members yet' end
         ], null),
         s.c14, round(s.usual, 1), s.owner_seen
    from s
   order by 5 desc, s.name;
$$;

-- The business, month by month (Manila months, oldest first).
create or replace function platform_growth(p_months int default 12)
returns table (month date, gyms int, new_gyms int, lost_gyms int, members int, revenue numeric, mrr numeric)
language sql stable security definer set search_path = public as $$
  with m as (
    select (date_trunc('month', (now() at time zone 'Asia/Manila')) - (i || ' months')::interval)::date as ms
      from generate_series(0, least(greatest(coalesce(p_months, 12), 1), 36) - 1) i
  )
  select m.ms,
         (select count(*)::int from gyms g where (g.created_at at time zone 'Asia/Manila')::date < (m.ms + interval '1 month')::date),
         (select count(*)::int from gyms g where date_trunc('month', g.created_at at time zone 'Asia/Manila')::date = m.ms),
         (select count(*)::int from platform_events e where e.action = 'gym.suspended'
           and date_trunc('month', e.created_at at time zone 'Asia/Manila')::date = m.ms),
         -- Members who had joined by the month's end and are still active today:
         -- gym_roles keeps no history of status changes, so members who left
         -- since are not counted in the months they were there. A floor, said so.
         (select count(*)::int from gym_roles r where r.role = 'member' and r.status = 'active'
           and (r.created_at at time zone 'Asia/Manila')::date < (m.ms + interval '1 month')::date),
         (select coalesce(sum(x.amount), 0) from gym_payments x where date_trunc('month', x.paid_on)::date = m.ms),
         -- What the gyms whose paid time covered this month pay per month.
         (select coalesce(sum(pp.price_monthly), 0) from gyms g join platform_plans pp on pp.key = g.plan
           where coalesce(pp.price_monthly, 0) > 0
             and exists (select 1 from gym_payments x where x.gym_id = g.id
                          and coalesce(x.covers_from, x.paid_on) < (m.ms + interval '1 month')::date
                          and x.covers_until >= m.ms))
    from m
   where is_platform_admin()
   order by m.ms;
$$;

-- From asking to paying: where gyms drop out.
create or replace function platform_funnel()
returns table (applied int, let_in int, set_up int, active_30d int, paying int)
language sql stable security definer set search_path = public as $$
  select (select count(*)::int from gym_applications),
         (select count(*)::int from gyms),
         (select count(*)::int from gyms where onboarded_at is not null),
         (select count(distinct a.gym_id)::int from attendance a where a.check_in_time > now() - interval '30 days'),
         (select count(distinct x.gym_id)::int from gym_payments x where x.amount > 0)
   where is_platform_admin();
$$;

-- Which parts of the product gyms use: gyms with any activity in 30 days.
create or replace function platform_feature_adoption()
returns table (feature text, label text, gyms_30d int, gyms_total int)
language plpgsql stable security definer set search_path = public as $$
declare f record; v int; v_total int;
begin
  if not is_platform_admin() then return; end if;
  select count(*)::int into v_total from gyms where status = 'active';
  for f in select * from (values
      ('checkins',  'Check-ins',        'attendance',        'check_in_time'),
      ('classes',   'Class bookings',   'bookings',          'created_at'),
      ('pt',        '1-on-1 sessions',  'pt_sessions',       'created_at'),
      ('workouts',  'Workout tracking', 'workout_logs',      'created_at'),
      ('programs',  'Programs',         'program_enrolments','created_at'),
      ('rooms',     'Coaching rooms',   'room_posts',        'created_at'),
      ('chat',      'Chat',             'messages',          'created_at'),
      ('shop',      'Shop',             'shop_sales',        'created_at'),
      ('rewards',   'Rewards',          'reward_redemptions','created_at'),
      ('squads',    'Squads',           'squads',            'created_at'),
      ('referrals', 'Referrals',        'referrals',         'created_at'),
      ('photos',    'Progress photos',  'progress_photos',   'created_at')
    ) as t(key, label, tbl, col) loop
    if to_regclass('public.' || f.tbl) is null then continue; end if;
    begin
      execute format('select count(distinct gym_id)::int from %I where %I > now() - interval ''30 days''', f.tbl, f.col) into v;
    exception when undefined_column then continue;
    end;
    feature := f.key; label := f.label; gyms_30d := v; gyms_total := v_total;
    return next;
  end loop;
end;
$$;

revoke all on function platform_gym_health(), platform_growth(int), platform_funnel(), platform_feature_adoption() from public, anon;
grant execute on function platform_gym_health(), platform_growth(int), platform_funnel(), platform_feature_adoption() to authenticated;

create or replace function migration_0136_applied() returns boolean
language sql immutable as $marker$ select true $marker$;
revoke all on function migration_0136_applied() from public, anon;
grant execute on function migration_0136_applied() to authenticated;
comment on function migration_0136_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0136.sql
