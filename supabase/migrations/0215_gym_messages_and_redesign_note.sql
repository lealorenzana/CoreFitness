-- 0215 — The gym's own messages are marked, so the member Inbox can pin them; the members' note
-- about the redesign.
--
-- 1. `notifications` held no sign of who wrote a row: an announcement from the owner's composer and
--    an automatic "Checked in" were the same shape (type 'system' is used by both). The redesigned
--    Inbox (2026-10-26) pins what the gym wrote above everything automatic, so the row now says so:
--    `from_gym`, set by Notifications' composer (admin app, `broadcastNotification`).
--    Only the gym's owner or desk may set it — on insert a trigger clears it for anyone else, and the
--    0029 tamper guard is extended so a member cannot turn it on later (a member may change only the
--    read / archived / cleared state of their own rows).
--
-- 2. The member app's redesign shipped (0213, 2026-10-27): one note for members on What's new (0212),
--    shown once, to accounts older than the note.
--
-- Paste once. Safe to re-run.

alter table notifications add column if not exists from_gym boolean not null default false;
comment on column notifications.from_gym is
  'Written by the gym itself — an announcement from Notifications'' composer (0215). The member Inbox pins these.';

create or replace function trg_notification_from_gym() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Only the gym's owner or desk speaks for the gym.
  if new.from_gym and not coalesce(is_front_desk(), false) then
    new.from_gym := false;
  end if;
  return new;
end;
$$;
revoke execute on function trg_notification_from_gym() from public, anon, authenticated;
drop trigger if exists a_notification_from_gym on notifications;
create trigger a_notification_from_gym before insert on notifications
  for each row execute function trg_notification_from_gym();

-- 0029's guard, with the mark added to what only the sender owns.
create or replace function prevent_notification_tamper()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Admins keep a way in for support fixes; everyone else is limited to the
  -- state flags. Content, ownership and timestamps are the sender's.
  if get_my_role() = 'admin' then
    return new;
  end if;

  if new.user_id    is distinct from old.user_id
     or new.type    is distinct from old.type
     or new.title   is distinct from old.title
     or new.message is distinct from old.message
     or new.action_url is distinct from old.action_url
     or new.metadata   is distinct from old.metadata
     or new.created_at is distinct from old.created_at
     or new.from_gym   is distinct from old.from_gym then
    raise exception 'Only read/archived_at/cleared_at may be changed on a notification';
  end if;

  return new;
end;
$$;

-- The members' note (0212 shows it once, on Today).
insert into app_releases (app, title, items)
select 'member', 'A cleaner, simpler app', array[
  'Today is one timeline: what is happening now, today, and next.',
  'Train holds everything about training: your workout, classes and your coach.',
  'More has a search box — type a word to find any screen.',
  'Your inbox folds repeats and pins what your gym tells you.',
  'The assistant sits beside the bell; Settings can make it float instead.'
]
where not exists (select 1 from app_releases where app = 'member' and title = 'A cleaner, simpler app');

-- The probe (scripts/probe-migrations.py) asks with the anon key, as for every marker.
create or replace function migration_0215_applied() returns boolean language sql stable as $$ select true $$;
grant execute on function migration_0215_applied() to anon, authenticated;
