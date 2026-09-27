-- 0128: COACHING ROOMS — a Google Classroom for trainers (part 1: rooms + stream)
--
-- Spec: docs/superpowers/specs/2026-09-27-coaching-rooms-design.md
--
-- A room is where a trainer and their members meet between sessions. Three kinds:
--   class — one per recurring class a trainer runs (class_templates). Its members
--           are whoever booked it from 60 days ago onward: COMPUTED, never typed.
--   pt    — one per trainee a trainer has 1-on-1 sessions with. Computed.
--   group — a coaching group the trainer makes ("8-week fat loss"), joined by a
--           6-letter code. The only kind with stored members.
--
-- Rules:
--   * Rooms exist for data that arrives by elapsed time (bookings, sessions), so
--     they are made by a re-runnable sweep, `sync_gym_rooms()`, which every rooms
--     screen calls on load — the same pattern as the reminder sweeps.
--   * `rooms` and `room_members` have NO write policy: every change goes through
--     a function that checks who is asking (squads and referrals, 0124/0125).
--   * One definition of "who is in a room" (`room_member_ids`) and "who may see
--     it" (`may_see_room`); every policy and function calls those.
--   * The trainer posts; members comment (first name + initial on screen). The
--     gym's owner and desk read every room and may remove a post or comment,
--     but never post as the trainer.
--   * The plan gate is `plan_allows(member, 'coaching_rooms')`, on for paid plans
--     by default. Without it a member still reads a class or 1-on-1 room's
--     stream; commenting, groups and (0129) classwork lock and explain.

-- ---- 1. the plan feature --------------------------------------------------------------------

insert into features (key, label, description, default_free, default_freemium, default_premium, sort_order)
values ('coaching_rooms', 'Coaching rooms',
        'Your coach''s rooms: comment on posts, join coaching groups and do the classwork your coach sets.',
        false, false, true, 21)
on conflict (key) do nothing;
select sync_plan_features();

-- ---- 2. tables ------------------------------------------------------------------------------------

create table if not exists rooms (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null default acting_gym_id() references gyms(id),
  kind        text not null check (kind in ('class', 'pt', 'group')),
  trainer_id  uuid not null references profiles(id) on delete cascade,
  template_id uuid,
  member_id   uuid references profiles(id) on delete cascade,
  name        text not null check (length(btrim(name)) between 1 and 80),
  description text check (description is null or length(description) <= 500),
  join_code   text check (join_code is null or join_code ~ '^[A-Z]{6}$'),
  comments_on boolean not null default true,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  unique (gym_id, id),
  foreign key (gym_id, template_id) references class_templates (gym_id, id) on delete cascade,
  check ((kind = 'class') = (template_id is not null)),
  check ((kind = 'pt')    = (member_id is not null)),
  check ((kind = 'group') = (join_code is not null))
);
create unique index if not exists rooms_one_per_class on rooms (gym_id, template_id) where kind = 'class';
create unique index if not exists rooms_one_per_trainee on rooms (gym_id, trainer_id, member_id) where kind = 'pt';
create unique index if not exists rooms_code on rooms (gym_id, join_code) where join_code is not null;
create index if not exists rooms_trainer_idx on rooms (gym_id, trainer_id);

create table if not exists room_members (
  gym_id    uuid not null default acting_gym_id() references gyms(id),
  room_id   uuid not null,
  member_id uuid not null references profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (room_id, member_id),
  foreign key (gym_id, room_id) references rooms (gym_id, id) on delete cascade
);
create index if not exists room_members_member_idx on room_members (gym_id, member_id);

create table if not exists room_posts (
  id         uuid primary key default gen_random_uuid(),
  gym_id     uuid not null default acting_gym_id() references gyms(id),
  room_id    uuid not null,
  author_id  uuid not null default auth.uid() references profiles(id) on delete cascade,
  body       text not null check (length(btrim(body)) between 1 and 2000),
  -- A photo is the gym's own content upload (0121: gyms/<gym>/content/…).
  photo_url  text check (photo_url is null or position('/gyms/' || gym_id::text || '/content/' in photo_url) > 0),
  video_url  text check (is_allowed_video_url(video_url)),
  created_at timestamptz not null default now(),
  unique (gym_id, id),
  foreign key (gym_id, room_id) references rooms (gym_id, id) on delete cascade
);
create index if not exists room_posts_room_idx on room_posts (room_id, created_at desc);

create table if not exists room_comments (
  id         uuid primary key default gen_random_uuid(),
  gym_id     uuid not null default acting_gym_id() references gyms(id),
  post_id    uuid not null,
  author_id  uuid not null default auth.uid() references profiles(id) on delete cascade,
  body       text not null check (length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now(),
  unique (gym_id, id),
  foreign key (gym_id, post_id) references room_posts (gym_id, id) on delete cascade
);
create index if not exists room_comments_post_idx on room_comments (post_id, created_at);

alter table rooms         enable row level security;
alter table room_members  enable row level security;
alter table room_posts    enable row level security;
alter table room_comments enable row level security;
grant select on rooms, room_members to authenticated;
grant select, insert, delete on room_posts, room_comments to authenticated;

-- ---- 3. who is in a room, who may see it ---------------------------------------------------------

create or replace function room_member_ids(p_room uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  select m.member_id from rooms r join room_members m on m.room_id = r.id
   where r.id = p_room and r.kind = 'group'
  union
  select r.member_id from rooms r where r.id = p_room and r.kind = 'pt'
  union
  select b.member_id
    from rooms r
    join classes c  on c.template_id = r.template_id and c.gym_id = r.gym_id
    join bookings b on b.class_id = c.id and b.gym_id = r.gym_id
   where r.id = p_room and r.kind = 'class'
     and b.status <> 'cancelled'
     and c.scheduled_at >= now() - interval '60 days';
$$;

create or replace function is_in_room(p_room uuid, p_member uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from room_member_ids(p_room) x where x = p_member);
$$;

-- The one visibility rule. Current gym only; the room's trainer; the gym's owner
-- and desk (read and moderate); a member who is in it.
create or replace function may_see_room(p_room uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from rooms r
     where r.id = p_room and r.gym_id = current_gym_id()
       and (r.trainer_id = auth.uid()
            or storage_role_here() in ('admin', 'staff')
            or (storage_role_here() = 'member' and is_in_room(r.id, auth.uid())))
  );
$$;

-- May this member do more than read (comment, join groups, classwork)?
create or replace function room_full_access(p_member uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(plan_allows(p_member, 'coaching_rooms'), false);
$$;

-- ---- 4. policies ---------------------------------------------------------------------------------

drop policy if exists rooms_read on rooms;
create policy rooms_read on rooms for select to authenticated using (may_see_room(id));

drop policy if exists room_members_read on room_members;
create policy room_members_read on room_members for select to authenticated using (may_see_room(room_id));

drop policy if exists room_posts_read   on room_posts;
drop policy if exists room_posts_insert on room_posts;
drop policy if exists room_posts_delete on room_posts;
create policy room_posts_read on room_posts for select to authenticated using (may_see_room(room_id));
create policy room_posts_insert on room_posts for insert to authenticated
  with check (author_id = auth.uid()
              and exists (select 1 from rooms r where r.id = room_id and r.trainer_id = auth.uid()
                            and r.archived_at is null and r.gym_id = current_gym_id()));
create policy room_posts_delete on room_posts for delete to authenticated
  using (may_see_room(room_id) and (author_id = auth.uid() or storage_role_here() in ('admin', 'staff')));

drop policy if exists room_comments_read   on room_comments;
drop policy if exists room_comments_insert on room_comments;
drop policy if exists room_comments_delete on room_comments;
create policy room_comments_read on room_comments for select to authenticated
  using (exists (select 1 from room_posts p where p.id = post_id and may_see_room(p.room_id)));
create policy room_comments_insert on room_comments for insert to authenticated
  with check (author_id = auth.uid() and exists (
    select 1 from room_posts p join rooms r on r.id = p.room_id
     where p.id = post_id and r.archived_at is null and r.comments_on and r.gym_id = current_gym_id()
       and (r.trainer_id = auth.uid()
            or (storage_role_here() = 'member' and is_in_room(r.id, auth.uid()) and room_full_access(auth.uid())))));
create policy room_comments_delete on room_comments for delete to authenticated
  using (exists (select 1 from room_posts p join rooms r on r.id = p.room_id
                  where p.id = post_id and may_see_room(r.id)
                    and (room_comments.author_id = auth.uid() or r.trainer_id = auth.uid()
                         or storage_role_here() in ('admin', 'staff'))));

-- ---- 5. making the automatic rooms ---------------------------------------------------------------

-- Re-runnable: creates what is missing, names follow the class or the trainee,
-- a class room follows its class's trainer and closes when the class retires.
create or replace function sync_gym_rooms() returns int
language plpgsql security definer set search_path = public as $$
declare v_gym uuid := current_gym_id(); n int := 0; k int;
begin
  if v_gym is null or storage_role_here() is null then return 0; end if;

  insert into rooms (gym_id, kind, trainer_id, template_id, name)
  select t.gym_id, 'class', t.trainer_id, t.id, t.name
    from class_templates t
   where t.gym_id = v_gym and t.active and t.trainer_id is not null
  on conflict (gym_id, template_id) where kind = 'class' do nothing;
  get diagnostics k = row_count; n := n + k;

  -- The class's trainer changed, or it was renamed: the room follows.
  update rooms r set trainer_id = t.trainer_id, name = t.name
    from class_templates t
   where r.gym_id = v_gym and r.kind = 'class' and t.id = r.template_id and t.gym_id = r.gym_id
     and t.trainer_id is not null
     and (r.trainer_id is distinct from t.trainer_id or r.name is distinct from t.name);
  -- Retired (or left without a coach): archived, still readable. Back if revived.
  update rooms r set archived_at = now()
    from class_templates t
   where r.gym_id = v_gym and r.kind = 'class' and t.id = r.template_id and r.archived_at is null
     and (not t.active or t.trainer_id is null);
  update rooms r set archived_at = null
    from class_templates t
   where r.gym_id = v_gym and r.kind = 'class' and t.id = r.template_id and r.archived_at is not null
     and t.active and t.trainer_id is not null;

  insert into rooms (gym_id, kind, trainer_id, member_id, name)
  select distinct s.gym_id, 'pt', s.trainer_id, s.member_id,
         left(coalesce(nullif(btrim(p.first_name || ' ' || p.last_name), ''), 'Trainee') || ' · 1-on-1', 80)
    from pt_sessions s join profiles p on p.id = s.member_id
   where s.gym_id = v_gym
  on conflict (gym_id, trainer_id, member_id) where kind = 'pt' do nothing;
  get diagnostics k = row_count; n := n + k;
  return n;
end;
$$;

-- ---- 6. coaching groups --------------------------------------------------------------------------

create or replace function new_room_code(p_gym uuid) returns text
language plpgsql volatile security definer set search_path = public as $$
declare v_code text; i int := 0;
begin
  loop
    v_code := (select string_agg(chr(65 + floor(random() * 26)::int), '') from generate_series(1, 6));
    exit when not exists (select 1 from rooms where gym_id = p_gym and join_code = v_code);
    i := i + 1;
    if i > 20 then raise exception 'Could not make a room code. Try again.'; end if;
  end loop;
  return v_code;
end;
$$;

create or replace function create_group_room(p_name text, p_description text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_gym uuid := current_gym_id(); v_id uuid;
begin
  if storage_role_here() is distinct from 'trainer' or not gym_writable() then
    raise exception 'Only a trainer of this gym can start a coaching group.' using errcode = '42501';
  end if;
  insert into rooms (gym_id, kind, trainer_id, name, description, join_code)
  values (v_gym, 'group', auth.uid(), btrim(p_name), nullif(btrim(coalesce(p_description, '')), ''), new_room_code(v_gym))
  returning id into v_id;
  return v_id;
end;
$$;

-- The trainer's own room only. NULL leaves a field as it is.
create or replace function update_room(p_room uuid, p_name text default null, p_description text default null,
                                       p_comments_on boolean default null) returns void
language plpgsql security definer set search_path = public as $$
declare r rooms;
begin
  select * into r from rooms where id = p_room and gym_id = current_gym_id();
  if r.id is null or r.trainer_id is distinct from auth.uid() or not gym_writable() then
    raise exception 'Only this room''s trainer can change it.' using errcode = '42501';
  end if;
  update rooms set
    -- A class or 1-on-1 room is named after its class or trainee.
    name        = case when r.kind = 'group' and p_name is not null then btrim(p_name) else name end,
    description = case when p_description is not null then nullif(btrim(p_description), '') else description end,
    comments_on = coalesce(p_comments_on, comments_on)
  where id = p_room;
end;
$$;

create or replace function reset_room_code(p_room uuid) returns text
language plpgsql security definer set search_path = public as $$
declare r rooms; v_code text;
begin
  select * into r from rooms where id = p_room and gym_id = current_gym_id();
  if r.id is null or r.kind <> 'group' or r.trainer_id is distinct from auth.uid() or not gym_writable() then
    raise exception 'Only this group''s trainer can change its code.' using errcode = '42501';
  end if;
  v_code := new_room_code(r.gym_id);
  update rooms set join_code = v_code where id = p_room;
  return v_code;
end;
$$;

create or replace function set_room_archived(p_room uuid, p_archived boolean) returns void
language plpgsql security definer set search_path = public as $$
declare r rooms;
begin
  select * into r from rooms where id = p_room and gym_id = current_gym_id();
  if r.id is null or r.kind <> 'group' or r.trainer_id is distinct from auth.uid() or not gym_writable() then
    raise exception 'Only this group''s trainer can close or reopen it.' using errcode = '42501';
  end if;
  update rooms set archived_at = case when p_archived then now() end where id = p_room;
end;
$$;

create or replace function join_room(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_gym uuid := current_gym_id(); r rooms;
begin
  if storage_role_here() is distinct from 'member' or not gym_writable() then
    raise exception 'Only a member of this gym can join a coaching group.' using errcode = '42501';
  end if;
  if not room_full_access(auth.uid()) then
    raise exception 'Coaching groups are not part of your plan.' using errcode = '42501';
  end if;
  select * into r from rooms
   where gym_id = v_gym and join_code = upper(btrim(p_code)) and kind = 'group';
  if r.id is null then raise exception 'No coaching group here has that code.'; end if;
  if r.archived_at is not null then raise exception 'That coaching group has closed.'; end if;
  insert into room_members (gym_id, room_id, member_id) values (v_gym, r.id, auth.uid())
  on conflict do nothing;
  return r.id;
end;
$$;

create or replace function leave_room(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from room_members where room_id = p_room and member_id = auth.uid() and gym_id = current_gym_id();
  if not found then raise exception 'You are not in that group.'; end if;
end;
$$;

create or replace function remove_from_room(p_room uuid, p_member uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from rooms where id = p_room and gym_id = current_gym_id()
                   and kind = 'group' and trainer_id = auth.uid()) or not gym_writable() then
    raise exception 'Only this group''s trainer can remove someone.' using errcode = '42501';
  end if;
  delete from room_members where room_id = p_room and member_id = p_member;
end;
$$;

-- ---- 7. what the screens read --------------------------------------------------------------------

-- Every room the caller may see, with the figures its card needs.
create or replace function my_rooms()
returns table (id uuid, kind text, name text, description text, trainer_id uuid, trainer_name text,
               member_count int, post_count int, last_post_at timestamptz, comments_on boolean,
               archived boolean, join_code text, is_mine boolean, full_access boolean)
language sql stable security definer set search_path = public as $$
  select r.id, r.kind, r.name, r.description, r.trainer_id,
         btrim(tp.first_name || ' ' || tp.last_name),
         (select count(*)::int from room_member_ids(r.id)),
         (select count(*)::int from room_posts p where p.room_id = r.id),
         (select max(p.created_at) from room_posts p where p.room_id = r.id),
         r.comments_on, r.archived_at is not null,
         case when r.trainer_id = auth.uid() then r.join_code end,
         r.trainer_id = auth.uid(),
         case when storage_role_here() = 'member' then room_full_access(auth.uid()) else true end
    from rooms r join profiles tp on tp.id = r.trainer_id
   where may_see_room(r.id)
     -- A trainer's list is their own rooms; the owner's page asks all_gym_rooms().
     and (storage_role_here() <> 'trainer' or r.trainer_id = auth.uid())
   order by (r.archived_at is not null), r.kind = 'pt', r.name;
$$;

-- The people in a room. Members see first name + initial; the room's trainer and
-- the gym's staff see full names.
create or replace function room_people(p_room uuid)
returns table (member_id uuid, name text, photo_url text, is_trainer boolean, is_me boolean)
language sql stable security definer set search_path = public as $$
  with r as (select * from rooms where id = p_room and may_see_room(p_room)),
  full_names as (select (select trainer_id from r) = auth.uid() or storage_role_here() in ('admin', 'staff') as ok)
  select p.id,
         case when (select ok from full_names) or p.id = auth.uid() or p.id = (select trainer_id from r)
              then btrim(p.first_name || ' ' || p.last_name)
              else p.first_name || ' ' || left(coalesce(p.last_name, ''), 1) || '.' end,
         p.photo_url, p.id = (select trainer_id from r), p.id = auth.uid()
    from profiles p
   where exists (select 1 from r)
     and (p.id = (select trainer_id from r) or p.id in (select room_member_ids(p_room)))
   order by p.id <> (select trainer_id from r), 2;
$$;

-- The stream: posts newest first, each with its comments and who wrote them.
create or replace function room_stream(p_room uuid)
returns table (post_id uuid, created_at timestamptz, body text, photo_url text, video_url text,
               author_name text, can_delete boolean, comments jsonb)
language sql stable security definer set search_path = public as $$
  with r as (select * from rooms where id = p_room and may_see_room(p_room)),
  mod as (select (select trainer_id from r) = auth.uid() or storage_role_here() in ('admin', 'staff') as ok)
  select po.id, po.created_at, po.body, po.photo_url, po.video_url,
         btrim(a.first_name || ' ' || a.last_name),
         po.author_id = auth.uid() or storage_role_here() in ('admin', 'staff'),
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'id', c.id, 'body', c.body, 'created_at', c.created_at,
                    'author', case when c.author_id = (select trainer_id from r) or (select ok from mod) or c.author_id = auth.uid()
                                   then btrim(ca.first_name || ' ' || ca.last_name)
                                   else ca.first_name || ' ' || left(coalesce(ca.last_name, ''), 1) || '.' end,
                    'is_trainer', c.author_id = (select trainer_id from r),
                    'can_delete', c.author_id = auth.uid() or (select ok from mod))
                  order by c.created_at)
             from room_comments c join profiles ca on ca.id = c.author_id
            where c.post_id = po.id), '[]'::jsonb)
    from room_posts po join profiles a on a.id = po.author_id
   where po.room_id = (select id from r)
   order by po.created_at desc;
$$;

-- The owner's Rooms page: every room in the gym, by trainer, with its activity.
create or replace function all_gym_rooms()
returns table (id uuid, kind text, name text, trainer_name text, member_count int,
               post_count int, comment_count int, last_post_at timestamptz, archived boolean)
language sql stable security definer set search_path = public as $$
  select r.id, r.kind, r.name, btrim(tp.first_name || ' ' || tp.last_name),
         (select count(*)::int from room_member_ids(r.id)),
         (select count(*)::int from room_posts p where p.room_id = r.id),
         (select count(*)::int from room_comments c join room_posts p on p.id = c.post_id where p.room_id = r.id),
         (select max(p.created_at) from room_posts p where p.room_id = r.id),
         r.archived_at is not null
    from rooms r join profiles tp on tp.id = r.trainer_id
   where r.gym_id = current_gym_id() and storage_role_here() in ('admin', 'staff')
   order by 4, r.archived_at is not null, r.name;
$$;

-- A member's rooms, for the owner's member drawer.
create or replace function member_rooms(p_member uuid)
returns table (id uuid, kind text, name text, trainer_name text)
language sql stable security definer set search_path = public as $$
  select r.id, r.kind, r.name, btrim(tp.first_name || ' ' || tp.last_name)
    from rooms r join profiles tp on tp.id = r.trainer_id
   where r.gym_id = current_gym_id() and r.archived_at is null
     and (storage_role_here() in ('admin', 'staff') or r.trainer_id = auth.uid())
     and is_in_room(r.id, p_member)
   order by r.name;
$$;

-- ---- 8. telling the room -------------------------------------------------------------------------

create or replace function trg_room_post_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_room rooms; m uuid;
begin
  select * into v_room from rooms where id = new.room_id;
  for m in select room_member_ids(new.room_id) loop
    perform notify_once(m, 'coaching', 'New post in ' || v_room.name,
      left(new.body, 140), '/member/rooms/' || new.room_id,
      'room_post:' || new.id || ':' || m, v_room.gym_id);
  end loop;
  return new;
end;
$$;
drop trigger if exists room_post_notify on room_posts;
create trigger room_post_notify after insert on room_posts
  for each row execute function trg_room_post_notify();

-- ---- 9. tenancy ------------------------------------------------------------------------------------

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
    'reward_redemptions','rewards','room_comments','room_members','room_posts','rooms',
    'saved_resources','season_claims','season_tiers','squad_members','squad_weeks','squads',
    'trainer_availability','trainer_credentials','trainer_feedback','trainer_profiles',
    'trainer_ratings','waiver_acceptances','workout_logs','workout_plans',
    'workout_routine_exercises','workout_routines','workout_sets']::text[]
$$;

do $$
declare t text;
begin
  foreach t in array array['rooms', 'room_members', 'room_posts', 'room_comments'] loop
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

-- ---- 10. grants ------------------------------------------------------------------------------------

revoke all on function room_member_ids(uuid), is_in_room(uuid, uuid), may_see_room(uuid),
  room_full_access(uuid), sync_gym_rooms(), new_room_code(uuid), create_group_room(text, text),
  update_room(uuid, text, text, boolean), reset_room_code(uuid), set_room_archived(uuid, boolean),
  join_room(text), leave_room(uuid), remove_from_room(uuid, uuid), my_rooms(), room_people(uuid),
  room_stream(uuid), all_gym_rooms(), member_rooms(uuid), trg_room_post_notify()
  from public, anon;
revoke all on function room_member_ids(uuid), new_room_code(uuid), trg_room_post_notify() from authenticated;
grant execute on function is_in_room(uuid, uuid), may_see_room(uuid), room_full_access(uuid),
  sync_gym_rooms(), create_group_room(text, text), update_room(uuid, text, text, boolean),
  reset_room_code(uuid), set_room_archived(uuid, boolean), join_room(text), leave_room(uuid),
  remove_from_room(uuid, uuid), my_rooms(), room_people(uuid), room_stream(uuid), all_gym_rooms(),
  member_rooms(uuid)
  to authenticated;

create or replace function migration_0128_applied() returns boolean
language sql immutable as $marker$ select true $marker$;
revoke all on function migration_0128_applied() from public, anon;
grant execute on function migration_0128_applied() to authenticated;
comment on function migration_0128_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0128.sql
