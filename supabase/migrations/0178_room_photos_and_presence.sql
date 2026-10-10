-- ============================================================================
-- 0178 — Every room has a picture; a coach says if they are around
-- ============================================================================
--
-- The trainer app moves to a Discord-style layout (2026-10-10): a rail of
-- round room pictures — classes, 1-on-1s, groups — beside the room's channels.
-- A picture per room:
--   1-on-1   the member's own photo
--   class    a picture the coach sets (else the gym's class template's colour)
--   group    a picture the coach sets
-- my_room_photos() answers that for the caller's rooms in one call.
--
-- And the profile in the corner carries the coach's status — Available, Away,
-- On leave — which members see on the coach's card (and which project C's
-- stand-in flow reads: "On leave" means pick another coach for now).
-- ============================================================================

alter table rooms add column if not exists photo_url text
  check (photo_url is null or position('/gyms/' || gym_id::text || '/content/' in photo_url) > 0);

create or replace function my_room_photos() returns table (room_id uuid, photo_url text)
language sql stable security definer set search_path = public as $$
  select r.id,
         case when r.kind = 'pt' then (select p.photo_url from profiles p where p.id = r.member_id)
              else r.photo_url end
    from rooms r
   where may_see_room(r.id)
     and (storage_role_here() <> 'trainer' or r.trainer_id = auth.uid());
$$;
revoke all on function my_room_photos() from public, anon;
grant execute on function my_room_photos() to authenticated;

-- The coach sets their own class or group room's picture (an uploaded gym photo).
create or replace function set_room_photo(p_room uuid, p_url text) returns void
language plpgsql security definer set search_path = public as $$
declare r rooms%rowtype;
begin
  select * into r from rooms where id = p_room and gym_id = current_gym_id();
  if r.id is null or r.trainer_id <> auth.uid() or not gym_writable() then
    raise exception 'Only the room''s coach sets its picture.' using errcode = '42501';
  end if;
  if r.kind = 'pt' then raise exception 'A 1-on-1 room shows the member''s own photo.'; end if;
  if p_url is not null and position('/gyms/' || r.gym_id::text || '/content/' in p_url) = 0 then
    raise exception 'Upload the picture here first.';
  end if;
  update rooms set photo_url = p_url where id = r.id;
end;
$$;
revoke all on function set_room_photo(uuid, text) from public, anon;
grant execute on function set_room_photo(uuid, text) to authenticated;

alter table trainer_profiles add column if not exists presence text not null default 'available';
alter table trainer_profiles drop constraint if exists trainer_profiles_presence_check;
alter table trainer_profiles add constraint trainer_profiles_presence_check check (presence in ('available', 'away', 'on_leave'));

create or replace function set_my_presence(p_presence text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(storage_role_here(), '') <> 'trainer' then
    raise exception 'Only a coach sets a status.' using errcode = '42501';
  end if;
  if p_presence not in ('available', 'away', 'on_leave') then
    raise exception 'A status is Available, Away or On leave.';
  end if;
  update trainer_profiles set presence = p_presence where profile_id = auth.uid() and gym_id = current_gym_id();
end;
$$;
revoke all on function set_my_presence(text) from public, anon;
grant execute on function set_my_presence(text) to authenticated;

create or replace function migration_0178_applied() returns boolean
language sql immutable as $marker$ select true $marker$;
revoke all on function migration_0178_applied() from public, anon;
grant execute on function migration_0178_applied() to authenticated;
comment on function migration_0178_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0178.sql
