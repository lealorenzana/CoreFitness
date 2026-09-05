-- 0067_gym_branding.sql
--
-- The gym's own name and logo, so the admin panel is not hardcoded to one gym.
--
-- `gym_settings.gym_name` has existed since 0013 and the sidebar ignored it:
-- "CORE FITNESS" and the logo file were literals in `Sidebar.tsx`, and the
-- header's title was a second literal that could disagree with it. A gym that
-- renamed itself in Settings watched nothing happen.
--
-- Three columns, all optional, all with the current hardcoded values as their
-- effective default so nothing changes until somebody edits it:
--
--   * `logo_url`   — a picture, uploaded to the `media` bucket from 0065.
--                    NULL falls back to the bundled `/core-fitness-logo.png`,
--                    which is what every install has today.
--   * `short_name` — what the collapsed sidebar and the browser tab show when
--                    the full name is too long. NULL means "derive it", not
--                    "show nothing".
--   * `tagline`    — the line under the name. NULL hides the line rather than
--                    printing an empty one.
--
-- The location line under the header title is `address`, which 0013 already
-- has and the header was also hardcoding.

alter table gym_settings add column if not exists logo_url   text;
alter table gym_settings add column if not exists short_name text;
alter table gym_settings add column if not exists tagline    text;

comment on column gym_settings.logo_url is
  'Optional logo, usually a media-bucket URL (0065). NULL renders the bundled '
  'default image - never a blank space, and never a stand-in from elsewhere.';
comment on column gym_settings.short_name is
  'Shown where the full name will not fit. NULL means derive from gym_name.';
comment on column gym_settings.tagline is
  'The small line under the name, e.g. "ADMIN PANEL". NULL hides the line.';

-- No policy changes. 0013's `gym_settings_update_admin` has no column list, so
-- it already covers columns added after it — the same reason 0041 needed none
-- for `trainer_profiles`. Noted so nobody goes hunting for one.

-- ── Verification ────────────────────────────────────────────────────────────
-- select gym_name, short_name, tagline, logo_url from gym_settings;
-- Expect: one row; the three new columns NULL until an admin sets them.
