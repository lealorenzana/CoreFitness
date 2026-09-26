# Content Studio — the gym's own exercises, videos and programs

**Date:** 2026-09-26 · **Status:** built — 0120 and 0121 live; 0122 built, pasted by hand. Plans: `docs/superpowers/plans/2026-09-26-content-studio-0121.md`, `-0122.md`
**Migrations:** 0120 (storage tenancy, prerequisite) · 0121 (exercise media) · 0122 (workouts and programs)

## Why

Every gym on the system reads the same generic workout library: links out to
Darebee and friends (0019/0075). A gym cannot show its own coach demonstrating
its own squat, and a member cannot follow the gym's own program. That is the
single most visible thing a gym owner expects to customise, and the one thing
the platform does not let them.

It is built first among the new features because the rest of the roadmap —
program-completion badges, PRs detected in the gym's workouts, monthly seasons
built around its programs — needs content that belongs to the gym.

## Decisions made in conversation

| Question | Decision |
|---|---|
| Video | **Links, not uploads.** YouTube and Vimeo play inside the app. Direct video upload is a later paid-plan feature and is **not** in this spec. |
| Photos | **Uploaded, counted per gym.** A platform plan carries `max_photos`; seeded **100** on every plan. Each photo is compressed on the device to about 200 KB, so 100 photos is about 20 MB per gym. |
| Who creates | **Owner and trainers.** A trainer's items carry their name; the owner can edit or hide anything; a trainer edits only their own. |
| Premium | **Per program.** A program can be Premium-only; a free member sees it locked with the reason (0049's rule: lock and explain, never hide). **Exercise how-tos are never locked** — seeing how to do a movement safely is not an upsell. |
| Release shape | Two releases, 0121 then 0122, so the first ships small and useful. |
| Empty studio | Every gym starts with **written cues and steps** on the standard exercises, may link **any public YouTube demo**, and gets a **starter program pack** to copy. |
| Facebook / TikTok | Not embedded — they often refuse to play inside an Android app. Out of scope for now. |
| Program building | On the admin website (owner). Trainers, in the phone app, add exercises and workouts and assign programs. |

## 0120 — storage tenancy (prerequisite, a security fix)

Found while designing this. The three storage buckets predate tenancy, and
0097–0105 never touched their policies. `get_my_role()` answers "your role in
*your current* gym", so a policy that only asks "are you an admin?" lets the
admin of **any** gym act on **every** gym's files:

| Bucket | Today | Leak |
|---|---|---|
| `credentials` (private) | `credentials_read_admin`: any admin reads all | One gym's owner reads another gym's trainers' certificates and IDs |
| `media` (public) | insert/update: any admin or staff; delete: any admin; paths `<kind>/<uuid>.jpg` | One gym's desk overwrites or deletes another gym's logo — its URL is public on `/join/<slug>` |
| `avatars` (public) | `avatars_delete_admin`: any admin | One gym's owner deletes anybody's profile photo |

The rule after 0120: **a file belongs to a gym because its path says so, and
only that gym's people may touch it.**

- `media`: new uploads go to `gyms/<gym_id>/<kind>/<uuid>.jpg`. Insert, update
  and delete need `(foldername(name))[2] = current_gym_id()`, the right role
  there, and `gym_writable()` (0113). Legacy paths without a gym folder stay
  **readable** (every existing logo keeps working) and become **untouchable**
  by gym staff — replacing a logo uploads a new file, and the old one is left
  as an orphan rather than deletable by the wrong gym.
- `credentials`: an admin reads a trainer's folder only when that trainer
  holds a role in the admin's current gym.
- `avatars`: an admin deletes a photo only of somebody in their current gym.
- The `trainer_credentials` **table** policies using bare `get_my_role()` get
  the same gym condition.

Proof: new `scripts/sql/storage-tenancy.mjs`, two gyms, as the real
`authenticated` role; each leak above is asserted as zero rows, and each
legitimate action (own gym, own folder) as allowed. Admin `lib/api/media.ts`
writes the new path.

## 0121 — exercise media

- `exercises` gains: `photo_url`, `video_url`, `cues text[]` (short lines),
  `steps text[]` (numbered), `created_by`, `published boolean default true`
  (existing exercises stay visible), `hidden boolean default false`.
- `video_url` is checked in SQL: https, host youtube.com / youtu.be / m.youtube.com
  / vimeo.com / player.vimeo.com. Anything else is refused.
- `gym_photos` (id, gym_id, path, kind, created_by, created_at): one row per
  uploaded photo. A `before insert` trigger refuses the row when the gym is at
  its plan's `max_photos` (the 0108 pattern: a limit is a trigger, not a label).
  The storage insert policy for `gyms/<gym>/content/` requires a matching
  `gym_photos` row, so the count cannot be bypassed by uploading directly.
  Deleting the row (and the file) frees the slot.
- `platform_plans.max_photos int default 100`; platform app shows it beside
  members and staff.
- Starter text: cues and steps for the 36 seeded exercises, written once,
  applied only where a gym's exercise has none (never overwrites).
- Screens:
  - **Admin → Training → Content → Exercises**: photo, video link with live
    preview, cues, steps, publish/hide, counter "42 of 100 photos".
  - **Trainer app**: add/edit own exercises.
  - **Member app**: exercise page (photo, embedded video, cues, steps) from the
    library, and a **How to** button in the guided workout player and tracker.
- Trainer can edit only rows with `created_by = auth.uid()`; the owner any row
  in the gym; members read published, non-hidden rows only.

## 0122 — workouts and programs

- `gym_workouts` (name, notes, level, created_by, published, hidden) and
  `gym_workout_items` (exercise, position, target sets, reps or seconds, rest).
- `gym_programs` (name, description, cover photo, level, weeks, `premium boolean`,
  created_by, published, hidden) and `gym_program_days` (week, day, workout).
- `program_enrolments` (member, program, started_at, status). A day is ticked
  when a `workout_logs` row carries `program_day_id` — 0050's rule: **extend
  `workout_logs`, never a second table** — so the run earns points, counts for
  badges and appears in history with no new code in those places.
- Premium: a `premium` program's days and workouts are readable only when
  `plan_allows('premium_programs')` — the function RLS and the screen share. The
  program row itself stays readable so the lock can explain itself.
- Starter pack: "3-Day Beginner Full Body" and "Push / Pull / Legs", built from
  the seeded exercises, **copied** into a gym on one tap (a copy, so editing it
  never changes another gym's).
- Screens: admin **Workouts** and **Programs** tabs (week × day grid);
  trainer **Assign to a trainee** (notifies through `notify_once`, only for
  their own trainees — 0082); member **Train** lists the gym's programs first,
  a program page with week/day ticks and **Start**, which opens the existing
  full-screen player (`/member/track/session/*`).

## Rules that apply to all three

- Everything is filtered to the gym by RLS and joins the tenancy harness: gym A
  cannot read, write or count gym B's content, photos or enrolments.
- Drafts are invisible to members. Hidden is invisible to members and trainers.
- `activity_log` records publish/hide by definer triggers (0037).
- Admin and trainer see what members follow (CLAUDE.md: a member feature is not
  done until admin and trainer can see it): the member drawer and the trainer's
  member sheet show the active program and progress.

## Testing

- SQL (pglite, `authenticated`): storage-tenancy.mjs (0120); tenancy additions,
  photo limit (the 101st refused), video host check, trainer-edits-own-only,
  draft invisibility, premium lock returning the program but not its days.
- Fixtures: admin Content editor sends the right writes and shows the counter;
  member exercise page renders video and cues; How to opens from the player;
  program page ticks a day after a run.
- `verify0120/0121/0122.sql` with go/no-go lines; `probe-migrations.py` entries.

## Out of scope

Direct video upload (future paid feature), Facebook/TikTok embeds, trainers
building programs on the phone, sharing content between gyms, AI-generated
programs.
