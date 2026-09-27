-- 0130: RETENTION RADAR — who is about to quit, and win-back messages
--
-- Decisions (conversation, 2026-09-27):
--   * At risk is computed from four signals, weighted — visits dropping and a
--     membership ending (the owner's picks) count most; stopped training in the
--     app and missed booked classes count less. Computed on every read, never
--     stored, so it cannot go stale.
--   * Win-back messages exist in every gym SWITCHED OFF; the owner turns each on
--     and may reword it. A member gets a given message at most once a calendar
--     month (Manila). They cover what nothing else does: 0053 already reminds
--     members 7/3/1 days before expiry, so there is no "expiring" win-back here.
--   * Owner and desk only. Members never see a score about themselves.
--
-- Signals (points toward a 0–100 score):
--   no visit in 14+ days (by someone who has visited before) ............ 40
--   visits in the last 14 days under half their own usual pace ........... 25
--     (usual = the 8 weeks before that; only for members with a usual)
--   membership ends within 7 days, no renewal request open .............. 35
--     (within 3 days: 50 — high on its own; that close, it needs a call)
--   logged workouts before, none in 14+ days ............................ 15
--   2+ booked classes in 30 days with no check-in that day .............. 15
-- High ≥ 50, medium ≥ 25. Frozen members are left out — frozen means away on purpose.

-- ---- 1. the radar ---------------------------------------------------------------------------------

create or replace function retention_radar()
returns table (member_id uuid, name text, phone text, photo_url text, score int, level text, reasons text[],
               last_visit timestamptz, visits_14 int, usual_14 numeric, expires_on date, last_contact timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare v_gym uuid := current_gym_id(); v_today date := (now() at time zone 'Asia/Manila')::date;
begin
  if coalesce(storage_role_here(), '') not in ('admin', 'staff') then
    raise exception 'Only the owner and the desk see the retention radar.' using errcode = '42501';
  end if;
  return query
  with m as (
    select p.id, btrim(p.first_name || ' ' || p.last_name) as nm, p.phone, p.photo_url
      from gym_roles r join profiles p on p.id = r.user_id
     where r.gym_id = v_gym and r.role = 'member' and r.status = 'active'
  ),
  ms as (
    select distinct on (x.member_id) x.member_id, x.status, x.expiry_date, coalesce(x.never_expires, false) as forever
      from memberships x where x.gym_id = v_gym
     order by x.member_id, (x.status = 'active') desc, x.expiry_date desc nulls last
  ),
  f as (
    select m.id, m.nm, m.phone, m.photo_url, ms.status, ms.expiry_date, ms.forever,
      (select max(a.check_in_time) from attendance a where a.member_id = m.id and a.gym_id = v_gym) as last_visit,
      (select count(*) from attendance a where a.member_id = m.id and a.gym_id = v_gym
         and a.check_in_time >= now() - interval '14 days')::int as v14,
      (select count(*) from attendance a where a.member_id = m.id and a.gym_id = v_gym
         and a.check_in_time >= now() - interval '70 days' and a.check_in_time < now() - interval '14 days')::numeric / 4 as usual,
      (select max(l.completed_at) from workout_logs l where l.member_id = m.id and l.gym_id = v_gym) as last_log,
      (select count(*) from bookings b join classes c on c.id = b.class_id
        where b.member_id = m.id and b.gym_id = v_gym and b.status = 'approved'
          and c.scheduled_at between now() - interval '30 days' and now()
          and not exists (select 1 from attendance a where a.member_id = m.id and a.gym_id = v_gym
                           and (a.check_in_time at time zone 'Asia/Manila')::date = (c.scheduled_at at time zone 'Asia/Manila')::date))::int as missed,
      exists (select 1 from renewal_requests q where q.member_id = m.id and q.gym_id = v_gym and q.status = 'open') as renewing,
      (select max(s.sent_at) from winback_sends s where s.member_id = m.id and s.gym_id = v_gym) as contacted
      from m left join ms on ms.member_id = m.id
     where coalesce(ms.status::text, '') <> 'frozen'
  ),
  sc as (
    select f.*,
      case when f.last_visit is not null and f.last_visit < now() - interval '14 days' then 40 else 0 end as s_gone,
      case when f.last_visit >= now() - interval '14 days' and f.usual >= 1 and f.v14 < f.usual / 2 then 25 else 0 end as s_drop,
      case when f.status = 'active' and not f.forever and f.expiry_date is not null and not f.renewing
                and f.expiry_date - v_today between 0 and 3 then 50
           when f.status = 'active' and not f.forever and f.expiry_date is not null and not f.renewing
                and f.expiry_date - v_today between 4 and 7 then 35 else 0 end as s_exp,
      case when f.last_log is not null and f.last_log < now() - interval '14 days' then 15 else 0 end as s_app,
      case when f.missed >= 2 then 15 else 0 end as s_miss
      from f
  )
  select sc.id, sc.nm, sc.phone, sc.photo_url,
         least(100, sc.s_gone + sc.s_drop + sc.s_exp + sc.s_app + sc.s_miss),
         case when sc.s_gone + sc.s_drop + sc.s_exp + sc.s_app + sc.s_miss >= 50 then 'high' else 'medium' end,
         array_remove(array[
           case when sc.s_gone > 0 then 'No visit in ' || (v_today - (sc.last_visit at time zone 'Asia/Manila')::date) || ' days' end,
           case when sc.s_drop > 0 then sc.v14 || ' visits in 2 weeks (usually about ' || round(sc.usual) || ')' end,
           case when sc.s_exp > 0 then case when sc.expiry_date = v_today then 'Membership ends today'
                                            else 'Membership ends in ' || (sc.expiry_date - v_today) || ' days' end end,
           case when sc.s_app > 0 then 'Stopped logging workouts' end,
           case when sc.s_miss > 0 then 'Missed ' || sc.missed || ' booked classes this month' end
         ], null),
         sc.last_visit, sc.v14, round(sc.usual, 1), sc.expiry_date, sc.contacted
    from sc
   where sc.s_gone + sc.s_drop + sc.s_exp + sc.s_app + sc.s_miss >= 25
   order by 5 desc, sc.last_visit nulls first;
end;
$$;

-- ---- 2. win-back messages ----------------------------------------------------------------------------

create table if not exists winback_rules (
  gym_id     uuid not null default acting_gym_id() references gyms(id),
  key        text not null check (key in ('no_visit_14', 'no_visit_30', 'lapsed')),
  title      text not null check (length(btrim(title)) between 1 and 80),
  message    text not null check (length(btrim(message)) between 1 and 300),
  is_active  boolean not null default false,
  sort_order int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (gym_id, key)
);

create table if not exists winback_sends (
  id        uuid primary key default gen_random_uuid(),
  gym_id    uuid not null default acting_gym_id() references gyms(id),
  member_id uuid not null references profiles(id) on delete cascade,
  rule_key  text not null,           -- a winback_rules key, or 'manual'
  month     text not null,           -- YYYY-MM (Manila): once per rule per member per month
  sent_by   uuid references profiles(id),
  sent_at   timestamptz not null default now(),
  unique (gym_id, id)
);
-- Automatic sends: at most once a month each. Manual ones are not limited.
create unique index if not exists winback_sends_once_a_month
  on winback_sends (gym_id, member_id, rule_key, month) where rule_key <> 'manual';
create index if not exists winback_sends_member_idx on winback_sends (gym_id, member_id, sent_at desc);

alter table winback_rules enable row level security;
alter table winback_sends enable row level security;
grant select, update on winback_rules to authenticated;
grant select on winback_sends to authenticated;

drop policy if exists winback_rules_read   on winback_rules;
drop policy if exists winback_rules_update on winback_rules;
create policy winback_rules_read on winback_rules for select to authenticated
  using (storage_role_here() in ('admin', 'staff'));
-- The owner words and switches them; the desk reads.
create policy winback_rules_update on winback_rules for update to authenticated
  using (storage_role_here() = 'admin') with check (storage_role_here() = 'admin');
drop policy if exists winback_sends_read on winback_sends;
create policy winback_sends_read on winback_sends for select to authenticated
  using (storage_role_here() in ('admin', 'staff'));

create or replace function seed_winback_rules(p_gym uuid) returns void
language sql security definer set search_path = public as $$
  insert into winback_rules (gym_id, key, title, message, sort_order) values
    (p_gym, 'no_visit_14', 'We miss you', 'It has been two weeks since your last visit. Your spot is waiting — come by this week!', 1),
    (p_gym, 'no_visit_30', 'Still with us?', 'A month without a visit. If something is in the way, reply at the desk — we would love to help you get back on track.', 2),
    (p_gym, 'lapsed', 'Come back', 'Your membership ended recently. Renew at the desk and pick up where you left off.', 3)
  on conflict (gym_id, key) do nothing;
$$;
select seed_winback_rules(g.id) from gyms g;

-- A gym made after this migration gets its three the first time its owner or
-- desk opens Retention: winback_sweep() seeds them (idempotent) before reading.
-- Not a trigger on gyms — a gym's starting rows come from seed_gym_defaults()
-- and nothing else inserts into another gym as a side effect (tenancy-isolation).

-- Sends every switched-on message to everyone it now applies to, once a month
-- each. Re-runnable; called when the owner's dashboard or the radar loads.
create or replace function winback_sweep() returns int
language plpgsql security definer set search_path = public as $$
declare v_gym uuid := current_gym_id(); v_today date := (now() at time zone 'Asia/Manila')::date;
        v_month text := to_char(now() at time zone 'Asia/Manila', 'YYYY-MM'); r record; m uuid; n int := 0;
begin
  if v_gym is null or coalesce(storage_role_here(), '') not in ('admin', 'staff') then return 0; end if;
  perform seed_winback_rules(v_gym);
  for r in select * from winback_rules where gym_id = v_gym and is_active loop
    for m in
      select x.id from gym_roles g join profiles x on x.id = g.user_id
       where g.gym_id = v_gym and g.role = 'member' and g.status = 'active'
         and not exists (select 1 from memberships f where f.member_id = x.id and f.gym_id = v_gym and f.status = 'frozen')
         and case r.key
           when 'no_visit_14' then
             (select max(a.check_in_time) from attendance a where a.member_id = x.id and a.gym_id = v_gym)
               between now() - interval '30 days' and now() - interval '14 days'
           when 'no_visit_30' then
             (select max(a.check_in_time) from attendance a where a.member_id = x.id and a.gym_id = v_gym)
               < now() - interval '30 days'
             -- ...and still paying: a lapsed member gets the 'lapsed' message instead.
             and exists (select 1 from memberships s where s.member_id = x.id and s.gym_id = v_gym and s.status = 'active')
           when 'lapsed' then
             exists (select 1 from memberships s where s.member_id = x.id and s.gym_id = v_gym
                      and s.expiry_date between v_today - 14 and v_today - 1 and not coalesce(s.never_expires, false))
             and not exists (select 1 from memberships s where s.member_id = x.id and s.gym_id = v_gym
                              and s.status = 'active' and (s.never_expires or s.expiry_date >= v_today))
         end
    loop
      insert into winback_sends (gym_id, member_id, rule_key, month) values (v_gym, m, r.key, v_month)
      on conflict (gym_id, member_id, rule_key, month) where rule_key <> 'manual' do nothing;
      if found then
        perform notify_once(m, 'info', r.title, r.message, '/member/home',
                            'winback:' || r.key || ':' || v_month || ':' || m, v_gym);
        n := n + 1;
      end if;
    end loop;
  end loop;
  return n;
end;
$$;

-- The desk's "Send a check-in message" from the radar: recorded, so the radar
-- shows who was already contacted and nobody is pinged twice in a day by two people.
create or replace function send_retention_message(p_member uuid, p_title text, p_message text) returns void
language plpgsql security definer set search_path = public as $$
declare v_gym uuid := current_gym_id();
begin
  if coalesce(storage_role_here(), '') not in ('admin', 'staff') or not gym_writable() then
    raise exception 'Only the owner and the desk send these.' using errcode = '42501';
  end if;
  if not exists (select 1 from gym_roles where gym_id = v_gym and user_id = p_member and role = 'member') then
    raise exception 'That person is not a member here.';
  end if;
  if coalesce(btrim(p_message), '') = '' or length(p_message) > 300 then
    raise exception 'Write a message of up to 300 characters.';
  end if;
  insert into winback_sends (gym_id, member_id, rule_key, month, sent_by)
  values (v_gym, p_member, 'manual', to_char(now() at time zone 'Asia/Manila', 'YYYY-MM'), auth.uid());
  perform notify_once(p_member, 'info', coalesce(nullif(btrim(p_title), ''), 'From your gym'), btrim(p_message),
                      '/member/home', 'retention:' || p_member || ':' || extract(epoch from now())::bigint, v_gym);
end;
$$;

-- This month's win-back results: how many got each message, and how many of
-- them visited within 14 days of it.
create or replace function winback_results()
returns table (rule_key text, sent int, came_back int)
language sql stable security definer set search_path = public as $$
  select s.rule_key, count(*)::int,
         count(*) filter (where exists (select 1 from attendance a where a.member_id = s.member_id and a.gym_id = s.gym_id
                                          and a.check_in_time between s.sent_at and s.sent_at + interval '14 days'))::int
    from winback_sends s
   where s.gym_id = current_gym_id() and storage_role_here() in ('admin', 'staff')
     and s.sent_at >= now() - interval '30 days'
   group by s.rule_key;
$$;

-- ---- 3. tenancy ------------------------------------------------------------------------------------

create or replace function tenancy_gym_tables() returns text[] language sql immutable as $$
  select array['account_status_events','achievement_unlocks','achievements','activity_log',
    'assistant_conversations','assistant_messages','attendance','body_measurements','bookings',
    'cancellation_reasons','cash_closeouts','challenge_participants','challenges','class_templates',
    'class_waitlist','classes','event_registrations','events','fitness_goals','freemium_trials',
    'goal_templates','gym_exercise_media','gym_goals','gym_invitations','gym_modules','gym_photos','gym_plans',
    'gym_program_days','gym_programs','gym_settings','gym_waivers','gym_workout_items','gym_workouts',
    'invoice_counters','member_profiles','member_share_prefs','membership_events',
    'membership_plans','membership_requests','memberships',
    'notifications','payments','pending_registrations','personal_records','plan_features',
    'point_ledger','point_rules',
    'program_enrolments','pt_sessions','referral_codes','referrals','refund_rules','renewal_requests',
    'reward_redemptions','rewards','room_assignments','room_comments','room_members','room_posts',
    'room_submissions','rooms',
    'saved_resources','season_claims','season_tiers','squad_members','squad_weeks','squads',
    'trainer_availability','trainer_credentials','trainer_feedback','trainer_profiles',
    'trainer_ratings','waiver_acceptances','winback_rules','winback_sends','workout_logs','workout_plans',
    'workout_routine_exercises','workout_routines','workout_sets']::text[]
$$;

do $$
declare t text;
begin
  foreach t in array array['winback_rules', 'winback_sends'] loop
    execute format('drop policy if exists tenant_select on %I', t);
    execute format('drop policy if exists tenant_insert on %I', t);
    execute format('drop policy if exists tenant_update on %I', t);
    execute format('drop policy if exists tenant_delete on %I', t);
    execute format('create policy tenant_select on %I as restrictive for select to anon, authenticated
                      using (gym_id = current_gym_id())', t);
    execute format('create policy tenant_insert on %I as restrictive for insert to anon, authenticated
                      with check (gym_id = current_gym_id() and gym_writable())', t);
    execute format('create policy tenant_update on %I as restrictive for update to anon, authenticated
                      using (gym_id = current_gym_id() and gym_writable())
                      with check (gym_id = current_gym_id())', t);
    execute format('create policy tenant_delete on %I as restrictive for delete to anon, authenticated
                      using (gym_id = current_gym_id() and gym_writable())', t);
  end loop;
end $$;

revoke all on function retention_radar(), seed_winback_rules(uuid), winback_sweep(),
  send_retention_message(uuid, text, text), winback_results() from public, anon;
revoke all on function seed_winback_rules(uuid) from authenticated;
grant execute on function retention_radar(), winback_sweep(), send_retention_message(uuid, text, text), winback_results()
  to authenticated;

create or replace function migration_0130_applied() returns boolean
language sql immutable as $marker$ select true $marker$;
revoke all on function migration_0130_applied() from public, anon;
grant execute on function migration_0130_applied() to authenticated;
comment on function migration_0130_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0130.sql
