-- 0135: ONE GYM'S PROFILE, FOR THE PLATFORM
--
-- The platform app opened a gym as a small inline panel. It now has a page:
-- who runs it and how to reach them, how its use has moved week by week, which
-- parts of the product it actually uses, its payments, its timeline, and the
-- platform owner's own notes about it.
--
-- The rule from TENANCY holds: COUNTS AND DATES, NEVER A GYM'S ROWS. The people
-- listed are the gym's owner and desk — the platform's counterparties, the ones
-- it invoices and supports — never its members or coaches (0109).
--
-- Notes are the platform's own (gym_notes): no gym ever reads them, so they are
-- not a gym table and not under tenancy's gym policies — is_platform_admin() only.

-- ---- 1. who runs it, and when they last signed in -------------------------------------------

create or replace function platform_gym_contacts(p_gym uuid)
returns table (user_id uuid, name text, email text, phone text, role text, is_owner boolean,
               status text, last_sign_in_at timestamptz, joined_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), p.email, p.phone,
         r.role::text, r.role = 'admin', r.status::text, u.last_sign_in_at, r.created_at
    from gym_roles r
    join profiles p on p.id = r.user_id
    left join auth.users u on u.id = r.user_id
   where r.gym_id = p_gym and r.role in ('admin', 'staff') and is_platform_admin()
   order by r.role = 'admin' desc, 2;
$$;

-- ---- 2. how its use has moved: one row per Manila week ---------------------------------------

create or replace function platform_gym_weeks(p_gym uuid, p_weeks int default 26)
returns table (week_start date, checkins int, new_members int, workouts int, payments numeric)
language sql stable security definer set search_path = public as $$
  with w as (
    select generate_series(
             date_trunc('week', (now() at time zone 'Asia/Manila'))::date - (least(greatest(coalesce(p_weeks, 26), 1), 104) - 1) * 7,
             date_trunc('week', (now() at time zone 'Asia/Manila'))::date, interval '7 days')::date as ws
  )
  select w.ws,
         (select count(*)::int from attendance a where a.gym_id = p_gym
           and (a.check_in_time at time zone 'Asia/Manila')::date between w.ws and w.ws + 6),
         (select count(*)::int from gym_roles r where r.gym_id = p_gym and r.role = 'member'
           and (r.created_at at time zone 'Asia/Manila')::date between w.ws and w.ws + 6),
         (select count(*)::int from workout_logs l where l.gym_id = p_gym and l.completed_at is not null
           and (l.completed_at at time zone 'Asia/Manila')::date between w.ws and w.ws + 6),
         (select coalesce(sum(x.amount), 0) from payments x where x.gym_id = p_gym and x.status = 'completed'
           and coalesce(x.paid_on, (x.created_at at time zone 'Asia/Manila')::date) between w.ws and w.ws + 6)
    from w
   where is_platform_admin()
   order by w.ws;
$$;

-- ---- 3. which parts of the product it uses (last 30 days, and ever) --------------------------

-- Each feature: how many things happened in it. Tables that do not exist on an
-- older database are skipped, so this never breaks on a missing migration.
create or replace function platform_gym_features(p_gym uuid)
returns table (feature text, label text, last_30 int, ever int)
language plpgsql stable security definer set search_path = public as $$
declare f record; v30 int; vall int;
begin
  if not is_platform_admin() then return; end if;
  for f in select * from (values
      ('checkins',  'Check-ins',           'attendance',        'check_in_time'),
      ('classes',   'Class bookings',      'bookings',          'created_at'),
      ('pt',        '1-on-1 sessions',     'pt_sessions',       'created_at'),
      ('workouts',  'Logged workouts',     'workout_logs',      'created_at'),
      ('programs',  'Program enrolments',  'program_enrolments','created_at'),
      ('rooms',     'Coaching room posts', 'room_posts',        'created_at'),
      ('classwork', 'Classwork handed in', 'room_submissions',  'turned_in_at'),
      ('chat',      'Chat messages',       'messages',          'created_at'),
      ('shop',      'Shop sales',          'shop_sales',        'created_at'),
      ('rewards',   'Rewards redeemed',    'reward_redemptions','created_at'),
      ('squads',    'Squads',              'squads',            'created_at'),
      ('referrals', 'Referrals',           'referrals',         'created_at')
    ) as t(key, label, tbl, col) loop
    if to_regclass('public.' || f.tbl) is null then continue; end if;
    begin
      execute format('select count(*) filter (where %I > now() - interval ''30 days'')::int, count(*)::int from %I where gym_id = $1',
                     f.col, f.tbl) into v30, vall using p_gym;
    exception when undefined_column then
      continue;
    end;
    feature := f.key; label := f.label; last_30 := v30; ever := vall;
    return next;
  end loop;
end;
$$;

-- ---- 4. the gym's timeline -------------------------------------------------------------------

create or replace function platform_gym_events(p_gym uuid, p_limit int default 50)
returns setof platform_events
language sql stable security definer set search_path = public as $$
  select * from platform_events
   where gym_id = p_gym and is_platform_admin()
   order by created_at desc
   limit greatest(1, least(coalesce(p_limit, 50), 500));
$$;

-- ---- 5. the platform owner's notes about a gym ---------------------------------------------------

create table if not exists gym_notes (
  id         uuid primary key default gen_random_uuid(),
  gym_id     uuid not null references gyms(id) on delete cascade,
  body       text not null check (length(btrim(body)) between 1 and 2000),
  pinned     boolean not null default false,
  author_id  uuid references profiles(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists gym_notes_gym_idx on gym_notes (gym_id, created_at desc);
alter table gym_notes enable row level security;
grant select, insert, update, delete on gym_notes to authenticated;
drop policy if exists gym_notes_platform on gym_notes;
create policy gym_notes_platform on gym_notes for all to authenticated
  using (is_platform_admin()) with check (is_platform_admin());

-- ---- grants ----------------------------------------------------------------------------------------

revoke all on function platform_gym_contacts(uuid), platform_gym_weeks(uuid, int), platform_gym_features(uuid),
  platform_gym_events(uuid, int) from public, anon;
grant execute on function platform_gym_contacts(uuid), platform_gym_weeks(uuid, int), platform_gym_features(uuid),
  platform_gym_events(uuid, int) to authenticated;

create or replace function migration_0135_applied() returns boolean
language sql immutable as $marker$ select true $marker$;
revoke all on function migration_0135_applied() from public, anon;
grant execute on function migration_0135_applied() to authenticated;
comment on function migration_0135_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0135.sql
