-- 0250: members can create fitness goals again.
--
-- 0171's trg_dates_target() served two tables in one function:
--   if tg_table_name = 'fitness_goals' and (... new.target_date ...) then ...
--   if tg_table_name = 'room_assignments' and (... new.due_on ...) then ...
-- PL/pgSQL prepares a whole IF expression against the row type before it can short-circuit,
-- so on fitness_goals the second IF fails with `record "new" has no field "due_on"`. Every
-- member goal insert (Progress → Goals, goal templates) has failed since 0171; production's
-- newest goal is from before it. Found by the staging test WK-GOAL (2026-11-13).
-- (room_assignments was spared only because its writer, 0129's definer function, skips the check.)
--
-- Fix: one trigger function per table, each touching only its own columns. Same rule, same window.

create or replace function trg_dates_target() returns trigger
language plpgsql as $$
declare d date := manila_today();
begin
  if not direct_user_write() then return new; end if;
  if tg_op = 'INSERT' or new.target_date is distinct from old.target_date then
    perform assert_date_window(new.target_date, d, (d + interval '2 years')::date, 'A target date');
  end if;
  return new;
end;
$$;

create or replace function trg_dates_due() returns trigger
language plpgsql as $$
declare d date := manila_today();
begin
  if not direct_user_write() then return new; end if;
  if tg_op = 'INSERT' or new.due_on is distinct from old.due_on then
    perform assert_date_window(new.due_on, d, (d + interval '2 years')::date, 'A due date');
  end if;
  return new;
end;
$$;

revoke execute on function trg_dates_target() from public, anon, authenticated;
revoke execute on function trg_dates_due() from public, anon, authenticated;

drop trigger if exists dates_window on fitness_goals;
create trigger dates_window before insert or update of target_date on fitness_goals
  for each row execute function trg_dates_target();
drop trigger if exists dates_window on room_assignments;
create trigger dates_window before insert or update of due_on on room_assignments
  for each row execute function trg_dates_due();

create or replace function migration_0250_applied() returns boolean language sql stable as $$ select true $$;
grant execute on function migration_0250_applied() to anon, authenticated;
