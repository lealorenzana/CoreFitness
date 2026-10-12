-- ============================================================================
-- 0198 — A free trial stops on its last day, for everyone at the gym
-- ============================================================================
--
-- 0139 gave a trial an end (paid_until), but the end was read like a missed
-- payment: the platform's grace days (default 7) followed it, and then the gym
-- went read-only while everything still opened. A 7-day trial ran two weeks
-- and never really stopped.
--
-- From now on:
--   1. The trial plan is 7 days. The platform still sets any gym's end by hand
--      (GymProfile → Billing, platform_set_billing), worded for a trial here.
--   2. A gym that has never paid, on a plan with a free period, whose
--      paid_until has passed, is locked with the reason 'trial_ended' the day
--      after — no grace. Grace stays for a gym that has paid and is late.
--   3. gym_writable() reads gym_lock_reason(), so every write at that gym is
--      refused in SQL from that day (0113). The apps go further: the owner and
--      desk see only "Your free trial has ended" and how to pay; members and
--      coaches see the gym's app paused, nothing else.
--   4. Paying (PayMongo, or a verified reference) writes gym_payments, so the
--      gym is no longer on trial and the lock lifts by itself.
--   5. Gym #1 becomes the platform's own test gym: never listed in Find your
--      gym or the site's gym list.
--
-- Gym #1 has no paid_until (0097), so it never locks.
-- ============================================================================

update platform_plans
   set trial_days = 7,
       blurb = case when blurb is null or blurb ilike '%30 days%' then 'Everything, free for 7 days' else blurb end
 where key = 'trial';

-- The day a trial is over: the gym never paid, its plan has a free period,
-- and today is past its last day.
create or replace function gym_trial_over(p_gym uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select g.paid_until is not null
                      and g.paid_until < (now() at time zone 'Asia/Manila')::date
                     from gyms g where g.id = p_gym), false)
     and gym_on_trial(p_gym);
$$;
revoke all on function gym_trial_over(uuid) from public, anon;
grant execute on function gym_trial_over(uuid) to authenticated;

create or replace function gym_lock_reason(p_gym uuid default null) returns text
language sql stable security definer set search_path = public as $$
  select case
           when g.status = 'archived'  then 'archived'
           when g.status = 'cancelled' then 'cancelled'
           when g.status = 'suspended' then 'suspended'
           when gym_trial_over(g.id)   then 'trial_ended'
           when g.paid_until is not null
                and g.paid_until < (now() at time zone 'Asia/Manila')::date - platform_grace_days() then 'overdue'
         end
  from gyms g
  where g.id = coalesce(p_gym, current_gym_id());
$$;

create or replace function gym_state(p_gym uuid default null)
returns text
language sql stable security definer set search_path = public as $$
  select case
    when g.status = 'archived'  then 'archived'
    when g.status = 'cancelled' then 'cancelled'
    when g.status = 'suspended' then 'suspended'
    when not exists (select 1 from gym_roles r
                      where r.gym_id = g.id and r.role = 'admin' and r.status = 'active')
      then 'no_owner'
    when g.onboarded_at is null and not gym_trial_over(g.id) then 'onboarding'
    when gym_trial_over(g.id) then 'trial_ended'
    when g.paid_until is not null
         and g.paid_until < (now() at time zone 'Asia/Manila')::date - platform_grace_days() then 'overdue'
    when g.paid_until is not null
         and g.paid_until < (now() at time zone 'Asia/Manila')::date then 'due'
    when not exists (select 1 from gym_payments x where x.gym_id = g.id)
         and coalesce((select pp.trial_days from platform_plans pp where pp.key = g.plan), 0) > 0
      then 'trial'
    else 'active'
  end
  from gyms g
  where g.id = coalesce(p_gym, current_gym_id());
$$;

-- The owner's page: a trial has no grace, so its first locked day is the next one.
create or replace function my_gym_subscription()
returns table (plan_name text, price_monthly numeric, paid_until date, days_left int,
               grace_days int, read_only_on date, lock_reason text,
               max_members int, members int, max_staff int, staff int, on_trial boolean)
language sql stable security definer set search_path = public as $$
  select pp.name, pp.price_monthly, g.paid_until,
         case when g.paid_until is null then null else (g.paid_until - (now() at time zone 'Asia/Manila')::date)::int end,
         case when gym_on_trial(g.id) then 0 else platform_grace_days() end,
         case when g.paid_until is null then null
              when gym_on_trial(g.id) then g.paid_until + 1
              else g.paid_until + platform_grace_days() + 1 end,
         gym_lock_reason(g.id),
         h.max_members, h.members, h.max_staff, h.staff,
         gym_on_trial(g.id)
    from gyms g
    left join platform_plans pp on pp.key = g.plan
    cross join lateral gym_headroom(g.id) h
   where g.id = current_gym_id()
     and get_my_role() is not distinct from 'admin';
$$;

-- 0139's reminders, with a trial's end the end.
create or replace function billing_reminders_sweep() returns int
language plpgsql security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'Asia/Manila')::date;
  v_grace int  := platform_grace_days();
  v_days  int[] := coalesce((select reminder_days from platform_billing where id), '{7,3,1}');
  v_all   boolean := is_platform_admin();
  v_sent  int := 0;
  g record; o record;
  v_left int; v_step text; v_title text; v_msg text; v_locks date; v_trial boolean; v_what text;
begin
  if auth.uid() is null then return 0; end if;
  for g in
    select x.id, x.name, x.paid_until from gyms x
     where x.status = 'active' and x.paid_until is not null
       and (v_all or x.id = current_gym_id())
  loop
    v_left  := g.paid_until - v_today;
    v_trial := gym_on_trial(g.id);
    v_locks := g.paid_until + case when v_trial then 0 else v_grace end + 1;   -- the first locked day
    v_what  := case when v_trial then 'Your free trial' else 'Your Core Fitness plan' end;
    v_step  := null;
    if v_left > 0 and v_left = any (v_days) then
      v_step := 'before-' || v_left;
      v_title := v_what || case when v_trial then ' ends in ' else ' runs out in ' end
                 || v_left || ' day' || case when v_left = 1 then '' else 's' end;
      v_msg := case when v_trial
                 then 'It ends ' || to_char(g.paid_until, 'FMDD Mon YYYY') || '. The next day the app stops for you, your staff and your members until you choose a plan.'
                 else 'Covered to ' || to_char(g.paid_until, 'FMDD Mon YYYY') || '. Pay Core Fitness before then to keep everything running.' end;
    elsif v_left = 0 then
      v_step := 'today';
      v_title := v_what || case when v_trial then ' ends today' else ' runs out today' end;
      v_msg := case when v_trial
                 then 'Tomorrow the app stops for you, your staff and your members until you choose a plan. Nothing is deleted.'
                 else 'After today you have ' || v_grace || ' day' || case when v_grace = 1 then '' else 's' end
                      || ' before the system goes read-only on ' || to_char(v_locks, 'FMDD Mon YYYY') || '.' end;
    elsif v_left = -1 and v_today < v_locks then
      v_step := 'overdue';
      v_title := 'Your Core Fitness payment is overdue';
      v_msg := 'The system goes read-only on ' || to_char(v_locks, 'FMDD Mon YYYY')
               || '. Nothing is deleted; it comes straight back when it is paid.';
    elsif v_today >= v_locks then
      v_step := 'locked';
      v_title := case when v_trial then 'Your free trial has ended' else 'Your gym is read-only' end;
      v_msg := case when v_trial
                 then 'The free trial ended ' || to_char(g.paid_until, 'FMDD Mon YYYY')
                      || '. The app is paused for everyone at your gym until you choose a plan. Everything is still here.'
                 else 'Core Fitness was due ' || to_char(g.paid_until, 'FMDD Mon YYYY')
                      || '. Everything is still here and comes straight back when it is paid.' end;
    end if;
    continue when v_step is null;

    for o in select r.user_id from gym_roles r
              where r.gym_id = g.id and r.role = 'admin' and r.status = 'active'
    loop
      if notify_once(o.user_id, 'system', v_title, v_msg, '/subscription',
                     'billing:' || g.id || ':' || g.paid_until || ':' || v_step, g.id) then
        v_sent := v_sent + 1;
      end if;
    end loop;
  end loop;
  return v_sent;
end;
$$;
revoke all on function billing_reminders_sweep() from public, anon;
grant execute on function billing_reminders_sweep() to authenticated;

-- 0164's "set the date", told to the owner as a trial when it is one.
create or replace function platform_set_billing(p_gym uuid, p_paid_until date, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_name text; a uuid; v_trial boolean;
begin
  if not is_platform_admin() then raise exception 'Only the platform sets a gym''s billing.' using errcode = '42501'; end if;
  select name into v_name from gyms where id = p_gym;
  if v_name is null then raise exception 'That gym does not exist.'; end if;
  if p_paid_until is not null and p_paid_until < (now() at time zone 'Asia/Manila')::date then
    raise exception 'Covered-until is today or later — a past date would lock the gym at once.';
  end if;
  v_trial := gym_on_trial(p_gym) and p_paid_until is not null;
  update gyms set paid_until = p_paid_until where id = p_gym;
  perform platform_log(p_gym, case when p_paid_until is null then 'billing.cleared'
                                   when v_trial then 'billing.trial_end' else 'billing.started' end,
    case when p_paid_until is null then v_name || ' needs no billing'
         when v_trial then v_name || '''s free trial ends ' || to_char(p_paid_until, 'Mon DD, YYYY')
         else v_name || ' is billed — covered until ' || to_char(p_paid_until, 'Mon DD, YYYY') end
      || case when coalesce(btrim(p_note), '') = '' then '' else ': ' || btrim(p_note) end,
    jsonb_build_object('paid_until', p_paid_until, 'trial', v_trial));
  for a in select user_id from gym_roles where gym_id = p_gym and role = 'admin' and status = 'active' loop
    perform notify_once(a, 'system',
      case when p_paid_until is null then 'No billing for your gym'
           when v_trial then 'Your free trial ends ' || to_char(p_paid_until, 'Mon DD')
           else 'Your Core Fitness plan is covered until ' || to_char(p_paid_until, 'Mon DD') end,
      case when p_paid_until is null then 'Core Fitness has set your gym as one that is not billed.'
           when v_trial then 'The day after, the app stops for you, your staff and your members until you choose a plan. ' || coalesce(btrim(p_note), '')
           else 'Pay before then from Your plan to keep everything open. ' || coalesce(btrim(p_note), '') end,
      '/subscription', 'billing-set:' || p_gym || ':' || coalesce(p_paid_until::text, 'none'), p_gym);
  end loop;
end;
$$;
revoke all on function platform_set_billing(uuid, date, text) from public, anon;
grant execute on function platform_set_billing(uuid, date, text) to authenticated;

-- Gym #1 is the platform's own test gym from 2026-10-12 (scripts/fresh-start):
-- never listed to the public. Its members join by being added at its desk.
create or replace function gym_finder(p_search text default null)
returns table (id uuid, slug text, name text, short_name text, logo_url text, accent text, tagline text,
               join_policy text, latitude numeric, longitude numeric, address text)
language sql stable security definer set search_path = public as $$
  select g.id, g.slug, g.name, s.short_name, s.logo_url, coalesce(s.accent, 'violet'),
         nullif(btrim(coalesce(s.tagline, '')), ''),
         coalesce(s.join_policy, 'open'), g.latitude, g.longitude, nullif(btrim(coalesce(s.address, '')), '')
    from gyms g left join gym_settings s on s.gym_id = g.id
   where g.status = 'active'
     and g.id <> gym_one()
     and (nullif(btrim(coalesce(p_search, '')), '') is null
          or g.name ilike '%' || btrim(p_search) || '%' or g.slug ilike '%' || btrim(p_search) || '%'
          or coalesce(s.address, '') ilike '%' || btrim(p_search) || '%')
   order by g.name
   limit 300;
$$;
revoke all on function gym_finder(text) from public;
grant execute on function gym_finder(text) to anon, authenticated;

create or replace function list_gyms(p_search text default null)
returns table (id uuid, slug text, name text, short_name text, logo_url text,
               accent text, accent_action text, tagline text)
language sql stable security definer set search_path = public as $$
  select g.id, g.slug, g.name, s.short_name, s.logo_url,
         coalesce(s.accent, 'violet'), s.accent_action,
         nullif(btrim(coalesce(s.tagline, '')), '')
  from gyms g left join gym_settings s on s.gym_id = g.id
  where g.status = 'active'
    and g.id <> gym_one()
    and coalesce(s.join_policy, 'open') = 'open'
    and (p_search is null or g.name ilike '%' || p_search || '%' or g.slug ilike '%' || p_search || '%')
  order by g.name
  limit 50;
$$;
grant execute on function list_gyms(text) to anon, authenticated;

create or replace function migration_0198_applied() returns boolean
language sql immutable as $marker$ select true $marker$;
revoke all on function migration_0198_applied() from public, anon;
grant execute on function migration_0198_applied() to authenticated;
comment on function migration_0198_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0198.sql
