-- 0150: A GYM'S OWN EXERCISE HIDES THE SHARED ONE OF THE SAME NAME — ALWAYS, NOT ONCE
--
-- 0126's rule: when a gym has its own exercise named like a shared one, the
-- shared one is hidden for that gym (the 0121 overlay), so members never see
-- the name twice and never split their history between two rows. 0126 applied
-- it ONCE, as a backfill. A gym that adds "Bench Press" today — or renames one
-- of its own to match — got both rows in the member library, the trainer's
-- list, admin Exercises and the coach's exercise list (0145).
--
-- Now a trigger keeps the rule:
--   * a gym's own exercise inserted, or renamed, to a shared name (same rule
--     as 0126: lower(name) = lower(name), shared means gym_id IS NULL) hides
--     that shared row for that gym;
--   * the overlay remembers WHICH own exercise caused the hiding
--     (`hidden_by_own`). When that exercise is deleted or renamed away, the
--     shared row comes back (a gym has at most one exercise per name — 0098's
--     exercises_name_unique — so there is no sibling to hand over to). An
--     owner's own "hide this" (hidden_by_own NULL) is never undone by this.
--   * 0126 required the shared row to have created_by NULL (only the seeded
--     library) because 0127 had not yet sent misfiled gym rows home. After
--     0127 every gym_id-NULL row is the platform's, so the platform's later
--     additions are covered too.
--
-- Changing an overlay row by hand (un-hiding) clears hidden_by_own, so a later
-- delete of the gym's own row does not flip the owner's choice back.

alter table gym_exercise_media add column if not exists hidden_by_own uuid;
comment on column gym_exercise_media.hidden_by_own is
  'The gym''s own exercise whose name hid this shared one (0150). NULL = hidden '
  '(or not) by the gym itself. Plain uuid, no FK: the exercise trigger releases it.';

/** Hide the shared exercise(s) named like this gym's own one. */
create or replace function hide_shared_duplicate(p_own uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_gym  uuid;
  v_name text;
  v_by   uuid;
begin
  select gym_id, name, created_by into v_gym, v_name, v_by from exercises where id = p_own;
  if v_gym is null or v_name is null then return; end if;

  -- The overlay needs an author: whoever made the change, else the exercise's
  -- author, else the gym's owner (as 0126 did).
  v_by := coalesce(auth.uid(), v_by,
    (select r.user_id from gym_roles r
      where r.gym_id = v_gym and r.role = 'admin' and r.status = 'active'
      order by r.user_id limit 1));
  if v_by is null then return; end if;

  insert into gym_exercise_media (gym_id, exercise_id, hidden, hidden_by_own, created_by)
  select v_gym, lib.id, true, p_own, v_by
    from exercises lib
   where lib.gym_id is null and lower(lib.name) = lower(v_name)
  on conflict (gym_id, exercise_id) do update
     set hidden = true,
         -- An owner who already hid it keeps it as their own choice.
         hidden_by_own = case when gym_exercise_media.hidden and gym_exercise_media.hidden_by_own is null
                              then null else p_own end,
         updated_at = now();
end;
$$;
revoke all on function hide_shared_duplicate(uuid) from public, anon, authenticated;

/** This own exercise no longer hides anything: show the shared row(s) again. */
create or replace function release_shared_duplicate(p_own uuid, p_gym uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update gym_exercise_media set hidden = false, hidden_by_own = null, updated_at = now()
   where gym_id = p_gym and hidden_by_own = p_own;
end;
$$;
revoke all on function release_shared_duplicate(uuid, uuid) from public, anon, authenticated;

create or replace function own_exercise_hides_shared() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.gym_id is not null then
    if tg_op = 'DELETE' or new.name is distinct from old.name or new.gym_id is distinct from old.gym_id then
      perform release_shared_duplicate(old.id, old.gym_id);
    end if;
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.gym_id is not null then
    perform hide_shared_duplicate(new.id);
  end if;
  return null;
end;
$$;

drop trigger if exists own_exercise_hides_shared on exercises;
create trigger own_exercise_hides_shared
  after insert or update of name, gym_id or delete on exercises
  for each row execute function own_exercise_hides_shared();

/** A hand change to "hidden" is the gym's own choice from then on. */
create or replace function overlay_hidden_by_hand() returns trigger
language plpgsql as $$
begin
  if new.hidden is distinct from old.hidden
     and new.hidden_by_own is not distinct from old.hidden_by_own then
    new.hidden_by_own := null;
  end if;
  return new;
end;
$$;

drop trigger if exists overlay_hidden_by_hand on gym_exercise_media;
create trigger overlay_hidden_by_hand
  before update on gym_exercise_media
  for each row execute function overlay_hidden_by_hand();

-- ---- Backfill: every duplicate that exists now -------------------------------
-- Hides the duplicates made since 0126. A row that is ALREADY hidden with no
-- reason (0126's backfill, or an owner's own "hide") cannot be told apart, so
-- it stays exactly as it is: hidden, and never un-hidden by this trigger.
do $$
declare r record;
begin
  for r in select own.id
             from exercises own
            where own.gym_id is not null
              and exists (select 1 from exercises lib where lib.gym_id is null and lower(lib.name) = lower(own.name)) loop
    perform hide_shared_duplicate(r.id);
  end loop;
end $$;

create or replace function migration_0150_applied() returns boolean
language sql immutable as $marker$ select true $marker$;
revoke all on function migration_0150_applied() from public, anon;
grant execute on function migration_0150_applied() to authenticated;
comment on function migration_0150_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0150.sql
