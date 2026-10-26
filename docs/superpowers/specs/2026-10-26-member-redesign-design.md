# Member app redesign — design (2026-10-26)

Approved by the owner on 2026-10-26 from the mockups in
[`2026-10-26-member-redesign/`](2026-10-26-member-redesign/):
`mock-today-train-more.png` (the target look — "i love this"),
`mock-you-inbox-settings-checkin.png`, and `mock-shared-rules.png` (the row and
header rules; its option A/B/C assistant panels were superseded by the setting
below). The `.html` beside each image is the mockup source — its sizes, colours
and spacing are the reference, as with every approved mock-up here.

## Intent

The member app is full of features and hard to move around in: features live in
too many places, the good ones hide in More, and the screens feel flat. The owner
wants it **clean, easy and lively without removing a single feature, function or
rule** — a redesign of how things are arranged and drawn, not of what the app
does.

Members open the app for three things (owner's answer): **check in at the door,
do today's workout, check membership and points.** Coach messages and the odd
class booking come next (my addition, accepted). Those must be one tap from
wherever the member is.

## Goals

- Every screen follows the same shared rules (below), so the app reads as one thing.
- Today answers "what now?" in one timeline; Train holds all training; You holds
  the membership; More finds everything else, by search or by a described row.
- Nothing covers content (the floating assistant did, on three screens).
- One name for one thing everywhere (points, inbox).

## Non-goals

- No feature, route, screen, rule or data removed. Every destination in
  `memberNav.ts` `EVERYTHING` keeps a route and a way in (map below).
- No change to booking, check-in, points, gating or any SQL rule.
- The trainer app (TrainerHub, Discord style) is out of scope.
- The admin and platform apps are out of scope, except where a member feature's
  wording must match.

## Anti-goals (a failure even if it works)

- Changing the look the owner chose: the dark Nocturne palette, Inter, violet =
  where you are, amber = what to do next, and **the tab bar exactly as it is**
  (Today · Train · You · More │ Check-in block). The owner said so twice.
- Hiding a feature to make a screen shorter. Shorter comes from moving things to
  their own page, never from dropping them.
- A third layer of navigation on any page.

## Shared rules (every screen)

1. **Header.** A tab root shows: eyebrow, big two-line title (`.screen-title`),
   and at most three icon buttons on the right — the assistant (when set to
   Header, see below), the bell, settings. A pushed page shows Back + title +
   one line + up to two icon buttons. Never chips under a header.
2. **One row of navigation per page, at most.** Tabs (`TextTabs`) or nothing.
   The chip rows on Train ("Workouts · Progress · Coaching · …") and You
   ("Renew · Payments · Attendance · …") go; each of those destinations has a
   home in the map below.
3. **Rows** (`LineRow`, extended): a 38px icon tile that says what kind of thing
   it is — violet tile = yours / state, amber tile = something to act on, grey
   tile = information — then title, one line, and on the right either one amber
   action word (only when there is something to do), a time, or a chevron.
4. **Repeats fold.** Several of the same automatic item in a period become one row
   ("Checked in ×4", "5 badges unlocked"), opening to show each.
5. **Timelines group by time**: Now, Today, a date, Later (Today) and Today,
   This week, Earlier (Inbox).
6. **Lively, not loud**: colour lives in icon tiles, the one hero card per screen
   (violet glow), and the amber action. No new colours (no reds/greens — errors
   stay amber), type floor 12px.
7. **Nothing floats over content.** Every page leaves room under its last row for
   anything floating.

## The assistant button — a member setting

The owner's call: the member chooses. Settings → **Assistant button: Header |
Floating**, default **Header**.

- Header: a violet sparkle icon button beside the bell on Today, Train and You.
- Floating: today's bubble, but pages keep clearance below their last row and it
  shrinks while scrolling, so it never sits on a button.
- The choice is per member, so it is stored on the account (CLAUDE.md: per-user
  state never lives only in `localStorage`): a new column, written by the member
  for themself — migration **0213**, with the usual marker, verify file, probe
  entry, harness and CI line. It stays a paid-feature button exactly as now
  (0059): locked state shows the lock mark in either position.

## Screens

### Today (`/member/home`) — `mock-today-train-more.png`, left
- Header unchanged (avatar, greeting, name, bell, settings, date title).
- **One strip** replaces the month card, the week strip and the streak card:
  plan chip + days left, points, and the seven day marks (done / today /
  planned). The streak line ("2 more training days start a streak") becomes the
  strip's one line; tapping the strip opens the full progress/calendar page those
  three cards open today. Nothing they count is lost — each figure keeps a home
  on that page.
- **Timeline**: Now (check-in state — "Checked in at 10:33 PM, +10" or "You're
  not checked in" + Show my code), Today (today's workout as a card with Start
  workout; booked classes and sessions), dated items (events, 1-on-1s, pending
  approvals), Later (renewal due, legal updates to read, "nothing booked" + Book).
- Moved off the page, not removed: Inbox chip (= the bell), Log a reading (→
  Train / Progress), the bottom "Start a workout" (it duplicated the card),
  PushPrompt and TermsUpdateStrip become rows under Later, GymGoalStrip /
  TodayExtras / FinishPlanCard / ProgramNext / DueStrip each become a timeline row
  where they have a time, or a Later row. **WhatsNew (0212) stays as is.**
- Fix: the Now row and the bar's check-in block must read the same fact — today
  the timeline said "Not checked in yet" while the bar said "Checked in".

### Train (`/member/book-class` stays its path) — mock left-centre
- Eyebrow "Train", title "Your training", tabs **Workout · Classes · Coach**.
  **Train opens on Workout** (owner, 2026-10-26); the tab is in the URL
  (`?tab=classes|coach`) so notification links and Back land on the right one.
- Workout: today's workout hero (program + week, progress bar, Continue/Start),
  its exercise list, then rows: This week (plan your week), Routines, Programs,
  Free workouts, Equipment, Progress.
- Classes: today's group classes and events — the current week grid and list,
  "For my level", level change; the grid gets a clearer legend that does not wrap.
- Coach: 1-on-1 booking, my bookings, coaches, rooms.

### You (`/member/membership`) — `mock-you-inbox-settings-checkin.png`, 1st
- Header with assistant/bell/settings; profile row; membership hero (plan, days
  left, end date, progress, Renew or change plan); this term's four numbers;
  points card using **the gym's points name** (`pointsName`) with Spend.
- Then rows that open their own pages: Activity (the full filtered list),
  Payments, Attendance, What <plan> includes, Waiver, Pause or cancel, Invite a
  friend, Account. The chip row goes.

### Inbox (`/member/notifications`) — 2nd
- Back, title, unread count, header buttons Read all and Archived.
- One tab row: **All · Unread · From the gym** (today it is two rows: For you /
  From the gym, then Inbox / Unread / Archived). Archived moves to the header
  button; From the gym is the old `/member/events` "from the gym" view.
- Gym messages (announcements, closures) **pin** at the top. Groups Today / This
  week / Earlier. Repeats fold. Icon tile per kind. Actions where a notification
  has one (Start, Spend). Select, swipe and the pager keep working.
- The bell's popup sheet keeps its job and gets the same row look.

### More (the Everything sheet) — mock right
- Search box at the top (finds any destination by name and words), four tiles
  (Book, Progress, Rewards, Payments), then every destination grouped, each with
  an icon and a one-line purpose. Inbox appears once. Gym-switched-off parts stay
  hidden as now (`visibleDestinations`). Back closes it (fixed 2026-10-26).

### Settings (`/member/settings`) — 3rd
- One short list, each row showing its current state and opening its own page
  with **the same switches and copy as today**: Notifications, What your coaches
  see, AI coach, **Assistant button (Header | Floating, inline)**, Sign-in,
  Language, Your data, Account, Help and legal, the gym (hours, call, email —
  from `gym_settings`, never typed), Log out.

### Check-in sheet — 4th
- Same parts as today: title, the code large on white, typed code, plan and
  valid-to, "read the code out if the camera fails", What are you doing today,
  Make this my usual, "The desk can still change it". Bottom sheet; Back closes.

## Destination map (nothing lost)

| Destination (today) | New home |
|---|---|
| Today | Today tab |
| Inbox — for you / from the gym | Bell → Inbox (All / From the gym tab); More, once |
| Ask the assistant | Header sparkle or floating bubble (setting); More |
| Book a session, My bookings, Coaches, Rooms | Train → Classes / Coach; More |
| Plan your week, Routines, Programs, Free workouts, Equipment | Train → Workout rows; More |
| Overview, Body, Targets, Progress photos, Achievements | Today strip → progress page; Train → Workout → Progress; More |
| Challenges, Season, Team | More (Challenges group); Today timeline when one is running |
| Membership, Renew, Pause or cancel, Waiver, Payments, Attendance, Spend points, Shop, Invite a friend | You (hero + rows); More |
| Profile, Settings, Gyms, Change password, Change email | You header / Settings → Account; More |

## Constraints

- Build from `components/ui/noc.tsx`; extend `LineRow` for the icon tile rather
  than a new row component. Motion is CSS (`noc-*`), never framer `initial`.
- Overlays portal into `#phone-overlay-root` with the always-mounted wrapper
  owning pointer-events (CLAUDE.md).
- `t()` on every new string; tab paths and `TAB_PATHS` stay one row per tab.
- A feature is not done until admin/trainer are not contradicted (the points
  name in notifications is the known case: 0102's reward reminder writes "CORE
  Points" into the message — 0213 makes it use the gym's `points_name`; resolve
  the function to its last definition before redefining it).
- Every screen ships with a fixture check that asserts its parts exist and that
  no page scrolls sideways; existing member checks stay green.

## Build order (step by step, owner's request)

0213 + shared pieces (row tile, header, assistant setting) → Today → Train → You
→ Inbox → More → Settings → Check-in sheet. Each step: build, check against its
mockup, screenshots, deploy, then the next.

## Calls made in the write-up (check these)

- Tapping Today's strip opens the progress overview (`/member/progress`), which
  already holds the month, week and streak figures.
- Floating assistant: shrinks to a 40px dot while the page scrolls, full size at rest.
- Inbox "From the gym" reuses the existing gym-messages view (`/member/events`)
  inside the tab, not a new list.

## Left to the builder

- Exact grouping of Today's extra cards into timeline rows, keeping every one.
- The column name and table for the assistant setting, and whether it is written
  through an existing profile-update path or a small definer function.
- Icons per notification kind and per destination (Phosphor, as the app uses).
- Search matching in More (word starts, as admin's search does).
