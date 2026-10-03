-- ============================================================================
-- 0149 — the platform's numbers explain themselves, support access works,
--        and a password can be reset without an Edge Function
-- ============================================================================
--   1. platform_checkins_breakdown() / platform_checkins_daily(): "432
--      check-ins in 30 days" said nothing about where they came from. Now: per
--      gym, per day, by method, and how many were the demo seed's people
--      (ids 5eed____-0000-4000-8000-…, scripts/demo-data) — a number on the
--      platform's own dashboard that is mostly demo data must say so.
--   2. platform_ai_overview(): the AI coach (0143) and the in-app assistant
--      (0046) per gym — messages, members using it, tokens, an estimated cost.
--      Counts only. Works before 0143 is pasted (the coach columns are then 0).
--      platform_feature_adoption() and platform_gym_usage() gain both.
--   3. platform_support_snapshot(): what support access was for. 0113's
--      enter_support_session() set a session setting, but every PostgREST call
--      is its own transaction on a pooled connection, so nothing read it and
--      "Look" opened nothing. This returns the gym as one read-only document
--      while — and only while — the gym's own grant is live, logs the visit in
--      both logs, and never includes chat, photos, health answers, workouts,
--      the assistant, or an invitation's token.
--   4. platform_reset_gym_password(): the reset-gym-password Edge Function is
--      the right tool, but "Failed to send a request to the Edge Function"
--      means it is not deployed — and support cannot wait for a deploy. Same
--      rules (platform only; only a gym's owner or desk, as
--      platform_gym_people() lists them), done in SQL with pgcrypto's bcrypt,
--      which is what Supabase Auth stores.
-- ============================================================================

-- ---- 1. check-ins, explained ---------------------------------------------------------------------
create or replace function platform_checkins_breakdown(p_days int default 30)
returns table (gym_id uuid, name text, logo_url text, accent text, checkins int, demo int,
               people int, last_at timestamptz, by_method jsonb)
language sql stable security definer set search_path = public as $$
  with a as (
    select a.gym_id, a.member_id, a.check_in_time, a.method::text as method,
           a.member_id::text like '5eed____-0000-4000-8000-%' as is_demo
      from attendance a
     where a.check_in_time > now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365)))
  )
  select g.id, g.name, nullif(btrim(s.logo_url), ''), coalesce(s.accent, 'violet'),
         count(a.member_id)::int, count(a.member_id) filter (where a.is_demo)::int,
         count(distinct a.member_id)::int, max(a.check_in_time),
         coalesce((select jsonb_object_agg(x.method, x.n) from (
                     select a2.method, count(*) as n from a a2 where a2.gym_id = g.id group by a2.method) x), '{}'::jsonb)
    from gyms g
    left join gym_settings s on s.gym_id = g.id
    left join a on a.gym_id = g.id
   where is_platform_admin()
   group by g.id, g.name, s.logo_url, s.accent
   order by 5 desc, g.name;
$$;

create or replace function platform_checkins_daily(p_days int default 30)
returns table (day date, checkins int, demo int)
language sql stable security definer set search_path = public as $$
  with d as (
    select generate_series((now() at time zone 'Asia/Manila')::date - (greatest(1, least(coalesce(p_days, 30), 365)) - 1),
                           (now() at time zone 'Asia/Manila')::date, interval '1 day')::date as day
  )
  select d.day,
         (select count(*)::int from attendance a where (a.check_in_time at time zone 'Asia/Manila')::date = d.day),
         (select count(*)::int from attendance a where (a.check_in_time at time zone 'Asia/Manila')::date = d.day
             and a.member_id::text like '5eed____-0000-4000-8000-%')
    from d
   where is_platform_admin()
   order by d.day;
$$;
revoke all on function platform_checkins_breakdown(int), platform_checkins_daily(int) from public, anon;
grant execute on function platform_checkins_breakdown(int), platform_checkins_daily(int) to authenticated;

-- ---- 2. AI, per gym ---------------------------------------------------------------------------------
create or replace function platform_ai_overview(p_days int default 30)
returns table (gym_id uuid, name text, coach_messages bigint, coach_members int, tokens_in bigint,
               tokens_out bigint, est_cost_usd numeric, assistant_messages bigint, assistant_members int)
language plpgsql stable security definer set search_path = public as $$
declare
  v_days  int := greatest(1, least(coalesce(p_days, 30), 365));
  -- The coach's day rows exist only once 0143 is pasted; before that, zeros.
  v_coach text := case when to_regclass('public.ai_usage_days') is not null then format(
    'select gym_id, sum(messages)::bigint m, count(distinct member_id)::int c, sum(tokens_in)::bigint i,
            sum(tokens_out)::bigint o
       from ai_usage_days where day > (now() at time zone ''Asia/Manila'')::date - %s group by gym_id', v_days)
    else 'select null::uuid gym_id, 0::bigint m, 0 c, 0::bigint i, 0::bigint o where false' end;
begin
  if not is_platform_admin() then return; end if;
  -- The assistant's member questions only (0046: role 'user'); with 0143 the
  -- coach's own messages carry source = 'coach' and are counted above instead.
  return query execute format($q$
    with coach as (%s),
    asst as (
      select m.gym_id, count(*)::bigint m, count(distinct c.user_id)::int c
        from assistant_messages m join assistant_conversations c on c.id = m.conversation_id
       where m.role = 'user' and m.created_at > now() - make_interval(days => %s)
         and coalesce(to_jsonb(m) ->> 'source', 'assistant') <> 'coach'
       group by m.gym_id)
    select g.id, g.name, coalesce(k.m, 0), coalesce(k.c, 0), coalesce(k.i, 0), coalesce(k.o, 0),
           round(coalesce(k.i, 0) * 2 / 1e6 + coalesce(k.o, 0) * 10 / 1e6, 4),
           coalesce(a.m, 0), coalesce(a.c, 0)
      from gyms g left join coach k on k.gym_id = g.id left join asst a on a.gym_id = g.id
     order by coalesce(k.m, 0) + coalesce(a.m, 0) desc, g.name $q$, v_coach, v_days);
end;
$$;
revoke all on function platform_ai_overview(int) from public, anon;
grant execute on function platform_ai_overview(int) to authenticated;

-- 0136's adoption list, plus the AI coach and the assistant.
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
      ('photos',    'Progress photos',  'progress_photos',   'created_at'),
      ('coach',     'AI coach',         'ai_usage_days',     'day'),
      ('assistant', 'In-app assistant', 'assistant_messages','created_at')
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

-- 0147's usage grid, plus the assistant; the coach is read only once 0143 exists.
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
  if to_regclass('public.ai_usage_days') is not null then
    return query execute format(
      'select gym_id, ''coach''::text, sum(messages)::bigint from ai_usage_days
        where day > (now() at time zone ''Asia/Manila'')::date - %s group by gym_id', v_days);
  end if;
  return query execute format(
    'select m.gym_id, ''assistant''::text, count(*)::bigint from assistant_messages m
      where m.role = ''user'' and m.created_at > now() - make_interval(days => %s)
        and coalesce(to_jsonb(m) ->> ''source'', ''assistant'') <> ''coach'' group by m.gym_id', v_days);
end;
$$;

-- ---- 3. support access you can actually use --------------------------------------------------------
create or replace function platform_support_snapshot(p_gym uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_grant support_grants; v_name text; v_out jsonb;
begin
  if not is_platform_admin() then
    raise exception 'Only the platform uses support access.' using errcode = '42501';
  end if;
  select * into v_grant from support_grants
   where gym_id = p_gym and revoked_at is null and expires_at > now()
   order by expires_at desc limit 1;
  if v_grant.id is null then
    raise exception 'That gym has not granted support access, or it has ended. Only the gym''s owner can open it, from Your app in their admin app.'
      using errcode = '42501';
  end if;
  select name into v_name from gyms where id = p_gym;

  -- Every visit is in both logs, at most once an hour so a page reload is not a new visit.
  if not exists (select 1 from platform_events e where e.gym_id = p_gym and e.action = 'support.entered'
                   and e.created_at > now() - interval '1 hour') then
    perform platform_log(p_gym, 'support.entered',
      'Looked at ' || coalesce(v_name, 'a gym') || ' using the access it granted', jsonb_build_object('grant', v_grant.id));
    perform log_activity('gym.support_entered', 'support_grants', v_grant.id, null,
      'Core Fitness looked at this gym using the access you granted', '{}'::jsonb, p_gym);
  end if;
  update support_grants set first_used_at = coalesce(first_used_at, now()) where id = v_grant.id;

  v_out := jsonb_build_object(
    'grant', jsonb_build_object('reason', v_grant.reason, 'expires_at', v_grant.expires_at,
              'granted_by', (select nullif(trim(p.first_name || ' ' || p.last_name), '') from profiles p where p.id = v_grant.granted_by)),
    'gym', (select jsonb_build_object('id', g.id, 'name', g.name, 'slug', g.slug, 'status', g.status, 'plan', g.plan,
              'paid_until', g.paid_until, 'created_at', g.created_at, 'onboarded_at', g.onboarded_at,
              'lock_reason', gym_lock_reason(g.id))
              from gyms g where g.id = p_gym),
    'settings', (select jsonb_build_object('phone', s.phone, 'email', s.email, 'address', s.address,
              'join_policy', coalesce(s.join_policy, 'open'), 'join_code', s.join_code, 'accent', s.accent,
              'accent_action', to_jsonb(s) ->> 'accent_action', 'logo_url', s.logo_url)
              from gym_settings s where s.gym_id = p_gym),
    'counts', (select jsonb_object_agg(k, n) from (
              select r.role || ':' || r.status as k, count(*) as n from gym_roles r where r.gym_id = p_gym group by 1) x),
    'staff', coalesce((select jsonb_agg(jsonb_build_object('name', nullif(trim(p.first_name || ' ' || p.last_name), ''),
              'email', p.email, 'role', r.role, 'status', r.status, 'last_sign_in_at', u.last_sign_in_at)
              order by r.role, p.last_name)
              from gym_roles r join profiles p on p.id = r.user_id left join auth.users u on u.id = r.user_id
             where r.gym_id = p_gym and r.role in ('admin', 'staff', 'trainer')), '[]'::jsonb),
    'members', coalesce((select jsonb_agg(x order by x ->> 'joined' desc) from (
              select jsonb_build_object('name', nullif(trim(p.first_name || ' ' || p.last_name), ''), 'email', p.email,
                     'status', r.status, 'joined', to_jsonb(r) ->> 'created_at',
                     'last_sign_in_at', u.last_sign_in_at) as x
                from gym_roles r join profiles p on p.id = r.user_id left join auth.users u on u.id = r.user_id
               where r.gym_id = p_gym and r.role = 'member'
               order by r.created_at desc limit 300) m), '[]'::jsonb),
    -- Invitations without their token: the token is a credential (0111).
    'invitations', coalesce((select jsonb_agg(jsonb_build_object('email', i.email,
              'name', nullif(trim(coalesce(i.first_name, '') || ' ' || coalesce(i.last_name, '')), ''),
              'role', i.role, 'created_at', i.created_at, 'expires_at', i.expires_at,
              'accepted_at', i.accepted_at, 'revoked_at', i.revoked_at,
              'state', case when i.accepted_at is not null then 'accepted' when i.revoked_at is not null then 'withdrawn'
                            when i.expires_at < now() then 'expired' else 'waiting' end,
              'has_account', exists (select 1 from profiles p where lower(p.email) = lower(btrim(i.email))))
              order by i.created_at desc)
              from gym_invitations i where i.gym_id = p_gym), '[]'::jsonb),
    'pending_registrations', (select count(*) from gym_roles r where r.gym_id = p_gym and r.status = 'pending_approval'),
    'activity', coalesce((select jsonb_agg(jsonb_build_object('at', l.occurred_at, 'action', l.action,
              'summary', l.summary, 'by', l.actor_label) order by l.occurred_at desc)
              from (select * from activity_log where gym_id = p_gym order by occurred_at desc limit 60) l), '[]'::jsonb),
    'errors', coalesce((select jsonb_agg(jsonb_build_object('at', c.created_at, 'app', c.app, 'route', c.route,
              'message', c.message) order by c.created_at desc)
              from (select * from client_errors c where (to_jsonb(c) ->> 'gym_id') = p_gym::text
                     and c.created_at > now() - interval '14 days' order by c.created_at desc limit 30) c), '[]'::jsonb),
    'plans', coalesce((select jsonb_agg(jsonb_build_object('name', m.name, 'price', to_jsonb(m) ->> 'price',
              'active', to_jsonb(m) ->> 'is_active') order by m.name)
              from membership_plans m where m.gym_id = p_gym), '[]'::jsonb)
  );
  return v_out;
end;
$$;
revoke all on function platform_support_snapshot(uuid) from public, anon;
grant execute on function platform_support_snapshot(uuid) to authenticated;

-- ---- 4. a password reset that needs no Edge Function ----------------------------------------------
create or replace function platform_reset_gym_password(p_gym uuid, p_user uuid, p_password text)
returns table (email text, is_owner boolean)
language plpgsql security definer set search_path = public, extensions as $$
declare v_email text; v_owner boolean; v_name text;
begin
  if not is_platform_admin() then
    raise exception 'Forbidden — the platform owner only.' using errcode = '42501';
  end if;
  -- The same people the Gyms screen lists and the Edge Function allows: the
  -- gym's admins and desk. Never its members or coaches (docs/TENANCY.md).
  select pp.email, pp.is_owner into v_email, v_owner
    from platform_gym_people(p_gym) pp where pp.user_id = p_user;
  if not found then
    raise exception 'That person does not run this gym. Only a gym''s owner or front desk can be reset here.'
      using errcode = '42501';
  end if;
  if coalesce(length(p_password), 0) < 10 then
    raise exception 'A temporary password needs at least 10 characters.';
  end if;

  update auth.users
     set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
         raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || '{"must_change_password": true}'::jsonb,
         updated_at = now()
   where id = p_user;
  if not found then raise exception 'That account no longer exists.'; end if;

  select name into v_name from gyms where id = p_gym;
  perform platform_log(p_gym, 'gym.password_reset',
    'Gave ' || coalesce(v_email, 'a person') || ' at ' || coalesce(v_name, 'a gym') || ' a new temporary password',
    jsonb_build_object('user', p_user, 'owner', v_owner));
  return query select v_email, v_owner;
end;
$$;
revoke all on function platform_reset_gym_password(uuid, uuid, text) from public, anon;
grant execute on function platform_reset_gym_password(uuid, uuid, text) to authenticated;

create or replace function migration_0149_applied() returns boolean
language sql immutable as $marker$ select true $marker$;
revoke all on function migration_0149_applied() from public, anon;
grant execute on function migration_0149_applied() to authenticated;
comment on function migration_0149_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0149.sql
