-- 0032 — the member decides what their trainer sees.
--
-- Since 0020, `body_measurements`, `fitness_goals` and `workout_logs` have
-- carried a blanket `*_select_staff` policy: **any** trainer could read **every**
-- member's weight, body-fat percentage and goals, whether or not they coach
-- them and whether or not the member ever agreed. Nothing in the trainer app
-- displayed it, so nobody noticed — but the permission was live the whole time.
--
-- This adds a per-member switch and makes it the actual boundary, not a label.
-- The rule this project keeps having to relearn: a control the database does
-- not enforce is decoration. Gating it in the UI alone would leave the data one
-- REST call away.
--
-- Two deliberate asymmetries:
--
--   * **Admin and staff are not gated.** They run the gym, handle payments and
--     answer for incidents. The switch is honestly labelled "what your trainer
--     sees" in the app rather than implying it hides anything from the desk.
--
--   * **Default is shared.** No row means shared, which is exactly today's
--     behaviour — so applying this migration changes nothing until a member
--     chooses otherwise. Defaulting to hidden would silently blank out the
--     screens of every trainer already coaching someone.

create table if not exists member_share_prefs (
  member_id uuid primary key references member_profiles(profile_id) on delete cascade,
  share_measurements boolean not null default true,
  share_goals        boolean not null default true,
  share_workouts     boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table member_share_prefs enable row level security;

drop policy if exists member_share_prefs_all_self on member_share_prefs;
create policy member_share_prefs_all_self on member_share_prefs
  for all using (member_id = auth.uid()) with check (member_id = auth.uid());

-- Trainers and the desk may *read* the switches. This is what lets the trainer
-- app say "not shared" instead of drawing an empty panel — telling a coach
-- "this member has no goals" when they have several and chose to keep them
-- private is a lie the app would be telling on the member's behalf.
drop policy if exists member_share_prefs_select_staff on member_share_prefs;
create policy member_share_prefs_select_staff on member_share_prefs
  for select using (get_my_role() in ('admin', 'staff', 'trainer'));

-- ============================================================================
-- THE GATE
-- ============================================================================

create or replace function trainer_may_see(member uuid, category text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    -- The gym itself is not gated; see the header.
    when get_my_role() in ('admin', 'staff') then true
    when get_my_role() <> 'trainer' then false
    else coalesce(
      (
        select case category
          when 'measurements' then p.share_measurements
          when 'goals'        then p.share_goals
          when 'workouts'     then p.share_workouts
          else false
        end
        from member_share_prefs p
        where p.member_id = member
      ),
      -- No preferences row: shared, matching the behaviour this migration
      -- replaces. An unknown category is the only false default.
      category in ('measurements', 'goals', 'workouts')
    )
  end;
$$;

revoke all on function trainer_may_see(uuid, text) from public, anon;
grant execute on function trainer_may_see(uuid, text) to authenticated;

-- ============================================================================
-- REPLACE THE BLANKET POLICIES
-- ============================================================================
--
-- `*_select_self` from 0020 is untouched — a member always sees their own rows
-- regardless of what they share.

drop policy if exists body_measurements_select_staff on body_measurements;
create policy body_measurements_select_staff on body_measurements
  for select using (trainer_may_see(member_id, 'measurements'));

drop policy if exists fitness_goals_select_staff on fitness_goals;
create policy fitness_goals_select_staff on fitness_goals
  for select using (trainer_may_see(member_id, 'goals'));

drop policy if exists workout_logs_select_staff on workout_logs;
create policy workout_logs_select_staff on workout_logs
  for select using (trainer_may_see(member_id, 'workouts'));

-- Keeps `updated_at` honest without the client having to remember.
create or replace function touch_member_share_prefs()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_touch_member_share_prefs on member_share_prefs;
create trigger trg_touch_member_share_prefs
  before update on member_share_prefs
  for each row execute function touch_member_share_prefs();
