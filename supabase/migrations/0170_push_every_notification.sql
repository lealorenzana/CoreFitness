-- ============================================================================
-- 0170 — Every notification reaches the phone
-- ============================================================================
--
-- The `notifications` row is the record; a web push is the alert (CLAUDE.md).
-- Only the two apps' notify.ts ever called the send-push Edge Function, and
-- most notifications are written by the database itself — bookings decided,
-- reminders, coach notes, chat, payments, streaks, renewals — so those were
-- recorded and never pushed: the bell filled up and the phone stayed silent.
--
-- Now a trigger on `notifications` asks send-push to deliver every new row
-- (pg_net, asynchronous: an insert never waits on the network, and a push that
-- fails can never fail the record). send-push reads the row itself — title,
-- message, link, recipient — so the request carries only its id, and
-- `pushed_at` is claimed atomically, so a row is pushed once, and only while
-- it is fresh (two minutes). The apps no longer push on their own.
--
-- The project URL and the publishable key below are public values — both apps
-- ship them in every bundle. send-push is deployed without the gateway's JWT
-- check (a publishable key is not a JWT) and decides for itself: this call
-- carries only a notification id, and the row — claimed once — says who gets what.
-- ============================================================================

create extension if not exists pg_net;

alter table notifications add column if not exists pushed_at timestamptz;

create or replace function trg_push_notification() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- A notification already archived or cleared at birth (an import) is not news.
  if new.archived_at is not null or new.cleared_at is not null then return new; end if;
  begin
    if to_regproc('net.http_post') is not null then
      perform net.http_post(
        url := 'https://ifwxtekyjgeljerslnzr.supabase.co/functions/v1/send-push',
        headers := jsonb_build_object('Content-Type', 'application/json',
                                      'apikey', 'sb_publishable_UvVt5N-d4PnQlruDuQ4JVA_0qpq4lug'),
        body := jsonb_build_object('notificationId', new.id));
    end if;
  exception when others then
    -- The alert is a courtesy; the record must never fail because of it.
    null;
  end;
  return new;
end;
$$;
drop trigger if exists push_notification on notifications;
create trigger push_notification after insert on notifications
  for each row execute function trg_push_notification();

-- send-push claims a row here before sending, so a row is pushed at most once.
create or replace function claim_notification_push(p_id uuid)
returns table (user_id uuid, type text, title text, message text, action_url text)
language sql security definer set search_path = public as $$
  update notifications n set pushed_at = now()
   where n.id = p_id and n.pushed_at is null and n.created_at > now() - interval '2 minutes'
  returning n.user_id, n.type, n.title, n.message, n.action_url;
$$;
revoke all on function claim_notification_push(uuid) from public, anon, authenticated;
grant execute on function claim_notification_push(uuid) to service_role;

create or replace function migration_0170_applied() returns boolean
language sql immutable as $marker$ select true $marker$;
revoke all on function migration_0170_applied() from public, anon;
grant execute on function migration_0170_applied() to authenticated;
comment on function migration_0170_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0170.sql
