-- 0140 — What the platform can see, deeper: capacity over time, the whole
-- activity log, what each gym uses, and a gym's data taken home.
--
-- 1. CAPACITY OVER TIME. 0138 measured the free tier once, on screen. A daily
--    snapshot (taken when the platform opens Capacity — pg_cron is optional)
--    turns that into a trend and a projection: "at this rate, full in N
--    months". Plus the detail behind the totals: rows per table (the planner's
--    estimate, never a scan), objects per bucket, each gym's own footprint in
--    rows and files, and the largest files — by size and owner gym, never by
--    name, because a file name can be a person's.
-- 2. THE ACTIVITY LOG. platform_events_recent() returned the last N. The log
--    is now searchable: words, gym, action, dates (Manila), paged, with a total.
-- 3. WHAT EACH GYM USES. 0136 counted how many gyms touched each feature; this
--    is the same list per gym — how much each gym used each feature in N days.
--    Counts only.
-- 4. A GYM'S DATA, TAKEN HOME. The one place the platform reads a gym's rows,
--    so it is fenced three ways:
--      - only when the gym has left (cancelled/archived) or has granted
--        support access (0113) — the gym's consent, not the platform's say-so;
--      - only the business records a gym would take with it (people, their
--        memberships and payments, attendance, bookings, classes, events,
--        coaching sessions, the shop, points and rewards). Never chat,
--        progress photos, the assistant, health answers, body data or
--        workouts (the member's, not the gym's), invitation tokens or a
--        trainer's credentials;
--      - logged, and the gym's owners are told the same day.

-- ============================================================================
-- 1. CAPACITY OVER TIME
-- ============================================================================
create table if not exists platform_capacity_snapshots (
  day             date primary key,
  db_bytes        bigint not null,
  storage_bytes   bigint not null,
  storage_objects int not null,
  mau             int not null,
  taken_at        timestamptz not null default now()
);
alter table platform_capacity_snapshots enable row level security;
comment on table platform_capacity_snapshots is
  'One size reading per Manila day (0140). RLS on, no policy: snapshot_capacity() writes, platform_capacity_history() reads.';

create or replace function snapshot_capacity() returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then return; end if;
  insert into platform_capacity_snapshots (day, db_bytes, storage_bytes, storage_objects, mau)
  values ((now() at time zone 'Asia/Manila')::date,
          pg_database_size(current_database()),
          coalesce((select sum((o.metadata ->> 'size')::bigint) from storage.objects o), 0),
          (select count(*)::int from storage.objects),
          (select count(*)::int from auth.users u
            where (to_jsonb(u) ->> 'last_sign_in_at')::timestamptz > now() - interval '30 days'))
  on conflict (day) do update
    set db_bytes = excluded.db_bytes, storage_bytes = excluded.storage_bytes,
        storage_objects = excluded.storage_objects, mau = excluded.mau, taken_at = now();
end;
$$;

create or replace function platform_capacity_history(p_days int default 90)
returns table (day date, db_bytes bigint, storage_bytes bigint, storage_objects int, mau int)
language sql stable security definer set search_path = public as $$
  select s.day, s.db_bytes, s.storage_bytes, s.storage_objects, s.mau
    from platform_capacity_snapshots s
   where is_platform_admin()
     and s.day > (now() at time zone 'Asia/Manila')::date - greatest(1, least(coalesce(p_days, 90), 730))
   order by s.day;
$$;

-- The detail behind 0138's totals. kind: table | bucket | file.
--   table:  used = bytes, n = estimated rows
--   bucket: used = bytes, n = objects
--   file:   used = bytes, n = null; label = bucket and owning gym, never the file's name
create or replace function platform_capacity_details()
returns table (kind text, key text, label text, used bigint, n bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_platform_admin() then return; end if;

  return query
    select 'table'::text, c.relname::text, c.relname::text, pg_total_relation_size(c.oid)::bigint,
           greatest(c.reltuples, 0)::bigint
      from pg_class c
     where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
     order by pg_total_relation_size(c.oid) desc
     limit 12;

  return query
    select 'bucket'::text, o.bucket_id::text, o.bucket_id::text,
           coalesce(sum((o.metadata ->> 'size')::bigint), 0)::bigint, count(*)::bigint
      from storage.objects o
     group by o.bucket_id
     order by 4 desc;

  return query
    select 'file'::text, o.id::text,
           o.bucket_id || ' · ' || coalesce(g.name, 'not a gym''s file'),
           coalesce((o.metadata ->> 'size')::bigint, 0), null::bigint
      from storage.objects o
      left join gyms g on (storage.foldername(o.name))[1] = 'gyms' and g.id::text = (storage.foldername(o.name))[2]
     order by coalesce((o.metadata ->> 'size')::bigint, 0) desc
     limit 10;
end;
$$;

-- Each gym's footprint: rows across every gym table (0097's list), and its own files.
create or replace function platform_gym_footprint()
returns table (gym_id uuid, name text, rows bigint, files bigint, file_bytes bigint)
language plpgsql stable security definer set search_path = public as $$
declare v_sql text;
begin
  if not is_platform_admin() then return; end if;
  select string_agg(format('select gym_id, count(*) as n from %I group by gym_id', t), ' union all ')
    into v_sql
    from unnest(tenancy_gym_tables()) t
   where to_regclass('public.' || t) is not null;
  return query execute format($q$
    with r as (select x.gym_id, sum(x.n)::bigint as n from (%s) x group by x.gym_id),
         f as (select (storage.foldername(o.name))[2] as gym, count(*)::bigint as files,
                      coalesce(sum((o.metadata ->> 'size')::bigint), 0)::bigint as bytes
                 from storage.objects o where (storage.foldername(o.name))[1] = 'gyms' group by 1)
    select g.id, g.name::text, coalesce(r.n, 0), coalesce(f.files, 0), coalesce(f.bytes, 0)
      from gyms g left join r on r.gym_id = g.id left join f on f.gym = g.id::text
     order by coalesce(r.n, 0) desc$q$, coalesce(v_sql, 'select null::uuid as gym_id, 0::bigint as n where false'));
end;
$$;

-- ============================================================================
-- 2. THE ACTIVITY LOG, SEARCHABLE
-- ============================================================================
create or replace function platform_events_search(
  p_q text default null, p_gym uuid default null, p_action text default null,
  p_from date default null, p_to date default null, p_limit int default 50, p_offset int default 0)
returns table (id bigint, gym_id uuid, gym_name text, action text, summary text, detail jsonb,
               actor_name text, created_at timestamptz, total bigint)
language sql stable security definer set search_path = public as $$
  select e.id, e.gym_id, g.name::text, e.action, e.summary, e.detail,
         nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
         e.created_at, count(*) over ()
    from platform_events e
    left join gyms g on g.id = e.gym_id
    left join profiles p on p.id = e.actor_id
   where is_platform_admin()
     and (p_q is null or btrim(p_q) = '' or e.summary ilike '%' || btrim(p_q) || '%' or e.action ilike '%' || btrim(p_q) || '%')
     and (p_gym is null or e.gym_id = p_gym)
     and (p_action is null or e.action = p_action or e.action like p_action || '.%')
     and (p_from is null or (e.created_at at time zone 'Asia/Manila')::date >= p_from)
     and (p_to is null or (e.created_at at time zone 'Asia/Manila')::date <= p_to)
   order by e.created_at desc, e.id desc
   limit greatest(1, least(coalesce(p_limit, 50), 500)) offset greatest(0, coalesce(p_offset, 0));
$$;

create or replace function platform_event_actions()
returns table (action text, n bigint)
language sql stable security definer set search_path = public as $$
  select e.action, count(*) from platform_events e where is_platform_admin() group by 1 order by 2 desc;
$$;

-- ============================================================================
-- 3. WHAT EACH GYM USES
-- ============================================================================
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
end;
$$;

-- ============================================================================
-- 4. A GYM'S DATA, TAKEN HOME
-- ============================================================================
create or replace function gym_export_allowed(p_gym uuid) returns text
language sql stable security definer set search_path = public as $$
  select case
    when not is_platform_admin() then 'Only the platform exports a gym.'
    when not exists (select 1 from gyms where id = p_gym) then 'That gym does not exist.'
    when exists (select 1 from gyms where id = p_gym and status in ('cancelled', 'archived')) then null
    when exists (select 1 from support_grants s where s.gym_id = p_gym and s.revoked_at is null and s.expires_at > now()) then null
    else 'A gym''s data is its own. Export is open only when the gym has left Core Fitness, or while it has granted you support access.'
  end;
$$;

-- The business records a gym takes with it. Deliberately NOT here: messages,
-- conversations, progress_photos, assistant_*, waiver_acceptances,
-- member_profiles, body_measurements, fitness_goals, workout_*, personal_records,
-- gym_invitations, trainer_credentials, notifications.
create or replace function gym_export_tables() returns text[] language sql immutable as $$
  select array['attendance','bookings','classes','class_templates','events','event_registrations',
    'membership_plans','memberships','membership_events','payments','pt_sessions','trainer_profiles',
    'shop_products','shop_sales','shop_sale_items','point_ledger','rewards','reward_redemptions',
    'challenges','gym_settings']::text[];
$$;

create or replace function platform_export_gym(p_gym uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_why text := gym_export_allowed(p_gym); v_out jsonb := '{}'; v_rows jsonb; t text; v_name text; o record;
begin
  if v_why is not null then raise exception '%', v_why using errcode = '42501'; end if;
  select name into v_name from gyms where id = p_gym;

  -- People: who they are to this gym, and how to reach them. Nothing else of the profile.
  select coalesce(jsonb_agg(jsonb_build_object(
           'user_id', r.user_id, 'first_name', p.first_name, 'last_name', p.last_name,
           'email', p.email, 'phone', to_jsonb(p) ->> 'phone', 'role', r.role, 'status', r.status,
           'joined', to_jsonb(r) ->> 'created_at') order by r.role, p.last_name), '[]')
    into v_rows
    from gym_roles r join profiles p on p.id = r.user_id
   where r.gym_id = p_gym;
  v_out := v_out || jsonb_build_object('people', v_rows);

  foreach t in array gym_export_tables() loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]'') from %I x where x.gym_id = $1', t)
      into v_rows using p_gym;
    v_out := v_out || jsonb_build_object(t, v_rows);
  end loop;

  perform platform_log(p_gym, 'gym.export', v_name || '''s data was exported',
    jsonb_build_object('tables', (select count(*) from jsonb_object_keys(v_out))));
  for o in select r.user_id from gym_roles r where r.gym_id = p_gym and r.role = 'admin' and r.status = 'active' loop
    perform notify_once(o.user_id, 'system', 'Core Fitness exported your gym''s data',
      'A copy of your gym''s records was downloaded by Core Fitness, as your support access or closure allows.', '/support',
      'export:' || p_gym || ':' || (now() at time zone 'Asia/Manila')::date, p_gym);
  end loop;

  return jsonb_build_object('gym', v_name, 'gym_id', p_gym, 'exported_at', now(), 'tables', v_out);
end;
$$;

revoke all on function snapshot_capacity(), platform_capacity_history(int), platform_capacity_details(), platform_gym_footprint(),
  platform_events_search(text, uuid, text, date, date, int, int), platform_event_actions(), platform_gym_usage(int),
  gym_export_allowed(uuid), platform_export_gym(uuid) from public, anon;
grant execute on function snapshot_capacity(), platform_capacity_history(int), platform_capacity_details(), platform_gym_footprint(),
  platform_events_search(text, uuid, text, date, date, int, int), platform_event_actions(), platform_gym_usage(int),
  gym_export_allowed(uuid), platform_export_gym(uuid) to authenticated;
revoke all on function gym_export_tables() from public, anon;

create or replace function migration_0140_applied() returns boolean
language sql immutable as $$ select true $$;
revoke all on function migration_0140_applied() from public, anon;
grant execute on function migration_0140_applied() to authenticated;
comment on function migration_0140_applied() is 'Probe marker: 0140 (capacity history, activity log, gym usage, gym export) is live.';
