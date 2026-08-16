-- 0022 — Web push subscriptions + notification preferences
--
-- Replaces the five Settings switches that wrote a flag to localStorage nobody
-- read. Everything here is actually consulted: `push_subscriptions` is what the
-- send-push Edge Function iterates, and `notification_prefs` is what it checks
-- before sending.
--
-- Deliberately NOT here:
--   • SMS — every Philippine gateway charges per message. There is no free tier
--     to build against, so the app does not offer the channel at all.
--   • Email — needs an external provider and an API key; out of scope for now.
--
-- In-app notifications are never gated by these preferences. The bell is a
-- record of what happened to your membership; silencing a *channel* must not
-- erase the log. Preferences control push delivery and the in-app sound only.

-- ── Push subscriptions ───────────────────────────────────────────────────────
-- One row per browser/install, not per member: the same person may have the app
-- on a phone and a laptop, and revoking one must not silence the other. The
-- endpoint is unique because that is what the push service keys on.
create table if not exists push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists idx_push_subscriptions_user on push_subscriptions(user_id);

alter table push_subscriptions enable row level security;

-- A member manages only their own subscriptions. Nobody reads anyone else's:
-- the sender runs as service role, which bypasses RLS.
drop policy if exists push_subs_select_own on push_subscriptions;
create policy push_subs_select_own on push_subscriptions
  for select using (user_id = auth.uid());

drop policy if exists push_subs_insert_own on push_subscriptions;
create policy push_subs_insert_own on push_subscriptions
  for insert with check (user_id = auth.uid());

drop policy if exists push_subs_update_own on push_subscriptions;
create policy push_subs_update_own on push_subscriptions
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists push_subs_delete_own on push_subscriptions;
create policy push_subs_delete_own on push_subscriptions
  for delete using (user_id = auth.uid());

-- ── Notification preferences ─────────────────────────────────────────────────
-- Defaults are all true: a member who never opens Settings still hears about a
-- booking being approved. Turning a category off is an explicit choice.
create table if not exists notification_prefs (
  user_id        uuid primary key references profiles(id) on delete cascade,
  sound_enabled  boolean not null default true,
  -- Categories map to `notifications.type`. Anything not listed always sends.
  cat_booking    boolean not null default true,
  cat_payment    boolean not null default true,
  cat_membership boolean not null default true,
  cat_event      boolean not null default true,
  updated_at     timestamptz not null default now()
);

alter table notification_prefs enable row level security;

drop policy if exists notif_prefs_select_own on notification_prefs;
create policy notif_prefs_select_own on notification_prefs
  for select using (user_id = auth.uid());

drop policy if exists notif_prefs_upsert_own on notification_prefs;
create policy notif_prefs_upsert_own on notification_prefs
  for insert with check (user_id = auth.uid());

drop policy if exists notif_prefs_update_own on notification_prefs;
create policy notif_prefs_update_own on notification_prefs
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Keeping `updated_at` honest, so a stale preference is visible as stale.
create or replace function touch_notification_prefs() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_touch_notification_prefs on notification_prefs;
create trigger trg_touch_notification_prefs
  before update on notification_prefs
  for each row execute function touch_notification_prefs();
