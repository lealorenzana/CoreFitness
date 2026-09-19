-- 0096 — A waitlist for full classes.
--
-- A full class said "Full" and that was the end of it (BookClass: "there is no
-- waitlist"). When somebody cancelled, the seat sat empty unless another member
-- happened to look at the right moment.
--
-- How it works:
--   * A member joins the list of a future class that is full, through
--     `join_waitlist()`. Only then — a list for a class with seats is a
--     queue for nothing. There is no insert policy; the function is the door.
--   * When a seat frees — a booking cancelled (0081's cancel_booking) or
--     rejected, a booking deleted, or the class given more capacity — a
--     trigger tells **everyone waiting**, and the first to book gets it.
--     Not a silent auto-booking: that would put a member in a class they may no
--     longer be free for, past 0017's quota and 0068's clash checks that the
--     normal booking path runs.
--   * Somebody notified in the last 30 minutes is not notified again, so a
--     seat that frees and fills and frees does not buzz the same phone.
--   * Booking the class (pending or approved) takes the member off its list.
--   * `class_waitlist_status(ids)` answers "how many are waiting, and where am
--     I" for the booking screen — counts only, never who.
--
-- Seats are what class_availability (0016/0080) counts: pending + approved.

create table if not exists class_waitlist (
  class_id    uuid not null references classes(id) on delete cascade,
  member_id   uuid not null references member_profiles(profile_id) on delete cascade,
  joined_at   timestamptz not null default now(),
  notified_at timestamptz,
  primary key (class_id, member_id)
);

create index if not exists idx_class_waitlist_member on class_waitlist(member_id);

alter table class_waitlist enable row level security;

drop policy if exists class_waitlist_select_self on class_waitlist;
create policy class_waitlist_select_self on class_waitlist for select using (member_id = auth.uid());

drop policy if exists class_waitlist_select_desk on class_waitlist;
create policy class_waitlist_select_desk on class_waitlist for select using (is_front_desk());

-- The coach of the class may see who is waiting for it.
drop policy if exists class_waitlist_select_trainer on class_waitlist;
create policy class_waitlist_select_trainer on class_waitlist for select
  using (exists (select 1 from classes c where c.id = class_id and c.trainer_id = auth.uid()));

-- Leaving is the member's own business.
drop policy if exists class_waitlist_delete_self on class_waitlist;
create policy class_waitlist_delete_self on class_waitlist for delete using (member_id = auth.uid());

grant select, delete on class_waitlist to authenticated;

create or replace function class_seats_left(p_class uuid) returns int
language sql stable security definer set search_path = public as $$
  select greatest(0, c.capacity - (select count(*) from bookings b
                                    where b.class_id = c.id and b.status in ('pending', 'approved')))::int
    from classes c where c.id = p_class;
$$;

create or replace function join_waitlist(p_class uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  c record;
  pos int;
begin
  if me is null or coalesce(get_my_role()::text, '') <> 'member' then
    raise exception 'Only members can join a waitlist' using errcode = '42501';
  end if;
  select * into c from classes where id = p_class;
  if c.id is null then raise exception 'That class no longer exists'; end if;
  if c.scheduled_at is null or c.scheduled_at <= now() then
    raise exception 'That class has already started';
  end if;
  if exists (select 1 from bookings b where b.class_id = p_class and b.member_id = me
               and b.status in ('pending', 'approved')) then
    raise exception 'You already have a place in this class';
  end if;
  if class_seats_left(p_class) > 0 then
    raise exception 'This class has a free spot — book it instead';
  end if;
  insert into class_waitlist (class_id, member_id) values (p_class, me)
  on conflict do nothing;
  select count(*)::int into pos from class_waitlist w
   where w.class_id = p_class
     and w.joined_at <= (select joined_at from class_waitlist where class_id = p_class and member_id = me);
  return pos;
end;
$$;

create or replace function leave_waitlist(p_class uuid) returns void
language sql security definer set search_path = public as $$
  delete from class_waitlist where class_id = p_class and member_id = auth.uid();
$$;

-- Counts for the booking screen, and the caller's own place in line.
create or replace function class_waitlist_status(p_classes uuid[])
returns table (class_id uuid, waiting int, my_position int)
language sql stable security definer set search_path = public as $$
  select w.class_id,
         count(*)::int,
         -- Your place in line, or NULL when you are not on it.
         nullif((select count(*)::int
                   from class_waitlist w2
                   join class_waitlist mine on mine.class_id = w2.class_id and mine.member_id = auth.uid()
                  where w2.class_id = w.class_id and w2.joined_at <= mine.joined_at), 0)
    from class_waitlist w
   where w.class_id = any(p_classes)
     and auth.uid() is not null
   group by w.class_id;
$$;

revoke all on function join_waitlist(uuid) from public, anon;
revoke all on function leave_waitlist(uuid) from public, anon;
revoke all on function class_waitlist_status(uuid[]) from public, anon;
revoke all on function class_seats_left(uuid) from public, anon;
grant execute on function join_waitlist(uuid) to authenticated;
grant execute on function leave_waitlist(uuid) to authenticated;
grant execute on function class_waitlist_status(uuid[]) to authenticated;
grant execute on function class_seats_left(uuid) to authenticated;

-- A seat freed: tell everyone still waiting who has not just been told.
create or replace function waitlist_offer(p_class uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  c record;
  w record;
  n int := 0;
  stamp text := to_char(now(), 'YYYYMMDDHH24MISS');
begin
  select * into c from classes where id = p_class;
  if c.id is null or c.scheduled_at is null or c.scheduled_at <= now() then return 0; end if;
  if class_seats_left(p_class) = 0 then return 0; end if;
  for w in
    select * from class_waitlist
     where class_id = p_class
       and (notified_at is null or notified_at < now() - interval '30 minutes')
     order by joined_at
  loop
    if notify_once(
      w.member_id, 'booking', 'A spot opened up',
      format('%s on %s has a free spot. Book it before someone else does.',
             c.name, to_char(c.scheduled_at at time zone 'Asia/Manila', 'FMDay, FMMonth FMDD "at" FMHH12:MI AM')),
      '/member/book-class',
      'waitlist:' || p_class || ':' || w.member_id || ':' || stamp
    ) then
      n := n + 1;
    end if;
    update class_waitlist set notified_at = now() where class_id = p_class and member_id = w.member_id;
  end loop;
  return n;
end;
$$;

revoke all on function waitlist_offer(uuid) from public, anon, authenticated;

create or replace function trg_bookings_waitlist() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.status in ('pending', 'approved') then
      delete from class_waitlist where class_id = new.class_id and member_id = new.member_id;
    end if;
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if old.status in ('pending', 'approved') and new.status not in ('pending', 'approved') then
      perform waitlist_offer(new.class_id);
    end if;
    return new;
  end if;
  -- DELETE
  if old.status in ('pending', 'approved') then
    perform waitlist_offer(old.class_id);
  end if;
  return old;
end;
$$;

drop trigger if exists bookings_waitlist on bookings;
create trigger bookings_waitlist after insert or update of status or delete on bookings
  for each row execute function trg_bookings_waitlist();

create or replace function trg_classes_waitlist() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.capacity > old.capacity then
    perform waitlist_offer(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists classes_waitlist on classes;
create trigger classes_waitlist after update of capacity on classes
  for each row execute function trg_classes_waitlist();

create or replace function migration_0096_applied() returns boolean
language sql immutable as $$ select true $$;
grant execute on function migration_0096_applied() to anon, authenticated;
