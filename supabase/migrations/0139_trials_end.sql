-- 0139 — A free trial ends.
--
-- Until now a gym let in on the 30-day "Free trial" plan had no paid_until, and
-- 0099's lock only reads paid_until — so the trial ended nowhere, and a trial
-- gym could run for free forever while the plan's own blurb said "Thirty days".
-- 0138's reminders deliberately said nothing about trials for that reason.
--
-- 1. A gym on a plan with trial_days that has never paid gets paid_until =
--    today + trial_days (Manila), by a trigger on gyms — at creation
--    (create_gym, approve-gym) and when the platform moves it onto a trial plan.
--    From then on it is the same date every other rule already reads: the
--    grace period, the lock, gym_state(), the reminders, Money's due list.
-- 2. Existing trial gyms with no date get their trial's end — but never less
--    than 14 days from today, so a trial that ran out months ago is given
--    notice, not locked overnight. Gym #1 (G Fitness) and any gym that has
--    ever paid are never touched.
-- 3. The reminders and the owner's screens say "free trial" while the gym has
--    never paid, rather than "your subscription runs out".

create or replace function trial_end_for(p_gym uuid, p_plan text) returns date
language sql stable security definer set search_path = public as $$
  select (now() at time zone 'Asia/Manila')::date + pp.trial_days
    from platform_plans pp
   where pp.key = p_plan and coalesce(pp.trial_days, 0) > 0
     and not exists (select 1 from gym_payments x where x.gym_id = p_gym);
$$;
revoke all on function trial_end_for(uuid, text) from public, anon, authenticated;

create or replace function trg_gym_trial_ends() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.paid_until is null
     and new.id is distinct from gym_one()
     and (tg_op = 'INSERT' or new.plan is distinct from old.plan) then
    new.paid_until := trial_end_for(new.id, new.plan);   -- NULL for a plan with no trial
  end if;
  return new;
end;
$$;
drop trigger if exists gym_trial_ends on gyms;
create trigger gym_trial_ends before insert or update of plan on gyms
  for each row execute function trg_gym_trial_ends();

-- Existing trial gyms: their trial's end, with at least 14 days' notice.
-- A function so the harness can prove it on rows the migration never saw.
create or replace function settle_trial_dates() returns int
language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  update gyms g
     set paid_until = greatest((g.created_at at time zone 'Asia/Manila')::date + pp.trial_days,
                               (now() at time zone 'Asia/Manila')::date + 14)
    from platform_plans pp
   where pp.key = g.plan and coalesce(pp.trial_days, 0) > 0
     and g.paid_until is null
     and g.id <> gym_one()
     and not exists (select 1 from gym_payments x where x.gym_id = g.id);
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke all on function settle_trial_dates() from public, anon, authenticated;
select settle_trial_dates();

-- A gym that has never paid is on its free trial, whatever its date.
create or replace function gym_on_trial(p_gym uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from gym_payments x where x.gym_id = p_gym)
     and coalesce((select pp.trial_days from gyms g join platform_plans pp on pp.key = g.plan where g.id = p_gym), 0) > 0;
$$;
revoke all on function gym_on_trial(uuid) from public, anon;
grant execute on function gym_on_trial(uuid) to authenticated;

-- 0138's sweep, worded for a trial when the gym has never paid.
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
    v_locks := g.paid_until + v_grace + 1;          -- the first read-only day
    v_trial := gym_on_trial(g.id);
    v_what  := case when v_trial then 'Your free trial' else 'Your Core Fitness plan' end;
    v_step  := null;
    if v_left > 0 and v_left = any (v_days) then
      v_step := 'before-' || v_left;
      v_title := v_what || case when v_trial then ' ends in ' else ' runs out in ' end
                 || v_left || ' day' || case when v_left = 1 then '' else 's' end;
      v_msg := case when v_trial
                 then 'It ends ' || to_char(g.paid_until, 'FMDD Mon YYYY') || '. Pay Core Fitness for a plan to keep everything running.'
                 else 'Covered to ' || to_char(g.paid_until, 'FMDD Mon YYYY') || '. Pay Core Fitness before then to keep everything running.' end;
    elsif v_left = 0 then
      v_step := 'today';
      v_title := v_what || case when v_trial then ' ends today' else ' runs out today' end;
      v_msg := 'After today you have ' || v_grace || ' day' || case when v_grace = 1 then '' else 's' end
               || ' before the system goes read-only on ' || to_char(v_locks, 'FMDD Mon YYYY') || '.';
    elsif v_left = -1 and v_today < v_locks then
      v_step := 'overdue';
      v_title := case when v_trial then 'Your free trial has ended' else 'Your Core Fitness payment is overdue' end;
      v_msg := 'The system goes read-only on ' || to_char(v_locks, 'FMDD Mon YYYY')
               || '. Nothing is deleted; it comes straight back when it is paid.';
    elsif v_today >= v_locks then
      v_step := 'locked';
      v_title := 'Your gym is read-only';
      v_msg := case when v_trial
                 then 'The free trial ended ' || to_char(g.paid_until, 'FMDD Mon YYYY')
                 else 'Core Fitness was due ' || to_char(g.paid_until, 'FMDD Mon YYYY') end
               || '. Everything is still here and comes straight back when it is paid.';
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

-- The owner's page learns whether it is a trial. A new column, so drop and recreate.
drop function if exists my_gym_subscription();
create function my_gym_subscription()
returns table (plan_name text, price_monthly numeric, paid_until date, days_left int,
               grace_days int, read_only_on date, lock_reason text,
               max_members int, members int, max_staff int, staff int, on_trial boolean)
language sql stable security definer set search_path = public as $$
  select pp.name, pp.price_monthly, g.paid_until,
         case when g.paid_until is null then null else (g.paid_until - (now() at time zone 'Asia/Manila')::date)::int end,
         platform_grace_days(),
         case when g.paid_until is null then null else g.paid_until + platform_grace_days() + 1 end,
         gym_lock_reason(g.id),
         h.max_members, h.members, h.max_staff, h.staff,
         gym_on_trial(g.id)
    from gyms g
    left join platform_plans pp on pp.key = g.plan
    cross join lateral gym_headroom(g.id) h
   where g.id = current_gym_id()
     and get_my_role() is not distinct from 'admin';
$$;
revoke all on function my_gym_subscription() from public, anon;
grant execute on function my_gym_subscription() to authenticated;

create or replace function migration_0139_applied() returns boolean
language sql immutable as $$ select true $$;
revoke all on function migration_0139_applied() from public, anon;
grant execute on function migration_0139_applied() to authenticated;
comment on function migration_0139_applied() is 'Probe marker: 0139 (a free trial ends) is live.';
