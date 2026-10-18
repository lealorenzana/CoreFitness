# Fresh start (2026-10-12)

Deletes every gym and every account except the platform admins, then turns
Gym #1 into **Core Fitness Lab** — the platform owner's private test gym, filled
with data, with four sign-ins.

Proven end to end on a production-shaped database by `scripts/sql/fresh-start.mjs`
(27 checks: the wipe, its refusal with no platform admin, re-runs, the logins,
every role landing in the lab, the member's two-year history, wiping the lab again).

## Before you start

1. **Paste migration 0198 first** (`supabase/migrations/0198_trial_stops.sql`, then
   `scripts/sql/verify/verify0198.sql`). It makes the trial 7 days with no grace and
   hides Gym #1 from Find your gym.
2. **Take the backup** — `docs/BACKUPS.md`. Part 1 cannot be undone.
3. **Empty Storage** — Supabase → Storage → each bucket (avatars, media, progress, support,
   applications, credentials) → select all → delete. SQL cannot delete files, and
   an account whose upload still points at it cannot be deleted.

## Run, one file at a time, in the SQL Editor

| File | What it does |
|---|---|
| `1-wipe.sql` | One transaction. Refuses if there is no platform admin. Anything it cannot delete undoes the whole run. Ends with a one-row count. |
| `2-test-gym.sql` | Renames Gym #1, prices its plans, makes the 4 sign-ins, 3 more coaches, 40 members, 2 months of check-ins and payments, a timetable, 1-on-1, events, challenges, rewards, a program, equipment, walk-ins. **The result table shows the four passwords once — copy them.** Run it again for new passwords. |
| `3-member-history.sql` | The member sign-in's two years: terms, receipts, visits, weigh-ins, goals, routines, workouts, points, badges. |
| `4-member-coaching.sql` | Their coaching with the test coach: sessions + notes, rating, room, chat, classes, a program. |
| `5-gym-life.sql` | The shop (3 months of sales), seasons, a squad, challenges, events, rewards, streaks, an inbox. |

## The sign-ins (every +alias arrives in mf.jgabrielle@gmail.com)

| Who | Email | Where |
|---|---|---|
| Owner | mf.jgabrielle+owner@gmail.com | admin app |
| Front desk | mf.jgabrielle+desk@gmail.com | admin app |
| Coach | mf.jgabrielle+coach@gmail.com | member app → Trainer |
| Member | mf.jgabrielle+member@gmail.com | member app |

The super admin is untouched and signs into the platform app as before.

## Afterwards

- The made-up people and rows carry demo ids (`5eed…`); the platform's **Remove demo
  data** takes them out and leaves the four sign-ins (`cf1ab000…`).
- G Fitness starts like any new gym: it applies on the website, you approve it, and
  its trial is 7 days. To give it a different end date: platform → the gym → Billing
  → Change the date. The day after the end the whole app stops for its owner, desk,
  coaches and members until it pays (PayMongo or a verified reference).
- Rules you change in the lab (points, badges, refund tiers…) become the defaults
  new gyms copy.
