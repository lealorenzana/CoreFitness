# Project B-1 — One Workouts section — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** Train → "My plan" (This week · Programs · Routines · Free workouts) becomes **Workouts** (Today · Routines · Programs · Browse): a step-by-step introduction shown once, then tabs; every routine labelled by where it came from.

**Architecture:** The section already exists as a hub (`memberNav.ts` `HUBS`, `HubStrip`), each tab its own route, so this is a new **Today** screen plus relabelled tabs — no route a notification links to is removed. "Seen the introduction" is per-member state, so it is a column written by a definer RPC (CLAUDE.md: never localStorage). Routine sources already exist (`workout_routines.source`, 0145: `member` | `coach` = the AI coach); 0172 adds `trainer`, `author_id`, `edited_by`, `edited_at` for B-3.

**Spec:** `docs/superpowers/specs/2026-10-10-gym-workflows-redesign-design.md` §B1 (mockup decision: C once, then B; C's "No program? No problem" is B's empty Today).

## Global Constraints
- Workout = one session today · Routine = a saved repeatable list · Program = multi-week, harder each week. Every screen uses these words.
- Source labels: **Yours** · **AI coach** · **Coach ___** · **Gym**.
- The free library (Browse) is never gated. Renew is never gated.
- Build screens from `components/ui/noc.tsx`; type floor 12px; violet = where you are, amber = what to do next.
- Migration: marker, verify file, probe entry, `LAST`, CI suite.

### Task 1: 0172 — introduction flag and routine authorship
**Files:** `supabase/migrations/0172_workouts_section.sql`, `scripts/sql/workouts-section.mjs`, `scripts/sql/verify/verify0172.sql`, probe, `LAST = 172`, CI.
- `member_profiles.workouts_intro_seen_at timestamptz`; `mark_workouts_intro_seen()` (definer, `auth.uid() is not null`, sets it once for the caller's own row, returns void).
- `workout_routines.source` check widened to `('member','coach','trainer')` — `coach` keeps meaning the AI coach (0145's functions write it; renaming would mean redefining them).
- `workout_routines.author_id uuid references profiles(id) on delete set null`, `edited_by uuid references profiles(id) on delete set null`, `edited_at timestamptz` (written by B-3).
- Tests (as `authenticated`): a member marks their own intro once (second call keeps the first time); another member's row is untouched; a direct `update member_profiles set workouts_intro_seen_at` by the member is refused or a no-op only if RLS already forbids that column (assert whichever is true and document); `source = 'trainer'` accepted, `'x'` refused.

### Task 2: Today screen
**Files:** create `g-fitness-member/src/pages/WorkoutsToday.tsx`, `src/lib/api/workoutsIntro.ts`; route `/member/workouts/today` in `App.tsx`; `lib/moduleRoutes.ts` (no module — always open, like Browse).
- **Intro (C)** while `workouts_intro_seen_at` is null: three numbered steps (1 Your program, 2 Your routines, 3 Today's workout) with the member's real data, an amber **Start today's workout** and a **Skip** link; starting or skipping calls `mark_workouts_intro_seen()`.
- **Today (B):** next workout = the followed program's first not-done day (`programProgress`) → else today's plan day routine (`listMyPlan` + `todayDow`) → else the empty state. Start uses the existing `startProgramDay` / `startRoutineSession`.
- **Or do something else today:** up to 3 routines (`listRoutines`) with source labels, `SeeAll` → Routines tab.
- **This week:** `WeekMarks` + "Plan your week" → `/member/gym-plan`.
- **Empty state ("No program? No problem"):** Browse the free library · Ask the AI coach to build one (only when `coachReady()`) · Gym programs (only when the gym has published ones).
- "How this works" link reopens the intro (local view state only — the seen flag is not cleared).

### Task 3: Section relabelled
**Files:** `components/layout/memberNav.ts` (HUBS `plan`: label **Workouts**, tabs Today `/member/workouts/today` · Routines `/member/track` · Programs `/member/programs` · Browse `/member/workouts`; Everything-sheet rows likewise), `pages/Workouts.tsx` title "Browse" with subtitle "Free workouts and exercises — always free", `pages/GymPlan.tsx` back → Today.
- Routines rows show the source pill: `member` → Yours, `coach` → AI coach, `trainer` → the author's name ("Coach Ben").

### Task 4: Checks and ship
- `scripts/member-workouts-check.js`: first visit shows the three steps and Skip; after Skip (RPC called) Today shows the program's next day; a member with nothing sees "No program? No problem" with Browse; the strip reads Today · Routines · Programs · Browse; a routine from the AI coach is labelled "AI coach". Register in `ui-checks.json`.
- `member-nav-check.js` and existing workout checks still pass; build + lint member; commit; deploy member; hand over 0172.
