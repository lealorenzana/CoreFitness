-- 0132: PROGRESS PHOTOS — private by default
--
-- Decisions (conversation, 2026-09-27):
--   * Only the member sees their progress photos, unless they switch on "Share
--     progress photos with my coach" (member_share_prefs.share_photos, OFF by
--     default). Then the coaches they train with (is_my_trainee) see them.
--   * The OWNER AND DESK NEVER SEE THEM. That is unlike measurements, which the
--     gym always sees (trainer_may_see, 0032) — so this does not use
--     trainer_may_see, it has its own rule, `may_see_progress_photo()`.
--   * A coach can ask for one as Rooms classwork (check-in type 'photo');
--     handing it in shares THAT photo with THAT room's coach only.
--   * Files live in a private bucket, `progress`, at <gym>/<member>/<uuid>.jpg,
--     opened with short-lived signed links. An upload needs a slot the database
--     handed out (reserve_progress_photo), which is where the per-member limit
--     (200) is checked — a count the screen enforced, a script would skip.

-- ---- 1. the bucket -----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('progress', 'progress', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- ---- 2. the photos and the switch ----------------------------------------------------------------

alter table member_share_prefs add column if not exists share_photos boolean not null default false;

create table if not exists progress_photos (
  id         uuid primary key default gen_random_uuid(),
  gym_id     uuid not null default acting_gym_id() references gyms(id),
  member_id  uuid not null references profiles(id) on delete cascade,
  path       text not null unique,
  pose       text not null default 'front' check (pose in ('front', 'side', 'back', 'other')),
  taken_on   date not null default ((now() at time zone 'Asia/Manila')::date),
  note       text check (note is null or length(note) <= 200),
  created_at timestamptz not null default now(),
  unique (gym_id, id),
  check (path like gym_id::text || '/' || member_id::text || '/%')
);
create index if not exists progress_photos_member_idx on progress_photos (gym_id, member_id, taken_on desc);

-- A photo check-in (0129) points at the photo it handed in.
alter table room_submissions add column if not exists photo_id uuid;
alter table room_submissions drop constraint if exists room_submissions_photo_fk;
alter table room_submissions add constraint room_submissions_photo_fk
  foreign key (gym_id, photo_id) references progress_photos (gym_id, id) on delete set null (photo_id);
alter table room_assignments drop constraint if exists room_assignments_checkin_type_check;
alter table room_assignments add constraint room_assignments_checkin_type_check
  check (checkin_type in ('question', 'weight', 'note', 'photo'));

alter table progress_photos enable row level security;
grant select on progress_photos to authenticated;

-- ---- 3. who may see a photo --------------------------------------------------------------------

-- The member; a coach they train with, if they share their album; the coach of
-- a room they handed this photo in to. Nobody else — not the owner, not the desk.
create or replace function may_see_progress_photo(p_photo uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from progress_photos ph
     where ph.id = p_photo and ph.gym_id = current_gym_id()
       and (ph.member_id = auth.uid()
            or (storage_role_here() = 'trainer'
                and is_my_trainee(ph.member_id, auth.uid())
                and coalesce((select sp.share_photos from member_share_prefs sp
                               where sp.member_id = ph.member_id and sp.gym_id = ph.gym_id), false))
            or exists (select 1 from room_submissions s
                         join room_assignments a on a.id = s.assignment_id
                         join rooms r on r.id = a.room_id
                        where s.photo_id = ph.id and r.trainer_id = auth.uid()))
  );
$$;

create or replace function may_read_progress_file(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select may_see_progress_photo(id) from progress_photos where path = p_name), false);
$$;

drop policy if exists progress_photos_read on progress_photos;
create policy progress_photos_read on progress_photos for select to authenticated
  using (may_see_progress_photo(id));

-- ---- 4. storage: only into a reserved slot; read by the same rule; delete your own ------------

drop policy if exists progress_insert_own on storage.objects;
drop policy if exists progress_read      on storage.objects;
drop policy if exists progress_delete_own on storage.objects;
create policy progress_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'progress'
              and exists (select 1 from public.progress_photos ph where ph.path = name and ph.member_id = auth.uid()));
create policy progress_read on storage.objects for select to authenticated
  using (bucket_id = 'progress' and public.may_read_progress_file(name));
create policy progress_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'progress'
         and exists (select 1 from public.progress_photos ph where ph.path = name and ph.member_id = auth.uid()));

-- ---- 5. functions --------------------------------------------------------------------------------

create or replace function reserve_progress_photo(p_pose text default 'front', p_taken_on date default null,
                                                  p_note text default null)
returns table (photo_id uuid, path text)
language plpgsql security definer set search_path = public as $$
declare v_gym uuid := current_gym_id(); v_path text; v_id uuid;
begin
  if storage_role_here() is distinct from 'member' or not gym_writable() then
    raise exception 'Only a member keeps progress photos.' using errcode = '42501';
  end if;
  if (select count(*) from progress_photos where member_id = auth.uid() and gym_id = v_gym) >= 200 then
    raise exception 'You have 200 progress photos. Delete an old one to add another.' using errcode = '23514';
  end if;
  v_path := v_gym || '/' || auth.uid() || '/' || gen_random_uuid() || '.jpg';
  insert into progress_photos (gym_id, member_id, path, pose, taken_on, note)
  values (v_gym, auth.uid(), v_path, coalesce(p_pose, 'front'),
          coalesce(p_taken_on, (now() at time zone 'Asia/Manila')::date), nullif(btrim(coalesce(p_note, '')), ''))
  returning id into v_id;
  return query select v_id, v_path;
end;
$$;

-- The row goes; the app removes the file first (the delete policy allows it).
create or replace function delete_progress_photo(p_photo uuid) returns text
language plpgsql security definer set search_path = public as $$
declare v_path text;
begin
  delete from progress_photos where id = p_photo and member_id = auth.uid() and gym_id = current_gym_id()
  returning path into v_path;
  if v_path is null then raise exception 'That photo is not yours.' using errcode = '42501'; end if;
  return v_path;
end;
$$;

create or replace function set_share_photos(p_share boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if storage_role_here() is distinct from 'member' then
    raise exception 'Only a member decides this.' using errcode = '42501';
  end if;
  insert into member_share_prefs (gym_id, member_id, share_photos) values (current_gym_id(), auth.uid(), p_share)
  on conflict (gym_id, member_id) do update set share_photos = excluded.share_photos, updated_at = now();
end;
$$;

-- A trainee's shared album, for their coach (nothing when not shared).
create or replace function trainee_progress_photos(p_member uuid)
returns table (id uuid, path text, pose text, taken_on date, note text)
language sql stable security definer set search_path = public as $$
  select ph.id, ph.path, ph.pose, ph.taken_on, ph.note from progress_photos ph
   where ph.member_id = p_member and ph.gym_id = current_gym_id() and may_see_progress_photo(ph.id)
   order by ph.taken_on desc, ph.created_at desc;
$$;

-- A photo check-in: the photo must be the member's own. Handing it in is what
-- shows it to this room's coach (may_see_progress_photo's third branch).
create or replace function submit_checkin_photo(p_assignment uuid, p_photo uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare a room_assignments; v_sub uuid;
begin
  select * into a from room_assignments where id = p_assignment and gym_id = current_gym_id();
  if a.id is null or a.checkin_type is distinct from 'photo' then raise exception 'That is not a photo check-in here.'; end if;
  if not is_assignment_target(a.id, auth.uid()) or not gym_writable() then
    raise exception 'That check-in is not set for you.' using errcode = '42501';
  end if;
  if not exists (select 1 from progress_photos where id = p_photo and member_id = auth.uid()) then
    raise exception 'Hand in one of your own photos.' using errcode = '42501';
  end if;
  if exists (select 1 from room_submissions where assignment_id = a.id and member_id = auth.uid() and returned_at is not null) then
    raise exception 'Your coach already returned this one.';
  end if;
  insert into room_submissions (gym_id, assignment_id, member_id, photo_id)
  values (a.gym_id, a.id, auth.uid(), p_photo)
  on conflict (assignment_id, member_id) do update set photo_id = excluded.photo_id
  returning id into v_sub;
  perform award_classwork(v_sub);
  perform notify_trainer_of_handin(a.id);
  return v_sub;
end;
$$;

-- 0129's text/number check-in, now refusing the photo kind (it needs a photo).
create or replace function submit_checkin(p_assignment uuid, p_text text default null, p_number numeric default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare a room_assignments; v_sub uuid; v_text text := nullif(btrim(coalesce(p_text, '')), '');
begin
  select * into a from room_assignments where id = p_assignment and gym_id = current_gym_id();
  if a.id is null or a.kind <> 'checkin' then raise exception 'That is not a check-in here.'; end if;
  if a.checkin_type = 'photo' then raise exception 'This check-in needs a photo.'; end if;
  if not is_assignment_target(a.id, auth.uid()) or not gym_writable() then
    raise exception 'That check-in is not set for you.' using errcode = '42501';
  end if;
  if a.checkin_type = 'weight' and (p_number is null or p_number < 20 or p_number > 400) then
    raise exception 'Enter your body weight in kilograms (20 to 400).';
  end if;
  if a.checkin_type in ('question', 'note') and v_text is null then
    raise exception 'Write your answer first.';
  end if;
  if exists (select 1 from room_submissions where assignment_id = a.id and member_id = auth.uid() and returned_at is not null) then
    raise exception 'Your coach already returned this one.';
  end if;
  insert into room_submissions (gym_id, assignment_id, member_id, answer_text, answer_number)
  values (a.gym_id, a.id, auth.uid(), v_text, case when a.checkin_type = 'weight' then p_number end)
  on conflict (assignment_id, member_id) do update
     set answer_text = excluded.answer_text, answer_number = excluded.answer_number
  returning id into v_sub;
  perform award_classwork(v_sub);
  perform notify_trainer_of_handin(a.id);
  return v_sub;
end;
$$;

-- ---- 6. tenancy ------------------------------------------------------------------------------------

create or replace function tenancy_gym_tables() returns text[] language sql immutable as $$
  select array['account_status_events','achievement_unlocks','achievements','activity_log',
    'assistant_conversations','assistant_messages','attendance','body_measurements','bookings',
    'cancellation_reasons','cash_closeouts','challenge_participants','challenges','class_templates',
    'class_waitlist','classes','conversations','event_registrations','events','fitness_goals','freemium_trials',
    'goal_templates','gym_exercise_media','gym_goals','gym_invitations','gym_modules','gym_photos','gym_plans',
    'gym_program_days','gym_programs','gym_settings','gym_waivers','gym_workout_items','gym_workouts',
    'invoice_counters','member_profiles','member_share_prefs','membership_events',
    'membership_plans','membership_requests','memberships','messages',
    'notifications','payments','pending_registrations','personal_records','plan_features',
    'point_ledger','point_rules','program_enrolments','progress_photos',
    'pt_sessions','referral_codes','referrals','refund_rules','renewal_requests',
    'reward_redemptions','rewards','room_assignments','room_comments','room_members','room_posts',
    'room_submissions','rooms',
    'saved_resources','season_claims','season_tiers','squad_members','squad_weeks','squads',
    'trainer_availability','trainer_credentials','trainer_feedback','trainer_profiles',
    'trainer_ratings','waiver_acceptances','winback_rules','winback_sends','workout_logs','workout_plans',
    'workout_routine_exercises','workout_routines','workout_sets']::text[]
$$;

drop policy if exists tenant_select on progress_photos;
drop policy if exists tenant_insert on progress_photos;
drop policy if exists tenant_update on progress_photos;
drop policy if exists tenant_delete on progress_photos;
create policy tenant_select on progress_photos as restrictive for select to anon, authenticated
  using (gym_id = current_gym_id());
create policy tenant_insert on progress_photos as restrictive for insert to anon, authenticated
  with check (gym_id = current_gym_id() and gym_writable());
create policy tenant_update on progress_photos as restrictive for update to anon, authenticated
  using (gym_id = current_gym_id() and gym_writable()) with check (gym_id = current_gym_id());
create policy tenant_delete on progress_photos as restrictive for delete to anon, authenticated
  using (gym_id = current_gym_id() and gym_writable());

revoke all on function may_see_progress_photo(uuid), may_read_progress_file(text),
  reserve_progress_photo(text, date, text), delete_progress_photo(uuid), set_share_photos(boolean),
  trainee_progress_photos(uuid), submit_checkin_photo(uuid, uuid) from public, anon;
grant execute on function may_see_progress_photo(uuid), may_read_progress_file(text),
  reserve_progress_photo(text, date, text), delete_progress_photo(uuid), set_share_photos(boolean),
  trainee_progress_photos(uuid), submit_checkin_photo(uuid, uuid) to authenticated;

create or replace function migration_0132_applied() returns boolean
language sql immutable as $marker$ select true $marker$;
revoke all on function migration_0132_applied() from public, anon;
grant execute on function migration_0132_applied() to authenticated;
comment on function migration_0132_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0132.sql
