# Simplify the apps — one way to do each thing (2026-10-28)

## Why

The owner, after wave 1 of the lively coach app: *"class, bookings, rooms, 1-on-1, groups — it's just too much."*
The apps grew one feature at a time, and the same idea now has several names and several screens:

- **"1-on-1" meant two things**: a single session (`pt_sessions`) and a monthly package (`coachings`).
- **Class, coaching group, room and squad** all looked like "a group".
- **"Booking" is not a thing** — it is a reservation of a class place or a session — yet it had its own page.
- **Rooms and Messages** both carried a coach's 1-on-1 conversation.
- Members had **five places for "what do I do today"** (Today's workout, Routines, Programs, Free workouts, Plan your week),
  **three places for results** (Progress, Season records, You's trophy room), and **eight game systems**
  (points, spend points, challenges, season, team, friends, badges, streak).
- **Names collide**: "Coach" (a person) beside "Ask the assistant" whose model is called the AI coach; two "levels".

**Success:** a member or coach opening any screen can say what it is for in one sentence, and no two screens answer the same question.

## What the real gym does (owner's answer)

Personal training only: **single 1-on-1 sessions** and **monthly coaching packages**. No group classes, no small coach-led groups.
Core Fitness is multi-tenant, so features other gyms might use are **switched off by default**, not removed.

## Decisions (the owner's)

### Personal training
- One idea, two ways to buy it: **single sessions** and **monthly packages**. Members see it as **Coach**;
  the admin and coach apps call it **Personal training**.
- All three ways to start a package stay: member asks, coach offers, desk assigns.
- Chat stays for anyone a coach trains (session or package).
- **A package's room and its chat are one place**: it opens on the chat, with Classwork and Progress beside it.
- **Rooms exist only for packages.**

### Removed — permanently
- **Coaching groups** (join-code groups) and **group packages** (`coachings.kind = 'group'`).
- **Rooms of single-session trainees** (no package), with their posts and classwork.
- **Class rooms**, with their posts and classwork (owner confirmed 2026-10-28): rooms are package-only, so a gym that
  turns Classes back on gets classes without rooms.
- **Friends, completely** (owner, 2026-10-28) — 0217's friendships and cheers, the friend code, the findable and
  share-wins settings, the Friends pages, Today's strip, the coach's view of cheers, the owner's switch and count, and
  Privacy §2's clause. Deleted with their data.
- This is a **hard delete in the migration**, the owner's explicit choice over "hide". The migration header and the
  paste instructions say so in plain words before anything is pasted.

### Off for every gym now; the owner can switch each back on (Your app)
- **Classes** — every class screen disappears in all three apps while off.
- **Squads (Team)**, **Gym events**, **Season**.

### The member app — three tabs, one job each
- **Today** — check in, today's workout, your next session, your streak. Notices stay: membership warnings (ending, frozen,
  gym paused), the Terms notice, What's new, the daily arrival and moments, the points chip. Today's challenge moves to Rewards.
- **Train** — **Workout · Coach** (· Classes, between them, only if the gym turns Classes on).
  - **Workout**: *Your plan* (your week and today's workout; the routine or program you follow lives here) and
    *Library* (free workouts and programs you can start). Routines, Programs and Plan your week stop being separate places.
  - **Coach**: book a session, your package (chat · Classwork · Progress), your sessions (coming and past). The Rooms
    page and My bookings page fold in here.
- **You** — the trophy room (earned level, badges, records), **Progress** (body, targets, photos — one place, moved
  from the separate Progress hub), **Membership** (plan, renew, payments, attendance, pause or cancel, waiver).
- **Rewards** — points, challenges and spending them, one place. Season is off by default.
- **Names**: the AI is **"Assistant"** everywhere, never "coach". **"Level" means only the earned level**; the
  self-declared one becomes a setting, *How much do you train?*, never called a level.
- **More** — ten entries: Inbox, Rewards, Assistant, Shop, Equipment, Invite, Gyms, Profile, Settings (with password and
  email inside), Help.
- **Chat** stays for single sessions too: a session row opens the chat with that coach.

### The coach app — the Discord design stays (owner, 2026-10-28)
The owner keeps today's look: the rail on the left, the panel beside it, the coach at the bottom (photo, name, status,
check-in QR, bell) and the You sheet. **No bottom tabs.** Only what the rail holds changes:
- **Today** (rail, first) — what needs you (session requests, package asks and payments), your day, find a trainee (wave 1).
- **Personal training** (rail, second; was "Messages") — everyone you train, Discord-DM style: photo with status dot, last
  message, unread count; sections "On a package" and "Single sessions"; search. A single-session trainee opens the chat
  and their sheet.
- **One round icon per package trainee** (their photo, unread count on it), like a Discord server — opens their place:
  Chat · Classwork · Progress · About. Class and group icons are gone.
- **+ Start coaching someone** at the bottom of the rail (only where the gym lets coaches offer packages); "New group" is gone.
- **The You sheet** keeps its four tiles: **Schedule** (this week's sessions, and Classes when the gym runs them),
  **Hours** (opens Schedule's hours tab — no separate page), **Packages** (was Coaching: Needs you · Training · Ended ·
  Payments), **Library**; then Profile, Achievements, Equipment, Gyms, Settings.
- The **Bookings page is removed** (requests are decided on Today; confirmed sessions are in Schedule).
- Wave 2's finished pieces carry over: Packages' tabs, the room's Progress marks with words, the trainee sheet's tabs,
  one toast at a time, one-line headers.

### The admin app
- One **Personal training** page: what to decide, sessions, packages. The Trainers page stays where it is.
- Every other admin page stays as it is.
- Class pages (Schedule, class bookings) hide when Classes is off.

## Constraints
- **A redesign never drops a feature** except the two removals above: everything else is merged or switched off.
- Every switch already exists as a gym module (`moduleOn`) or is added the same way; **RLS is the boundary** — a module
  that is off refuses in SQL, not only in the UI, where it already does so today.
- Members are archived, never deleted — the hard delete covers **only** groups and single-session rooms' content.
- Legal pages change in the same commit when a rule changes (Privacy mentions rooms, squads, friends).
- Old routes and notification `action_url`s keep working: they redirect to the new home of each screen.
- Each migration ships with its marker, verify file, probe entry, CI suite and harness.

## Order (owner's choice: mock-ups first, then in parts)
1. Mock-ups: member app, coach app, admin Personal training — approved before any building.
2. Build in parts: (a) the migration (switches off, removals, package-only rooms); (b) coach app; (c) member app;
   (d) admin; each verified, pushed and deployed.

## Calls I made (the owner can overrule)
- **Class rooms** go with Classes: rooms are package-only, so a gym that turns Classes back on gets classes without
  rooms. Their content is deleted with the groups'. *(To confirm with the owner.)*
- Weekly quests, if a gym runs them, go inside Rewards with challenges.
