-- 0033 — "have I finished onboarding?" becomes a fact about the member, not
-- about the browser they happened to use.
--
-- The gate was `localStorage.getItem('onboarding_complete') === 'true'`, read
-- in Login.tsx. localStorage is per-origin **per browser profile**, so the flag
-- lived on exactly one device:
--
--   * Sign in on a second phone → the whole onboarding again.
--   * Sign in on a desktop, or a different browser profile → again.
--   * Clear site data, or use a private window → again.
--   * Reinstall the PWA → again.
--
-- The member had "already gone through onboarding a few days ago" and the app
-- had no way to know, because nothing about it was ever sent to the server.
-- Same failure as the achievement celebrations replaying: per-user state kept
-- on the client.
--
-- A timestamp rather than a boolean, matching `paid_on` / `achieved_on` /
-- `frozen_at`: "when did they finish" is answerable later, "true" is not.

alter table member_profiles
  add column if not exists onboarding_completed_at timestamptz;

-- No policy or trigger work needed. `member_profiles_update_self` (0006)
-- already lets a member write their own row, and `prevent_member_profile_tamper`
-- only guards `qr_code` — it names the columns it protects rather than
-- allow-listing the ones it doesn't, so a new column is writable by its owner
-- without touching the trigger. Confirmed against 0016's rewrite, which left
-- `qr_code` as the sole admin-only field.

comment on column member_profiles.onboarding_completed_at is
  'When the member finished (or skipped) onboarding. NULL = not yet. Replaces the localStorage flag, which only ever existed on one device.';
