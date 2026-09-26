-- 0121 — A gym's own photo, video and coaching cues on any exercise, seen only
-- by its own members. The first half of the Content Studio
-- (docs/superpowers/specs/2026-09-26-content-studio-design.md).
--
-- ---- WHY AN OVERLAY, NOT COLUMNS ON `exercises` ----------------------------------------
--
-- The 36 standard exercises are one shared library: `exercises.gym_id is null`,
-- read by every gym (0098). Put a video column on that row and gym A's coach
-- demonstrating the squat plays in gym B's app. So a gym's media lives in
-- `gym_exercise_media (gym_id, exercise_id)`, one row per gym per exercise, and
-- the tenancy layer keeps each gym to its own rows. The library rows keep the
-- *starter* cues and steps below, so a gym that has written nothing still has a
-- useful guide on day one; a gym's own cues/steps replace them for that gym only.
--
-- ---- ONLY THE PLATFORM CURATES THE SHARED LIBRARY ---------------------------------------
--
-- 0099 let Gym #1's staff edit shared rows (`may_curate_library()` was "platform
-- or Gym #1") and filed Gym #1's new exercises as shared (`trg_library_row_gym`).
-- That made sense while Gym #1 built the list alone. In a SaaS it means one
-- customer edits every customer's list: Gym #1 deactivating "Deadlift" hid it
-- in every gym. From here the platform curates; a gym hides a shared exercise
-- for itself with its overlay's `hidden`, and its own new exercises are its own.
--
-- ---- PHOTOS ARE COUNTED BY THE DATABASE -----------------------------------------------
--
-- Video is a link (YouTube/Vimeo — free, and no storage). Photos are uploads,
-- and the free platform plan allows a number of them (`platform_plans.max_photos`,
-- 100 by default). A counter the screen enforces is a counter a script skips,
-- so a photo can only be uploaded into a slot `reserve_gym_photo()` handed out,
-- and handing one out is where the limit is checked, under a row lock.

-- ---- 1. starter text lives on the shared library ------------------------------------------

alter table exercises add column if not exists cues  text[] not null default '{}';
alter table exercises add column if not exists steps text[] not null default '{}';
alter table exercises add column if not exists created_by uuid references profiles(id);
alter table exercises alter column created_by set default auth.uid();

-- At most p_max lines, each 1..p_len characters once trimmed.
create or replace function guide_lines_ok(p text[], p_max int, p_len int) returns boolean
language sql immutable as $$
  select coalesce(array_length(p, 1), 0) <= p_max
     and not exists (select 1 from unnest(p) x where char_length(btrim(x)) not between 1 and p_len)
$$;

alter table exercises drop constraint if exists exercises_guide_ok;
alter table exercises add constraint exercises_guide_ok
  check (guide_lines_ok(cues, 6, 120) and guide_lines_ok(steps, 10, 240));

-- Written once, for the movements 0050 seeded. Only where empty, so a re-run
-- never overwrites what the platform later edits. Plain coaching language, no
-- medical claims: a cue is what a coach says across the floor.
update exercises e set cues = s.cues, steps = s.steps
from (values
  ('Barbell Bench Press',
   array['Feet flat, shoulder blades pinched', 'Bar touches mid-chest', 'Wrists straight over elbows'],
   array['Lie with eyes under the bar and grip just wider than shoulders.', 'Unrack and hold the bar over your shoulders.', 'Lower it under control to mid-chest.', 'Press up and slightly back to the start.']),
  ('Incline Dumbbell Press',
   array['Bench at about 30 degrees', 'Elbows slightly tucked', 'Press up, not out'],
   array['Sit back on the incline with a dumbbell on each thigh.', 'Kick them up to shoulder height as you lie back.', 'Press both up until your arms are straight.', 'Lower slowly to the sides of your upper chest.']),
  ('Push-up',
   array['Body in one straight line', 'Hands under shoulders', 'Chest to fist height'],
   array['Start in a high plank with hands shoulder-width apart.', 'Brace your stomach and squeeze your glutes.', 'Bend your elbows to lower your chest toward the floor.', 'Push the floor away to return to the plank.']),
  ('Chest Fly',
   array['Soft bend in the elbows', 'Feel the stretch, do not force it', 'Squeeze to finish'],
   array['Set the seat so the handles are at chest height.', 'Hold the handles with a slight bend in your elbows.', 'Bring your hands together in a wide arc.', 'Return slowly until you feel a stretch across the chest.']),
  ('Deadlift',
   array['Bar over mid-foot', 'Flat back, chest proud', 'Push the floor away'],
   array['Stand with the bar over the middle of your feet.', 'Hinge down and grip the bar just outside your legs.', 'Brace, pull the slack out of the bar, and keep it close.', 'Stand up by driving through your legs, then lower it the same way.']),
  ('Barbell Row',
   array['Hinge to about 45 degrees', 'Pull to the lower ribs', 'No jerking with the back'],
   array['Hold the bar with an overhand grip, just wider than shoulders.', 'Hinge at the hips with a flat back and soft knees.', 'Row the bar to your lower ribs, elbows back.', 'Lower it under control without standing up.']),
  ('Lat Pulldown',
   array['Chest up, lean back slightly', 'Pull elbows down to your sides', 'Control the way up'],
   array['Sit with your thighs under the pad and grip the bar wide.', 'Pull your shoulders down before you bend your arms.', 'Pull the bar to your upper chest.', 'Let it rise slowly until your arms are straight.']),
  ('Seated Cable Row',
   array['Sit tall, do not rock', 'Squeeze shoulder blades together', 'Handle to the belly button'],
   array['Sit with feet on the platform and knees slightly bent.', 'Hold the handle with straight arms and a tall back.', 'Pull it to your stomach, squeezing your shoulder blades.', 'Return slowly until your arms are straight again.']),
  ('Pull-up',
   array['Start from a dead hang', 'Chest to the bar', 'No swinging'],
   array['Hang from the bar with hands just wider than shoulders.', 'Pull your shoulders down and back.', 'Pull until your chin clears the bar.', 'Lower all the way down under control.']),
  ('Back Squat',
   array['Chest up, brace your core', 'Knees track over toes', 'Hips below knees if you can'],
   array['Rest the bar on your upper back and step out of the rack.', 'Stand with feet about shoulder-width, toes slightly out.', 'Sit down and back, keeping your chest up.', 'Drive up through your whole foot to stand.']),
  ('Front Squat',
   array['Elbows high', 'Stay upright', 'Sit straight down'],
   array['Rest the bar on the front of your shoulders, elbows high.', 'Step back and set your feet shoulder-width apart.', 'Squat down keeping your torso tall.', 'Stand up, leading with your elbows.']),
  ('Leg Press',
   array['Back flat on the pad', 'Knees in line with feet', 'Do not lock the knees'],
   array['Sit with your back flat and feet shoulder-width on the plate.', 'Release the safety handles.', 'Lower the plate until your knees are about 90 degrees.', 'Press back up without locking your knees.']),
  ('Romanian Deadlift',
   array['Soft knees, hips back', 'Bar slides down the thighs', 'Feel it in the hamstrings'],
   array['Stand holding the bar at your hips.', 'Push your hips back with a slight knee bend.', 'Lower the bar along your legs until you feel a hamstring stretch.', 'Squeeze your glutes to stand back up.']),
  ('Walking Lunge',
   array['Long step, upright torso', 'Back knee toward the floor', 'Front knee over the ankle'],
   array['Stand tall holding a dumbbell in each hand.', 'Step forward and lower until both knees are bent.', 'Push through the front heel to bring the back foot through.', 'Repeat on the other leg.']),
  ('Leg Curl',
   array['Hips pressed into the pad', 'Curl all the way', 'Slow on the way back'],
   array['Set the pad just above your heels.', 'Hold the handles and keep your hips down.', 'Curl your heels toward your glutes.', 'Lower slowly to the start.']),
  ('Leg Extension',
   array['Back against the seat', 'Straighten fully', 'Pause at the top'],
   array['Set the pad on the front of your lower shins.', 'Line your knees up with the machine pivot.', 'Straighten your legs and pause.', 'Lower under control.']),
  ('Calf Raise',
   array['Full stretch at the bottom', 'Rise onto the big toe', 'Pause at the top'],
   array['Stand with the balls of your feet on the edge.', 'Let your heels drop to feel a stretch.', 'Rise as high as you can.', 'Lower slowly and repeat.']),
  ('Overhead Press',
   array['Squeeze glutes, ribs down', 'Head through at the top', 'Bar in a straight line'],
   array['Hold the bar at your collarbones, hands just outside shoulders.', 'Brace your core and squeeze your glutes.', 'Press the bar straight up, moving your head back then through.', 'Lower it to your collarbones.']),
  ('Dumbbell Shoulder Press',
   array['Back supported', 'Do not flare elbows fully', 'Stop just short of lockout'],
   array['Sit upright with dumbbells at shoulder height.', 'Press them up until your arms are almost straight.', 'Lower slowly back to shoulder height.']),
  ('Lateral Raise',
   array['Lead with the elbows', 'Stop at shoulder height', 'Light weight, no swinging'],
   array['Stand holding dumbbells at your sides.', 'Raise your arms out to the sides with a slight elbow bend.', 'Stop when your hands reach shoulder height.', 'Lower slowly.']),
  ('Face Pull',
   array['Rope to the forehead', 'Elbows high', 'Pull the rope apart'],
   array['Set the cable at head height with a rope.', 'Step back holding the rope with thumbs toward you.', 'Pull toward your face, spreading your hands apart.', 'Return slowly.']),
  ('Barbell Curl',
   array['Elbows pinned to your sides', 'No body swing', 'Squeeze at the top'],
   array['Hold the bar with an underhand grip, shoulder-width.', 'Curl it up keeping your elbows still.', 'Squeeze, then lower slowly.']),
  ('Dumbbell Curl',
   array['Palms up', 'Elbows still', 'Lower slowly'],
   array['Stand with a dumbbell in each hand, palms forward.', 'Curl one or both up toward your shoulders.', 'Lower under control.']),
  ('Triceps Pushdown',
   array['Elbows glued to your sides', 'Straighten fully', 'Control the way up'],
   array['Hold the bar or rope at chest height.', 'Push down until your arms are straight.', 'Let it rise slowly to about 90 degrees at the elbow.']),
  ('Skull Crusher',
   array['Upper arms stay still', 'Lower to the forehead', 'Use a spotter if heavy'],
   array['Lie on a bench holding the bar above your chest.', 'Bend only at the elbows to lower it toward your forehead.', 'Straighten your arms to return.']),
  ('Dip',
   array['Shoulders down, chest up', 'Lower to about 90 degrees', 'Do not bounce'],
   array['Support yourself on the bars with straight arms.', 'Lean slightly forward and bend your elbows to lower.', 'Push back up until your arms are straight.']),
  ('Plank',
   array['Straight line head to heels', 'Squeeze glutes and stomach', 'Keep breathing'],
   array['Rest on your forearms, elbows under shoulders.', 'Lift your hips so your body is straight.', 'Hold for the time set, breathing steadily.']),
  ('Hanging Leg Raise',
   array['No swinging', 'Curl the hips up', 'Lower slowly'],
   array['Hang from the bar with straight arms.', 'Brace, then raise your legs by curling your hips.', 'Lower them slowly without swinging.']),
  ('Cable Crunch',
   array['Hips stay still', 'Curl the spine down', 'Pull with the stomach, not the arms'],
   array['Kneel facing the cable holding the rope by your head.', 'Crunch down, bringing your elbows toward your knees.', 'Return slowly to the start.']),
  ('Russian Twist',
   array['Chest up, back straight', 'Turn from the ribs', 'Feet down if needed'],
   array['Sit leaning back slightly with knees bent.', 'Turn your torso to one side, then the other.', 'Keep the movement controlled.']),
  ('Treadmill Run',
   array['Start slow for a warm-up', 'Relaxed shoulders', 'Clip the safety key'],
   array['Clip the safety key to your clothing.', 'Start walking, then raise the speed gradually.', 'Run at a pace you can hold, then slow down to cool off.']),
  ('Stationary Bike',
   array['Seat at hip height', 'Slight bend at the bottom', 'Steady cadence'],
   array['Set the seat so your leg is almost straight at the bottom.', 'Start with light resistance to warm up.', 'Ride at the effort set, then ease off to finish.']),
  ('Rowing Machine',
   array['Legs, then body, then arms', 'Arms, body, legs on the way back', 'Do not hunch'],
   array['Strap your feet in and hold the handle.', 'Push with your legs, lean back slightly, then pull to your ribs.', 'Reverse the order to return, and repeat smoothly.']),
  ('Jump Rope',
   array['Small jumps on the balls of the feet', 'Turn from the wrists', 'Elbows close'],
   array['Hold the handles at hip height.', 'Swing the rope and jump just high enough to clear it.', 'Keep a steady rhythm for the time set.']),
  ('Burpee',
   array['Chest to the floor', 'Jump up tall', 'Move at your own pace'],
   array['Squat down and place your hands on the floor.', 'Jump or step your feet back into a plank.', 'Lower your chest, push up, and bring your feet back in.', 'Stand and jump with your hands overhead.']),
  ('Kettlebell Swing',
   array['Hinge, do not squat', 'Snap the hips', 'Bell floats to chest height'],
   array['Stand with the bell in front of you and hinge to grip it.', 'Hike it back between your legs.', 'Drive your hips forward to swing it to chest height.', 'Let it fall back and repeat.'])
) as s(name, cues, steps)
where e.gym_id is null and lower(e.name) = lower(s.name) and e.cues = '{}';

-- ---- 2. only the platform curates the shared library --------------------------------------

create or replace function may_curate_library() returns boolean
language sql stable security definer set search_path = public as $$
  select is_platform_admin();
$$;

-- A gym's new exercise is the gym's. Only the platform adds to the shared list.
create or replace function trg_library_row_gym() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if is_platform_admin() and new.gym_id is not distinct from current_gym_id() then
    new.gym_id := null;
  end if;
  return new;
end;
$$;

-- Trainers write the gym exercises they created. The owner keeps 0050's
-- `exercises_write_admin`; the tenant_* policies keep both to their own gym.
drop policy if exists exercises_insert_trainer on exercises;
create policy exercises_insert_trainer on exercises for insert to authenticated
  with check (storage_role_here() = 'trainer' and created_by = auth.uid()
              and gym_id = current_gym_id());
drop policy if exists exercises_update_trainer on exercises;
create policy exercises_update_trainer on exercises for update to authenticated
  using (storage_role_here() = 'trainer' and created_by = auth.uid() and gym_id = current_gym_id())
  with check (created_by = auth.uid() and gym_id = current_gym_id());

-- ---- 3. video links ------------------------------------------------------------------------

-- YouTube and Vimeo only, https only. Facebook and TikTok links often refuse to
-- play inside an Android app, which would look like our bug (spec decision).
create or replace function is_allowed_video_url(p text) returns boolean
language sql immutable as $$
  select p is null
      or p ~* '^https://(www\.|m\.)?(youtube\.com|youtu\.be|vimeo\.com|player\.vimeo\.com)/[^[:space:]]+$'
$$;

-- ---- 4. the per-gym overlay -----------------------------------------------------------------

create table if not exists gym_exercise_media (
  gym_id      uuid not null default acting_gym_id() references gyms(id),
  exercise_id uuid not null references exercises(id) on delete cascade,
  photo_url   text,
  video_url   text check (is_allowed_video_url(video_url)),
  -- NULL means "use the library's"; an empty array means "none, on purpose".
  cues        text[] check (cues  is null or guide_lines_ok(cues, 6, 120)),
  steps       text[] check (steps is null or guide_lines_ok(steps, 10, 240)),
  -- The gym's own "not here": hides a shared exercise for this gym only.
  hidden      boolean not null default false,
  created_by  uuid not null default auth.uid() references profiles(id),
  updated_at  timestamptz not null default now(),
  primary key (gym_id, exercise_id)
);
create index if not exists gym_exercise_media_gym_idx on gym_exercise_media (gym_id);

alter table gym_exercise_media enable row level security;
grant select, insert, update, delete on gym_exercise_media to authenticated;

drop policy if exists gym_exercise_media_read   on gym_exercise_media;
drop policy if exists gym_exercise_media_insert on gym_exercise_media;
drop policy if exists gym_exercise_media_update on gym_exercise_media;
drop policy if exists gym_exercise_media_delete on gym_exercise_media;
-- Everyone in the gym reads it (tenant_select keeps it to the gym).
create policy gym_exercise_media_read on gym_exercise_media for select to authenticated using (true);
-- The owner and trainers write. A trainer edits only what they wrote; the owner anything.
create policy gym_exercise_media_insert on gym_exercise_media for insert to authenticated
  with check (storage_role_here() in ('admin', 'trainer') and created_by = auth.uid());
create policy gym_exercise_media_update on gym_exercise_media for update to authenticated
  using (storage_role_here() = 'admin' or (storage_role_here() = 'trainer' and created_by = auth.uid()))
  with check (storage_role_here() in ('admin', 'trainer'));
create policy gym_exercise_media_delete on gym_exercise_media for delete to authenticated
  using (storage_role_here() = 'admin' or (storage_role_here() = 'trainer' and created_by = auth.uid()));

-- The author never changes: the owner fixing a trainer's typo does not take the
-- row away from the trainer, who could then no longer edit their own guide.
create or replace function trg_media_keep_author() returns trigger
language plpgsql as $$
begin
  new.created_by := old.created_by;
  new.gym_id := old.gym_id;
  new.exercise_id := old.exercise_id;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists gym_exercise_media_author on gym_exercise_media;
create trigger gym_exercise_media_author before update on gym_exercise_media
  for each row execute function trg_media_keep_author();

-- ---- 5. photo slots ----------------------------------------------------------------------

alter table platform_plans add column if not exists max_photos int default 100;
alter table platform_plans drop constraint if exists platform_plans_max_photos_check;
alter table platform_plans add constraint platform_plans_max_photos_check
  check (max_photos is null or max_photos > 0);

create table if not exists gym_photos (
  id         uuid primary key default gen_random_uuid(),
  gym_id     uuid not null default acting_gym_id() references gyms(id),
  path       text not null unique,
  created_by uuid not null default auth.uid() references profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists gym_photos_gym_idx on gym_photos (gym_id);
alter table gym_photos enable row level security;
grant select on gym_photos to authenticated;
drop policy if exists gym_photos_read on gym_photos;
-- Read only. No write policy for anyone: the two functions below are the writers.
create policy gym_photos_read on gym_photos for select to authenticated using (true);

create or replace function gym_photo_usage() returns table (used int, cap int)
language sql stable security definer set search_path = public as $$
  select (select count(*)::int from gym_photos where gym_id = current_gym_id()),
         (select pp.max_photos from gyms g join platform_plans pp on pp.key = g.plan
           where g.id = current_gym_id());
$$;

create or replace function reserve_gym_photo() returns text
language plpgsql security definer set search_path = public as $$
declare
  v_gym  uuid := current_gym_id();
  v_cap  int;
  v_used int;
  v_path text;
begin
  if coalesce(storage_role_here(), '') not in ('admin', 'trainer') or not gym_writable() then
    raise exception 'Only the gym owner and its trainers add photos.' using errcode = '42501';
  end if;
  -- Two uploads at 99 of 100 must not both get the 100th.
  perform 1 from gyms where id = v_gym for update;
  select pp.max_photos into v_cap from gyms g join platform_plans pp on pp.key = g.plan where g.id = v_gym;
  select count(*) into v_used from gym_photos where gym_id = v_gym;
  if v_cap is not null and v_used >= v_cap then
    raise exception 'Your plan allows % photos and all % are used. Delete one, or ask about a bigger plan.',
      v_cap, v_used using errcode = '23514';
  end if;
  v_path := 'gyms/' || v_gym || '/content/' || gen_random_uuid() || '.jpg';
  insert into gym_photos (gym_id, path) values (v_gym, v_path);
  return v_path;
end;
$$;

create or replace function release_gym_photo(p_path text) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from gym_photos
   where path = p_path and gym_id = current_gym_id() and gym_writable()
     and (storage_role_here() = 'admin'
          or (storage_role_here() = 'trainer' and created_by = auth.uid()));
  if not found then
    raise exception 'That photo is not yours to remove.' using errcode = '42501';
  end if;
end;
$$;

create or replace function set_platform_plan_photo_limit(p_plan text, p_max int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then
    raise exception 'Only the platform sets plan limits.' using errcode = '42501';
  end if;
  update platform_plans set max_photos = p_max where key = p_plan;
  if not found then
    raise exception 'There is no plan called %.', p_plan;
  end if;
end;
$$;

-- ---- 6. storage: a content photo needs a slot ------------------------------------------------

create or replace function content_slot_mine(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from gym_photos
                  where path = p_name and created_by = auth.uid() and gym_id = current_gym_id());
$$;

-- 0120's rule, plus one folder: `gyms/<gym>/content/` takes the owner or a
-- trainer, and only into a slot they reserved. Every other folder is unchanged.
create or replace function may_write_media(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    media_path_gym(p_name) = current_gym_id()::text
    and gym_writable()
    and case when split_part(p_name, '/', 3) = 'content'
             then storage_role_here() in ('admin', 'trainer') and content_slot_mine(p_name)
             else storage_role_here() in ('admin', 'staff') end,
    false);
$$;

create or replace function may_delete_media(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (media_path_gym(p_name) = current_gym_id()::text
      and gym_writable()
      and (storage_role_here() = 'admin'
           or (split_part(p_name, '/', 3) = 'content'
               and storage_role_here() = 'trainer' and content_slot_mine(p_name))))
    or is_platform_admin(),
    false);
$$;

-- ---- 7. tenancy ---------------------------------------------------------------------------

create or replace function tenancy_gym_tables() returns text[] language sql immutable as $$
  select array['account_status_events','achievement_unlocks','achievements','activity_log',
    'assistant_conversations','assistant_messages','attendance','body_measurements','bookings',
    'cancellation_reasons','cash_closeouts','challenge_participants','challenges','class_templates',
    'class_waitlist','classes','event_registrations','events','fitness_goals','freemium_trials',
    'goal_templates','gym_exercise_media','gym_invitations','gym_modules','gym_photos','gym_plans',
    'gym_settings','gym_waivers',
    'invoice_counters','member_profiles','member_share_prefs','membership_events',
    'membership_plans','membership_requests','memberships',
    'notifications','payments','pending_registrations','plan_features','point_ledger','point_rules',
    'pt_sessions','refund_rules','renewal_requests','reward_redemptions','rewards','saved_resources',
    'trainer_availability','trainer_credentials','trainer_feedback','trainer_profiles',
    'trainer_ratings','waiver_acceptances','workout_logs','workout_plans',
    'workout_routine_exercises','workout_routines','workout_sets']::text[]
$$;

do $$
declare t text;
begin
  foreach t in array array['gym_exercise_media', 'gym_photos'] loop
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

-- ---- grants ------------------------------------------------------------------------------

revoke all on function guide_lines_ok(text[], int, int), is_allowed_video_url(text),
  gym_photo_usage(), reserve_gym_photo(), release_gym_photo(text),
  set_platform_plan_photo_limit(text, int), content_slot_mine(text)
  from public, anon;
grant execute on function guide_lines_ok(text[], int, int), is_allowed_video_url(text),
  gym_photo_usage(), reserve_gym_photo(), release_gym_photo(text),
  set_platform_plan_photo_limit(text, int), content_slot_mine(text)
  to authenticated;

-- ---- the probe's marker ------------------------------------------------------------------

create or replace function migration_0121_applied() returns boolean
language sql immutable as $marker$ select true $marker$;
revoke all on function migration_0121_applied() from public, anon;
grant execute on function migration_0121_applied() to authenticated;
comment on function migration_0121_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0121.sql
