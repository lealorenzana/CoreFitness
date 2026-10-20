-- 0207: Equipment reports and room removals say why (2026-10-20, the approved
-- Equipment and Rooms mock-ups)
--
-- Equipment: a report could only end by the item being marked fixed
-- (set_equipment_status 'available', 0184). A report that turns out to be
-- nothing — the seat pin was fine, the member was on the wrong machine — sat in
-- the desk's queue for ever, or the desk marked a working machine "fixed".
-- dismiss_equipment_report() closes one report with a short reason and tells
-- the member who sent it.
--
-- Rooms: the owner and the desk could delete a post or comment (0128's
-- room_*_delete policies), and the author simply found it gone.
-- moderate_room_item() removes it and tells the author why, in their inbox.
-- The plain delete still works (the policies are unchanged); the screen uses this.

create or replace function dismiss_equipment_report(p_report uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if auth.uid() is null or not is_front_desk() or not gym_writable() then
    raise exception 'The front desk closes equipment reports.' using errcode = '42501';
  end if;
  if coalesce(btrim(p_reason), '') = '' or length(p_reason) > 200 then
    raise exception 'Say in a few words what you found (up to 200 characters).';
  end if;
  select q.id, q.member_id, q.status, e.name, e.gym_id into r
    from equipment_reports q join gym_equipment e on e.id = q.equipment_id
   where q.id = p_report and q.gym_id = current_gym_id();
  if r.id is null then raise exception 'That report is not in this gym.'; end if;
  if r.status <> 'open' then raise exception 'That report is already closed.'; end if;
  update equipment_reports set status = 'resolved', resolved_at = now(), resolved_by = auth.uid() where id = p_report;
  perform notify_once(r.member_id, 'system', 'Thanks for reporting the ' || r.name,
    'The gym checked it: ' || btrim(p_reason), '/member/equipment', 'equipment:checked:' || p_report, r.gym_id);
end;
$$;
revoke all on function dismiss_equipment_report(uuid, text) from public, anon;
grant execute on function dismiss_equipment_report(uuid, text) to authenticated;

create or replace function moderate_room_item(p_kind text, p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare v_gym uuid := current_gym_id(); v_author uuid; v_room text;
begin
  if auth.uid() is null or not is_front_desk() or not gym_writable() then
    raise exception 'Only the owner and the desk remove posts.' using errcode = '42501';
  end if;
  if coalesce(btrim(p_reason), '') = '' or length(p_reason) > 200 then
    raise exception 'Say why it was removed (up to 200 characters) — the person is told.';
  end if;
  if p_kind = 'post' then
    select p.author_id, r.name into v_author, v_room from room_posts p join rooms r on r.id = p.room_id
     where p.id = p_id and p.gym_id = v_gym;
    if v_author is null then raise exception 'That post is not in this gym.'; end if;
    delete from room_posts where id = p_id and gym_id = v_gym;
  elsif p_kind = 'comment' then
    select c.author_id, r.name into v_author, v_room from room_comments c join room_posts p on p.id = c.post_id join rooms r on r.id = p.room_id
     where c.id = p_id and c.gym_id = v_gym;
    if v_author is null then raise exception 'That comment is not in this gym.'; end if;
    delete from room_comments where id = p_id and gym_id = v_gym;
  else
    raise exception 'Remove a post or a comment.';
  end if;
  if v_author is distinct from auth.uid() then
    perform notify_once(v_author, 'system', 'Your ' || p_kind || ' in ' || v_room || ' was removed',
      'The gym removed it: ' || btrim(p_reason), null, 'room-removed:' || p_id, v_gym);
  end if;
end;
$$;
revoke all on function moderate_room_item(text, uuid, text) from public, anon;
grant execute on function moderate_room_item(text, uuid, text) to authenticated;

create or replace function migration_0207_applied() returns boolean
language sql immutable as $marker$ select true $marker$;
revoke all on function migration_0207_applied() from public, anon;
grant execute on function migration_0207_applied() to authenticated;
comment on function migration_0207_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0207.sql
