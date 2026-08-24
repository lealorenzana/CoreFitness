-- 0044 — bulking, cutting, or holding.
--
-- The body map has refused to say whether a change is good since the day it was
-- written, and the comment explaining why has survived three rewrites:
--
--     Colour encodes magnitude, never approval. Whether +2 cm on the arms is
--     progress depends entirely on what the member is training for, and this
--     component cannot know.
--
-- This is the column that lets it know. A member who says they are cutting has
-- told the app that a waist going *down* is the point; one who is bulking has
-- told it that arms going *up* is. Without that, "down 5 cm" is a fact with no
-- meaning attached, and the app was right not to guess.
--
-- ## Why a column on the member and not a `fitness_goals` row
--
-- `fitness_goals` (0020) stores a target: a number to reach by a date, with
-- `achieved_on` set once it is hit. A bulk or a cut is not a target — it is the
-- *phase you are currently in*, it has no finish line, and a member switches
-- between them repeatedly. Modelling it as a goal would mean a goal that can
-- never be achieved and never completes.
--
-- ## Why text and not an enum
--
-- Matches `experience_level` and `gender`, which are both text on this table. A
-- CHECK gives the same safety without an enum's migration cost when the gym
-- eventually wants a fourth option ("recomp" is the obvious one).
--
-- ## Known limitation, stated rather than hidden
--
-- Only the *current* phase is stored, not a history of phases. The app reads it
-- to interpret "since your last reading", which is recent enough that the
-- current phase is almost always the right lens. A member who bulked for three
-- months and then switched to cutting will see their older gains described in
-- cutting language if they look back. Storing the phase per measurement row
-- would fix that; it is not worth the column until someone actually asks.

alter table member_profiles
  add column if not exists training_focus text;

alter table member_profiles drop constraint if exists member_profiles_training_focus_valid;
alter table member_profiles
  add constraint member_profiles_training_focus_valid
    check (training_focus is null
           or training_focus in ('bulking', 'cutting', 'maintaining'))
    not valid;

comment on column member_profiles.training_focus is
  'What the member is currently training for: bulking | cutting | maintaining. '
  'NULL = not stated, which the app treats as "make no claim about direction" '
  'rather than defaulting to maintaining - a member who never answered has not '
  'told us they are holding steady.';

-- No policy work. `member_profiles` already carries a self-update policy and a
-- trainer/staff select policy, both written without a column list, so they cover
-- columns added afterwards. The trainer visibility is deliberate: a coach who
-- knows a member is cutting reads their measurements completely differently.
