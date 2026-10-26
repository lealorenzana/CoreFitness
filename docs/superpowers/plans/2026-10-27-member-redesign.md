# Member App Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the member app's seven main screens to the approved mockups without removing any feature, route or rule.

**Architecture:** Shared pieces first — an icon tile on `LineRow`, a tab header without the chip rail, and the member's assistant-button setting (column from migration 0213) — then one screen per task, each rearranging existing sections and data into the mocked layout. No service or SQL rule changes except 0213.

**Tech Stack:** React 19, Router v7, Tailwind v4 (no config), Phosphor icons, Supabase; Playwright fixture checks (`scripts/ci/run-ui-checks.mjs`), pglite SQL harness (`scripts/sql/*.mjs`).

**Spec:** `docs/superpowers/specs/2026-10-26-member-redesign-design.md` (mockups in `docs/superpowers/specs/2026-10-26-member-redesign/`)

## Global Constraints

- Keep the tab bar exactly as it is: Today · Train · You · More │ Check-in block (`TabBar.tsx` untouched except as already shipped).
- Nocturne palette and Inter; violet = where you are / yours, amber = what to do next; no reds or greens; type floor 12px.
- No feature, route, rule or data removed; every `EVERYTHING` destination keeps a route and a way in.
- At most one row of navigation per page; never chips above tabs.
- Rows: 38px icon tile (`mine` violet, `act` amber, `info` grey), title, one line, then one amber action word only when there is something to do.
- Nothing floats over content.
- Build from `components/ui/noc.tsx`; motion is CSS `noc-*`; overlays portal into `#phone-overlay-root` with the always-mounted wrapper owning pointer-events.
- Every new string through `t()`; `TAB_PATHS` stays one row per tab.
- Per-member state lives on the account (column), never only in `localStorage`; per-member caches are cleared in `lib/memberCaches.ts`.
- Migrations are pasted by the owner one at a time; each ships a `migration_02xx_applied()` marker, `scripts/sql/verify/verify02xx.sql`, a probe entry in `scripts/probe-migrations.py`, a harness in `scripts/sql/`, and a line in `.github/workflows/ci.yml`'s suite list.
- After each screen: `npm run build`, its fixture check plus every `member` check green, commit, push, `npx vercel deploy --prod --yes` (member), `"readyState": "READY"`.

## Review Focus

- **Before 0213 is pasted**, reading `assistant_button` errors: the app must behave as Header (the default) and the setting must say it could not be saved, never crash. → Task 2 check.
- **A member whose plan lacks the assistant (`ai_model`) or a gym that switched it off**: neither the header sparkle nor the bubble shows, in either placement. → Task 2 check.
- **An empty day** (nothing booked, no plan, not checked in): Today's timeline still reads honestly — Now + "Nothing booked · Book", no empty groups. → Task 3 check.
- **Notification links** to `/member/book-class`, `/member/bookings`, `/member/book` and `?tab=` must land on the right Train tab, and Back must return. → Task 4 check.
- **Many notifications of one kind** (20 check-ins in a week) fold into one row that opens; the pager and select still count real items. → Task 6 check.

---

### Task 1: Migration 0213 — assistant placement and the gym's points name in reward reminders

**Files:**
- Create: `supabase/migrations/0213_assistant_button_points_name.sql`, `scripts/sql/verify/verify0213.sql`, `scripts/sql/assistant-button.mjs`
- Modify: `scripts/probe-migrations.py` (entry after 0212), `.github/workflows/ci.yml` (append `assistant-button` to the suite list)

**Interfaces:**
- Produces: column `member_profiles.assistant_button text not null default 'header' check (assistant_button in ('header','floating'))`; `migration_0213_applied() returns boolean`; the reward-reminder function's message uses `coalesce(gym_settings.points_name, 'Points')` instead of the literal `CORE Points`.

- [ ] **Step 1: Write the harness** `scripts/sql/assistant-button.mjs` (copy the setup of `scripts/sql/whats-new-themes-coach.mjs`, replay migrations through 0213). Assertions:
  - a new member row reads `assistant_button = 'header'`;
  - as that member (`authenticated`), `update member_profiles set assistant_button='floating' where profile_id = <self>` writes 1 row;
  - setting `'sideways'` raises the check violation;
  - as that member, updating another member's `assistant_button` writes 0 rows;
  - with `gym_settings.points_name = 'G Points'` and a reachable reward, running the reward-reminder sweep writes a notification whose body contains `G Points` and not `CORE Points`;
  - `migration_0213_applied()` is true (granted to anon like every marker — the probe uses the anon key).
- [ ] **Step 2: Run it** — `cd ~/uicheck && node <repo>/scripts/sql/assistant-button.mjs "<repo>"` → fails (no 0213).
- [ ] **Step 3: Write 0213.** Find the **last** definition of the function holding `' CORE Points — enough for '` (0102 at line ~249; grep later migrations for a redefinition) and redefine it with the gym's `points_name`; add the column; marker granted to `anon, authenticated`.
- [ ] **Step 4: Run the harness** → exit 0. Run `security-red-team.mjs` → exit 0.
- [ ] **Step 5: Verify file, probe entry, CI line; commit** `0213 (written, not pasted): assistant placement per member; reward reminders use the gym's points name`.

### Task 2: Shared pieces — row icon tile, tab header without the rail, assistant placement

**Files:**
- Modify: `g-fitness-member/src/components/ui/noc.tsx` (`LineRow`), `components/layout/TabHeader.tsx`, `components/layout/memberNav.ts` (`RAILS` no longer rendered; keep the data for More), `components/layout/Layout.tsx` (`ChatheadGate`), `lib/memberCaches.ts`
- Create: `g-fitness-member/src/lib/assistantPlacement.ts`, `components/layout/AssistantButton.tsx`, `scripts/member-shared-check.js`

**Interfaces:**
- Produces:
  - `LineRow` new optional props `icon?: Icon` (Phosphor component) and `tone?: 'mine' | 'act' | 'info'` (default `'info'`); renders a 38px tile before the text. Existing callers unchanged.
  - `lib/assistantPlacement.ts`: `type AssistantPlacement = 'header' | 'floating'`; `useAssistantPlacement(): AssistantPlacement` (reads `member_profiles.assistant_button` once per session, memory only, any read error → `'header'`); `saveAssistantPlacement(next): Promise<void>` (throws `Your choice could not be saved.`; `assertWrote`); `clearAssistantPlacement()` in `clearMemberCaches()`.
  - `hooks/useAssistantAllowed.ts` `useAssistantAllowed(): boolean` — the existing `ChatheadGate` conditions (gym module `assistant`, plan `ai_model`, failed check shows), extracted so the header button and the bubble share them.
  - `<AssistantButton />` — 36px violet sparkle icon button → `/member/chatbot`, renders only when allowed and placement is `header`.
- [ ] **Step 1: Write `scripts/member-shared-check.js`** (fixture head from `member-more-back-check.js`, lines 1–117). Assertions:
  - on `/member/home`, `/member/book-class`, `/member/membership` the header has a button named `Ask the assistant` and no element `[data-floating-chathead]`;
  - with the `member_profiles` select answering `{assistant_button:'floating'}`, the header button is absent and `[data-floating-chathead]` exists;
  - with that select answering HTTP 400, behaviour equals `header` and no page error;
  - with `ai_model` off in `my_plan_features`, neither appears;
  - no tab root renders `nav.rail`;
  - `document.documentElement.scrollWidth <= innerWidth` on each of the three roots.
- [ ] **Step 2: Run** `node scripts/ci/run-ui-checks.mjs member-shared` → fails.
- [ ] **Step 3: Implement** the props, hook, button; `TabHeader` drops the rail and puts `AssistantButton` left of the bell; `ChatheadGate` → `useAssistantAllowed() && placement === 'floating'`, and the bubble gets `data-floating-chathead`, shrinks to 40px while `<main>` scrolls (CSS class toggled on scroll, back after 600 ms idle), and `<main>` gets `padding-bottom: 72px` while it floats.
- [ ] **Step 4: Run** the check and every `member` check → green (fix tests that asserted the rail, by moving the assertion to the screen that now owns the link).
- [ ] **Step 5: Build, commit, push, deploy.**

### Task 3: Today

**Files:**
- Modify: `g-fitness-member/src/pages/Home.tsx` and the components it composes (`WeekMarks`, `StreakStrip`, `DueStrip`, `TodayExtras`, `TermsUpdateStrip`, `PushPrompt`, `GymGoalStrip`, `FinishPlanCard`, `ProgramNext`, `components/home/*` timeline)
- Create: `g-fitness-member/src/components/home/TodayStrip.tsx`, `scripts/member-today-check.js`

**Interfaces:**
- Produces: `<TodayStrip />` — the membership line, visits this month, the seven day marks (done / today / planned, tapping opens the attendance calendar as before) and the compact streak line (`<StreakStrip compact />`, opening the same streak sheet). Points stay on You: Today has no points read, and adding one is not this task. `hooks/useCheckedInToday.ts` — one shared `[boolean | null, refresh]` store for the bar and the Now row.
- [ ] **Step 1: Write `scripts/member-today-check.js`** (fixture of `member-door-check.js` + its session lines). Assertions:
  - exactly one `[data-today-strip]`, containing the plan name, `days left`, the points figure and 7 day marks;
  - none of the old month card, week strip or streak card selectors remain;
  - timeline groups appear in order `Now`, `Today`, then dated, then `Later`, and empty groups are not rendered;
  - when `checked_in_today` is true the Now row says `Checked in at` **and** the bar block says `Checked in`; when false, both say not checked in (`Show my code` present) — the contradiction is gone;
  - a planned workout renders one card with `Start workout`, and the bottom `Start a workout` button is gone;
  - empty day (no bookings, no plan): `Nothing booked` with `Book`;
  - Terms update and push-blocked render as `Later` rows when their conditions hold;
  - `[data-whats-new]` still renders when `my_whats_new` returns a note.
- [ ] **Step 2: Run** → fails.
- [ ] **Step 3: Implement** to `mock-today-train-more.png` (left phone) — sizes and spacing from `mock-today-train-more.html`; each removed card's figure stays reachable from `/member/progress`; the Now row and `TabBar` read one source (`useCheckedInToday` moved to `hooks/useCheckedInToday.ts` and shared).
- [ ] **Step 4: Run** this check + all `member` checks → green. Screenshot at 393×852 beside the mockup.
- [ ] **Step 5: Build, commit, push, deploy.**

### Task 4: Train

**Files:**
- Modify: `g-fitness-member/src/pages/BookClass.tsx` (becomes the Classes tab body), `components/layout/memberNav.ts` (Train eyebrow/title, `TAB_PATHS` Train row keeps every current path), `components/layout/TabHeader.tsx` (`titleFor` train → `Your training`)
- Create: `g-fitness-member/src/pages/train/TrainPage.tsx`, `pages/train/WorkoutTab.tsx`, `pages/train/CoachTab.tsx`, `scripts/member-train-check.js`

**Interfaces:**
- Produces: route `/member/book-class` renders `TrainPage`, tab from `?tab=` — `workout` (default), `classes`, `coach`; `/member/bookings` and `/member/book` keep resolving (classes); `CoachTab` hosts 1-on-1 booking, My bookings, Coaches, Rooms rows/content.
- [ ] **Step 1: Write `scripts/member-train-check.js`.** Assertions:
  - `/member/book-class` shows tabs `Workout`, `Classes`, `Coach` with Workout selected;
  - Workout: today's workout hero with `Continue` or `Start`, exercise rows, rows `This week`, `Routines`, `Programs`, `Free workouts`, `Equipment`, `Progress` each navigating to its existing route;
  - `?tab=classes` shows the week grid and class list with `Book`; the legend's bounding box is one line tall;
  - `?tab=coach` shows 1-on-1 booking and rows `My bookings`, `Coaches`, `Rooms`;
  - `/member/bookings` and `/member/book` land on Classes; Back from a class detail returns to the same tab;
  - no page scrolls sideways.
- [ ] **Step 2: Run** → fails.
- [ ] **Step 3: Implement** to the mock's centre phone; BookClass's own inner tabs (Group classes / 1-on-1 / Events) become Classes (group + events) and Coach (1-on-1), so the page still has one row of tabs.
- [ ] **Step 4: Run** + all `member` checks (BookClass checks updated to `?tab=classes`) → green. Screenshot.
- [ ] **Step 5: Build, commit, push, deploy.**

### Task 5: You

**Files:**
- Modify: `g-fitness-member/src/pages/MembershipHub.tsx`
- Create: `g-fitness-member/src/pages/you/ActivityPage.tsx` (route `/member/activity`, the full filtered list moved out), `scripts/member-you-check.js`

- [ ] **Step 1: Write the check.** Assertions: profile row; membership hero with plan, `days left`, `ends`, progress bar, `Renew or change plan`; four term numbers; points card titled with the gym's `pointsName` (fixture `points_name: 'G Points'` → text `G Points`, never `CORE Points`) and `Spend`; rows `Activity`, `Payments`, `Attendance`, `What <plan> includes`, `Waiver`, `Pause or cancel`, `Invite a friend`, `Account` each opening their route; `/member/activity` shows the All · Points · Payments filters and `See all` items; no chip row.
- [ ] **Step 2: Run** → fails.
- [ ] **Step 3: Implement** to `mock-you-inbox-settings-checkin.png`, phone 1.
- [ ] **Step 4: Run** + `member` checks → green. Screenshot.
- [ ] **Step 5: Build, commit, push, deploy.**

### Task 6: Inbox

**Files:**
- Modify: `g-fitness-member/src/pages/NotificationsAll.tsx`, `components/notifications/NotificationListItem.tsx` (or the row it renders), the bell sheet's row
- Create: `g-fitness-member/src/lib/foldNotifications.ts`, `scripts/member-inbox-check.js`

**Interfaces:**
- Produces: `foldNotifications(items: NotificationRow[]): InboxEntry[]` where `InboxEntry = { kind: 'single'; item: NotificationRow } | { kind: 'fold'; type: string; items: NotificationRow[] }` — folds 2+ items of the same automatic `type` (check-in, badge, plan reminder) inside the same group (Today / This week / Earlier); gym messages never fold.
- [ ] **Step 1: Write the check.** Assertions: one tab row `All`, `Unread`, `From the gym`; header buttons `Read all` and `Archived`; a gym announcement appears under `Pinned · from the gym` above `Today`; 4 check-ins this week render as one row `Checked in ×4` that expands to 4; the unread count and pager count real items (36 → `page 1 of 2`); swipe/select still archive one item; `Spend` and `Start` actions render on their kinds; `/member/events` content shows under From the gym. Unit-style assertions on `foldNotifications` via `await import('/src/lib/foldNotifications.ts')`.
- [ ] **Step 2: Run** → fails.
- [ ] **Step 3: Implement** to phone 2.
- [ ] **Step 4: Run** + `member` checks → green. Screenshot.
- [ ] **Step 5: Build, commit, push, deploy.**

### Task 7: More

**Files:**
- Modify: `g-fitness-member/src/components/layout/EverythingSheet.tsx`, `components/layout/memberNav.ts` (`Destination` gains `icon` and `blurb` for every `EVERYTHING` item; Inbox listed once)
- Create: `scripts/member-more-check.js`

- [ ] **Step 1: Write the check.** Assertions: a search box labelled `Search the app`; four tiles `Book`, `Progress`, `Rewards`, `Payments`; every `EVERYTHING` destination visible to the fixture's gym appears once with an icon and a one-line description; typing `pay` shows Payments and hides Routines; `inbox` finds Inbox once; a gym with `shop` switched off shows no Shop; Back closes (re-run `member-more-back-check`).
- [ ] **Step 2: Run** → fails.
- [ ] **Step 3: Implement** to the mock's right phone; matching on word starts of label + blurb.
- [ ] **Step 4: Run** + `member` checks → green. Screenshot.
- [ ] **Step 5: Build, commit, push, deploy.**

### Task 8: Settings

**Files:**
- Modify: `g-fitness-member/src/pages/Settings.tsx` (becomes the list), `App.tsx` (sub-routes)
- Create: `g-fitness-member/src/pages/settings/{Notifications,CoachesSee,AiCoach,SignIn,Language,YourData,Account,HelpLegal,AboutGym}.tsx` holding today's sections unchanged, `scripts/member-settings-check.js`

- [ ] **Step 1: Write the check.** Assertions: list rows with state lines (`Push on`, coach count, `English`); `Assistant button` with `Header` / `Floating` segmented control that sends `assistant_button` and switches the header button live; when the save fails the control reverts and says it could not be saved; each row opens `/member/settings/<section>` showing the same switches and copy as before (e.g. `Send a test alert to this device`, `Download my data`, `Coaches these switches apply to`); gym hours and contact come from `gym_settings`; `Log out` present; existing `member-switches-check`, `member-terms-check` green.
- [ ] **Step 2: Run** → fails.
- [ ] **Step 3: Implement** to phone 3.
- [ ] **Step 4: Run** + `member` checks → green. Screenshot.
- [ ] **Step 5: Build, commit, push, deploy.**

### Task 9: Check-in sheet, docs, wrap-up

**Files:**
- Modify: `g-fitness-member/src/components/ui/CheckInSheet.tsx`, `docs/ROADMAP.md` (0213 entry), `CLAUDE.md` (Mobile shell section: shared rules, assistant setting), `corefitness-site/src/catalogue.ts` (assistant placement line)
- Create: `scripts/member-checkin-sheet-check.js`

- [ ] **Step 1: Write the check.** Assertions: sheet titled `Check in` with `Show this at the desk or the kiosk`; code image on a white tile ≥ 200px; typed code; plan and `valid to`; `What are you doing today?` select; `Make this my usual` toggle; `The desk can still change it.`; Back closes it (from `member-more-back-check`).
- [ ] **Step 2: Run** → fails.
- [ ] **Step 3: Implement** to phone 4; then docs.
- [ ] **Step 4: Run** every `member` check and the whole suite → green apart from the known clock-bound `member-door-check` / `admin-dashboard-check` cases (state which, with output).
- [ ] **Step 5: Build, commit, push, deploy;** remind the owner to paste 0213 and write a What's new note for members.
