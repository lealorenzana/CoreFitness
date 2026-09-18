-- 0089 — a training day can say what you are training.
--
-- 0030's plan knows *when* ("Mon, Wed, Fri at 6 PM"); 0086's routines know
-- *what* ("Leg day: squat 4×8 …"). They never met, so a member with a Monday leg
-- day still opened the app on Monday, went to Train, found My routines and
-- picked it. Now a planned day may carry one routine: Today offers "Start Leg
-- day", and the reminder names it.
--
-- Optional per day and nullable — "any workout" is a perfectly good plan, and a
-- member whose plan lacks the tracker keeps their days and their reminder.

alter table gym_plans
  add column if not exists routine_id uuid references workout_routines(id) on delete set null;

-- A foreign key proves the routine exists, not whose it is. RLS on
-- workout_routines hides other members' routines from a read, but an INSERT
-- naming a guessed id would still pass the key check — so the owner is checked
-- here. Security definer so the check can see the routine whatever RLS says.
create or replace function trg_gym_plan_routine_is_mine() returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  if new.routine_id is not null and not exists (
    select 1 from workout_routines r
     where r.id = new.routine_id and r.member_id = new.member_id
  ) then
    raise exception 'That routine is not one of yours.';
  end if;
  return new;
end;
$fn$;

drop trigger if exists gym_plan_routine_is_mine on gym_plans;
create trigger gym_plan_routine_is_mine before insert or update of routine_id, member_id on gym_plans
  for each row execute function trg_gym_plan_routine_is_mine();

-- The nudge, as 0030 wrote it, now naming the routine when there is one.
-- Everything else — the window, once a day, no nudge after a check-in — is
-- unchanged.
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
    select g.id, g.member_id, g.remind_at, r.name as routine_name
    from gym_plans g
    join profiles pr on pr.id = g.member_id
    left join workout_routines r on r.id = g.routine_id
    where g.active
      and g.day_of_week = today_dow
      and pr.status = 'active'
      and (g.last_reminded_on is null or g.last_reminded_on < today)
      and now_manila >= (today + g.remind_at)
      and now_manila <  (today + g.remind_at + interval '3 hours')
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
      coalesce(p.routine_name, 'Training day'),
      case when p.routine_name is not null
        then 'You planned ' || p.routine_name || ' today at '
        else 'You planned to train today at '
      end
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

revoke all on function send_due_gym_reminders() from public, anon, authenticated;

-- Marker for scripts/probe-migrations.py.
create or replace function migration_0089_applied() returns boolean
language sql immutable as $fn$ select true $fn$;
revoke all on function migration_0089_applied() from public, anon;
grant execute on function migration_0089_applied() to authenticated;

-- VERIFICATION — as a member:
--   update gym_plans set routine_id = '<one of your routines>' where day_of_week = 1;  -- ok
--   update gym_plans set routine_id = '<someone else''s routine>' where day_of_week = 1; -- raises
