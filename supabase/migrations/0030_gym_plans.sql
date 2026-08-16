-- 0030 — a member's weekly training plan, and the nudge that makes it useful.
--
-- The point of the feature is the reminder, so the reminder has to actually
-- fire. A screen that saves "Mon/Wed/Fri at 6pm" and then never mentions it
-- again is the switch-that-does-nothing failure this project already shipped
-- six times in Settings.
--
-- Two delivery paths, deliberately unequal, and the app is honest about which
-- is which:
--
--   1. **The Home card is the guarantee.** On a planned day the member's home
--      screen says so, tells them the time, and says whether they have already
--      checked in. That needs no scheduler and cannot silently stop working.
--
--   2. **The notification is the nudge.** `send_due_gym_reminders()` writes a
--      real `notifications` row for anyone whose planned time has passed and
--      who has not been checked in today. pg_cron calls it; if pg_cron is not
--      available on the project, the function is still there and (1) still
--      works — see the guarded block at the bottom.
--
-- One row per member per weekday rather than an array of days: "who is training
-- today" is then a plain indexed equality, and a member cannot end up with the
-- same day listed twice.

create table if not exists gym_plans (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references member_profiles(profile_id) on delete cascade,
  -- 0 = Sunday, matching `extract(dow …)` and the convention already used by
  -- class_templates and trainer_availability (0015).
  day_of_week int not null check (day_of_week between 0 and 6),
  -- Local wall-clock time. The gym is in one timezone and always will be.
  remind_at time not null default '17:00',
  active boolean not null default true,
  -- Makes the nudge idempotent: cron can run every 15 minutes without sending
  -- the same reminder twice.
  last_reminded_on date,
  created_at timestamptz not null default now(),
  unique (member_id, day_of_week)
);

create index if not exists idx_gym_plans_day
  on gym_plans (day_of_week) where active;

alter table gym_plans enable row level security;

drop policy if exists gym_plans_select_self on gym_plans;
create policy gym_plans_select_self on gym_plans
  for select using (member_id = auth.uid());

-- A trainer who cannot see when their client intends to train cannot coach
-- around it. Read only — a plan somebody else set is not the member's plan.
drop policy if exists gym_plans_select_staff on gym_plans;
create policy gym_plans_select_staff on gym_plans
  for select using (get_my_role() in ('admin', 'staff', 'trainer'));

drop policy if exists gym_plans_write_self on gym_plans;
create policy gym_plans_write_self on gym_plans
  for all using (member_id = auth.uid()) with check (member_id = auth.uid());

-- ============================================================================
-- THE NUDGE
-- ============================================================================
--
-- Returns how many it sent, so a manual run in the SQL editor tells you
-- something rather than nothing.

create or replace function send_due_gym_reminders()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  now_manila timestamp := (now() at time zone 'Asia/Manila');
  today date := now_manila::date;
  today_dow int := extract(dow from now_manila)::int;
  sent int := 0;
  p record;
begin
  for p in
    select g.id, g.member_id, g.remind_at
    from gym_plans g
    join profiles pr on pr.id = g.member_id
    where g.active
      and g.day_of_week = today_dow
      and pr.status = 'active'
      -- Once per day, whatever the cron cadence.
      and (g.last_reminded_on is null or g.last_reminded_on < today)
      -- Only after the planned time, and only for the next three hours. A
      -- reminder for a 6pm session arriving at 11pm is noise, not a nudge.
      -- (A plan set late in the evening simply gets a shorter window; the day
      -- rolls over at midnight and the row is skipped rather than sent late.)
      and now_manila >= (today + g.remind_at)
      and now_manila <  (today + g.remind_at + interval '3 hours')
      -- Nobody wants to be told to go to the gym they are already standing in.
      and not exists (
        select 1 from attendance a
        where a.member_id = g.member_id
          and (a.check_in_time at time zone 'Asia/Manila')::date = today
      )
  loop
    insert into notifications (user_id, type, title, message, action_url)
    values (
      p.member_id,
      'gym_plan',
      'Training day',
      'You planned to train today at '
        || to_char(p.remind_at, 'FMHH12:MI AM')
        || '. You have not checked in yet.',
      '/member/gym-plan'
    );

    update gym_plans set last_reminded_on = today where id = p.id;
    sent := sent + 1;
  end loop;

  return sent;
end;
$$;

-- Not exposed to clients. Nothing in either app should be able to trigger a
-- broadcast of reminders; this is cron's to call.
revoke all on function send_due_gym_reminders() from public, anon, authenticated;

-- ============================================================================
-- SCHEDULING (optional — the feature degrades honestly without it)
-- ============================================================================
--
-- pg_cron has to be enabled on the project (Dashboard → Database → Extensions,
-- or the create extension below if your role may run it). Wrapped so that a
-- project without it still gets the table, the policies and the function —
-- the Home card keeps working and only the push-style nudge is missing.
--
-- Verify afterwards with:  select jobname, schedule, active from cron.job;
-- If nothing comes back, the reminder is NOT scheduled.

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      create extension if not exists pg_cron;
    exception when others then
      raise notice 'pg_cron unavailable (%) — gym plans still work, the reminder is not scheduled', sqlerrm;
      return;
    end;
  end if;

  -- Every 15 minutes. The function's own window and `last_reminded_on` make the
  -- cadence harmless; a coarser schedule would just mean a later nudge.
  perform cron.unschedule('gym-plan-reminders')
    where exists (select 1 from cron.job where jobname = 'gym-plan-reminders');

  perform cron.schedule(
    'gym-plan-reminders',
    '*/15 * * * *',
    $cron$ select send_due_gym_reminders(); $cron$
  );
exception when others then
  raise notice 'Could not schedule gym-plan-reminders (%) — run send_due_gym_reminders() another way', sqlerrm;
end $$;
