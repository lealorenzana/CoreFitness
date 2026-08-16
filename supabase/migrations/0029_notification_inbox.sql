-- 0029 — the notification bell becomes an inbox.
--
-- Until now a notification had exactly one piece of state (`read`) and exactly
-- one way to get rid of it: DELETE. So the X in the bell destroyed the record.
-- That is the wrong default for the thing that *is* the member's history —
-- a payment receipt or a booking approval swiped away in a hurry was gone.
--
-- Two new timestamps, because the two swipe gestures mean genuinely different
-- things and one column cannot express both:
--
--   `cleared_at`  — swipe LEFT, "get this out of my way". Leaves the bell,
--                   stays in the full list. Nothing is lost; the bell is a
--                   worktray, not the archive.
--
--   `archived_at` — swipe RIGHT, "I have dealt with this". Leaves the bell
--                   *and* the inbox list, and lands in Archived, the way mail
--                   archiving works everywhere else.
--
-- Deleting is still a real DELETE, but it now only happens from the full-list
-- screen behind an explicit multi-select — never from a one-finger gesture.
--
-- Timestamps rather than booleans, matching `frozen_at` / `paid_on` /
-- `achieved_on`: "when did this happen" is answerable later, "true" is not.

alter table notifications
  add column if not exists archived_at timestamptz,
  add column if not exists cleared_at  timestamptz;

-- The bell's query: this user's rows, neither cleared nor archived, newest
-- first. Partial so the index stays small — the bell reads a handful of rows
-- out of a table that only grows.
create index if not exists idx_notifications_bell
  on notifications (user_id, created_at desc)
  where archived_at is null and cleared_at is null;

-- The full list's query, which includes cleared rows.
create index if not exists idx_notifications_inbox
  on notifications (user_id, created_at desc);

-- ============================================================================
-- TAMPER GUARD
-- ============================================================================
--
-- `notifications_update_self` grants UPDATE on the whole row, which was fine
-- when `read` was the only thing worth changing. It also means a member can
-- rewrite the title and body of a notification the gym sent them — turning
-- "Payment received: ₱500" into whatever they like, in the record the front
-- desk and their trainer can also read.
--
-- Nobody has done it and nothing in the app offers it, but the screens below
-- are about to make updating notifications routine, so the columns a recipient
-- may change are pinned to the three that are theirs to decide. Same shape as
-- `prevent_member_profile_tamper` in 0002/0006.

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
     or new.created_at is distinct from old.created_at then
    raise exception 'Only read/archived_at/cleared_at may be changed on a notification';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prevent_notification_tamper on notifications;
create trigger trg_prevent_notification_tamper
  before update on notifications
  for each row execute function prevent_notification_tamper();

-- No new RLS policies are needed. `notifications_update_self` (0006) already
-- covers `user_id = auth.uid()` for UPDATE, and with no `with check` clause
-- PostgreSQL reuses the USING expression as the check — so a row cannot be
-- reassigned to somebody else either. `notifications_delete_self` (0003)
-- already covers the multi-select delete.
