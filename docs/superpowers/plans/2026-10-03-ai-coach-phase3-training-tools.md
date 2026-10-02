# AI Coach — Phase 3: Training tools — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The coach can build a routine, change one of the member's routines, set their weekly schedule and set a goal — each as a proposal card the member **Applies** or **Discards**, and every applied change can be **Undone**.

**Architecture:** Migration 0145 adds `ai_proposals` (written only by definer functions) and `source` columns on `workout_routines` and `gym_plans`. The Edge Function gains a tool loop: read tools (exercises, the member's routines and schedule) and propose tools, all executed **as the member** through SQL; a propose tool only stores a pending proposal and streams a `proposal` frame. The member app renders proposal cards in the chat and a "Changes from the coach" sheet; Apply/Undo/Discard call SQL, which re-validates and snapshots.

**Tech Stack:** Supabase Postgres (pglite tests), Deno Edge Function + `npm:@anthropic-ai/sdk@0.129.0`, React 19 member app, Playwright fixture checks.

**Spec:** `docs/superpowers/specs/2026-09-29-ai-coach-design.md` (Phase 3)

## Global Constraints

- **Nothing changes without Apply.** A propose tool stores a pending proposal; only `apply_ai_proposal()` writes routines/schedule/goals.
- Every tool runs **as the member** (their JWT; RLS and definer functions decide). The service-role key stays limited to `ai_claim_message` / `ai_record_usage`.
- **One claimed message per member message**, however many tool rounds it takes; the loop stops after **6 rounds**.
- Reading the member's existing routines or schedule **needs history consent**; without it the coach may still *propose a new* routine, schedule or goal.
- An exercise in a proposal is one this gym can use (`exercise_usable_here` and not hidden in `gym_exercise_media`) or a custom name; ≤ 12 exercises; routine name 1–40 chars; existing column bounds apply (sets 1–20, reps 1–200, rest 0–600, seconds 1–7200).
- Injury rule unchanged: the coach never proposes changes *because of* an injury.
- A coach-made routine is marked "Built with the coach" for the member and their trainer; a coach-set schedule day says "Set by the coach".
- Proposals are the member's alone (RLS select own; no write policy for any role).

---

### Task 1: Migration 0145 — proposals, apply, undo

**Files:** Create `supabase/migrations/0145_ai_coach_proposals.sql`, `scripts/sql/ai-proposals.mjs`, `scripts/sql/verify/verify0145.sql`.

**Interfaces — Produces (all `authenticated`, definer, `set search_path = public`, revoke from public/anon):**
- table `ai_proposals(id uuid pk, gym_id uuid default acting_gym_id(), member_id uuid references profiles on delete cascade, kind text check in ('routine.create','routine.replace','schedule.set','goal.create'), payload jsonb not null, summary text not null check (char_length(summary) between 1 and 200), status text not null default 'pending' check in ('pending','applied','discarded','undone'), undo jsonb, created_at timestamptz default now(), decided_at timestamptz)`; RLS select `member_id = auth.uid()`; restrictive tenant select; in `tenancy_gym_tables()` (copy the latest array from 0143 and add `'ai_proposals'`).
- `workout_routines.source` and `gym_plans.source`: `text not null default 'member' check (source in ('member','coach'))`.
- `create_ai_proposal(p_kind text, p_payload jsonb, p_summary text) returns uuid` — caller must be an active member with `ai_coach_status()->>'allowed' = 'true'`; validates the payload exactly as apply would (shared private function `ai_proposal_check(p_kind, p_payload, p_member, p_gym) returns void` raising plain sentences); at most 10 pending per member (else "You have 10 changes waiting — apply or discard some first.").
- `apply_ai_proposal(p_id uuid) returns jsonb` — own pending only; re-runs `ai_proposal_check`; requires `plan_allows(me,'workout_tracker')` for routine kinds (the routines RLS rule, which a definer bypasses); writes; stores `undo`; status `applied`; returns `{ kind, routine_id? }`.
- `undo_ai_proposal(p_id uuid) returns void` — own applied only; restores from `undo`; status `undone`; plain refusals when the world moved (see below).
- `discard_ai_proposal(p_id uuid) returns void` — own pending → `discarded`.
- `my_ai_proposals() returns setof ai_proposals` — own, newest first, last 30 days.
- Read helpers for the coach: `ai_coach_exercises(p_muscle text default null, p_equipment text default null) returns table(id uuid, name text, muscle_group text, equipment text, is_timed boolean)` (usable here, not hidden, active, ≤ 80 rows, ordered by name); `ai_coach_routines() returns jsonb` (null without consent; else `[{id, name, source, exercises:[{exercise_id, name, target_sets, target_reps, target_weight_kg, target_seconds, rest_seconds}]}]`); `ai_coach_schedule() returns jsonb` (null without consent; else `[{day_of_week, routine_id, remind_at, source}]`).

**Payload shapes (validated by `ai_proposal_check`):**
- `routine.create`: `{ name, notes?, exercises: [{ exercise_id?, custom_name?, target_sets, target_reps?, target_weight_kg?, target_seconds?, rest_seconds }] }`
- `routine.replace`: same plus `routine_id` (must be the member's, this gym).
- `schedule.set`: `{ days: [{ day_of_week 0–6 (unique), routine_id? (member's), remind_at? 'HH:MM' }] }` (1–7 entries) — the listed days become the member's plan days; days not listed are removed.
- `goal.create`: `{ title 1–80, metric in ('weight_kg','body_fat_pct','waist_cm','workouts_per_week','custom'), start_value?, target_value?, target_date? (today..+2 years) }`.

**Apply / undo semantics:**
- `routine.create`: insert routine (`source 'coach'`, position = max+1) + exercises; `undo = {routine_id}`. Undo deletes it — **refused** if any `workout_logs.routine_id` points at it: "You have already trained with this routine. Delete it yourself from My routines if you want it gone."
- `routine.replace`: snapshot `{routine_id, name, notes, exercises:[…]}`; set name/notes, delete and re-insert exercises; `source` becomes `'coach'`. Undo restores the snapshot (refused if the routine was deleted: "That routine has been deleted since.").
- `schedule.set`: snapshot the member's current `gym_plans` rows for this gym; delete them; insert the new days (`active true`, `source 'coach'`, `remind_at` default '17:00'). Undo deletes current rows and re-inserts the snapshot (a snapshot routine that no longer exists goes back as `routine_id null`).
- `goal.create`: insert into `fitness_goals`; `undo = {goal_id}`; undo deletes it — refused if `achieved_on` is set: "You reached that goal — it stays."
- Apply of a stale proposal (routine deleted, exercise hidden since) raises the check's plain sentence and changes nothing.

- [ ] **Step 1: Write `scripts/sql/ai-proposals.mjs`** (copy `scripts/sql/ai-coach.mjs`'s setup: two members A/B with an `ai_model` plan and `workout_tracker`, a desk account, `act_as_gym`, a second gym with its own exercise) asserting, each as its own `check(...)`:
  1. A creates a routine.create proposal with 3 shared exercises → pending; nothing written to workout_routines yet.
  2. B cannot see A's proposal; B cannot apply/discard/undo it (error or zero effect — assert A's row unchanged).
  3. A applies → routine exists with `source 'coach'` and 3 exercises in order; status `applied`.
  4. A undoes → routine gone; status `undone`.
  5. Re-apply a fresh one, log a workout with that routine, undo → refused with /already trained/; routine still there.
  6. routine.replace on A's routine snapshots and replaces; undo restores the old name and exercises exactly.
  7. replace of B's routine by A → refused at create.
  8. An exercise from the second gym → refused (plain sentence); a hidden exercise (gym_exercise_media hidden true) → refused; 13 exercises → refused; a 41-char name → refused; sets 0 → refused.
  9. schedule.set with days [1,3,5] → A's gym_plans are exactly those (source coach); undo restores the previous days exactly (set up 2 prior days first).
  10. goal.create inserts a goal; undo removes it; an achieved goal's undo refused.
  11. Discard → status discarded; applying a discarded one refused.
  12. 11th pending proposal refused with /10 changes waiting/.
  13. Without consent: `ai_coach_routines()` and `ai_coach_schedule()` are null; `ai_coach_exercises()` still returns rows; with consent they return A's data and never B's.
  14. A member on a plan without `workout_tracker` cannot apply a routine proposal (plain sentence).
  15. A member whose coach is not allowed (gym switched assistant off) cannot create a proposal.
  16. No role has an insert/update/delete policy on ai_proposals (query pg_policies).
  17. `tenancy_gym_tables() @> array['ai_proposals']`; verify0145.sql reports OK.
- [ ] **Step 2: Run → FAIL** (`create_ai_proposal` missing). From `~/uicheck`: `node "<repo>/scripts/sql/ai-proposals.mjs" "<repo>"`.
- [ ] **Step 3: Write the migration** implementing exactly the interfaces and semantics above. Use `assertWrote`-style guards in SQL: after each UPDATE/DELETE that must touch a row, check `found`/row count and raise a plain sentence if not. Every function filters by `current_gym_id()`. End with the probe marker `migration_0145_applied()` in 0143's style.
- [ ] **Step 4: verify0145.sql** in 0143's style: RLS on, 0 permissive write policies on ai_proposals, the 9 functions exist, `source` columns exist with checks, tenancy list includes ai_proposals → `REPORT 0145 … OK`.
- [ ] **Step 5: Pass**; also run `ai-coach.mjs` and `tenancy-isolation.mjs`. Mutation: in a scratch copy drop the "already trained" check; check 5 must fail; restore; `cmp`.
- [ ] **Step 6: Commit** `0145: coach proposals — nothing changes until Apply, and every change can be undone` + Co-Authored-By.

---

### Task 2: The coach's tools (pure core) and the tool loop

**Files:** Modify `supabase/functions/ai-coach/core.ts`, `supabase/functions/ai-coach/index.ts`, `scripts/ai-coach-core.mjs`.

**Interfaces:**
- `core.ts` exports `TOOLS` (Anthropic tool definitions, each `strict: true`, `additionalProperties: false`, every property listed in `required` with nullable types where optional): `find_exercises {muscle_group: string|null, equipment: string|null}`, `get_my_routines {}`, `get_my_schedule {}`, `propose_routine {summary, replace_routine_id: string|null, name, notes: string|null, exercises: [...]}`, `propose_schedule {summary, days: [{day_of_week, routine_id: string|null, remind_at: string|null}]}`, `propose_goal {summary, title, metric, start_value: number|null, target_value: number|null, target_date: string|null}`.
- `toolCall(name, input) → { rpc: string; args: Record<string, unknown> } | { error: string }` mapping each tool to its SQL call (`ai_coach_exercises`, `ai_coach_routines`, `ai_coach_schedule`, `create_ai_proposal` with kind `routine.create`/`routine.replace`/`schedule.set`/`goal.create` and the payload without `summary`), dropping nulls from payloads; unknown tool → `{error}`.
- `MAX_ROUNDS = 6`.
- SYSTEM_PROMPT gains a TOOLS section, verbatim:
  `HOW YOU CHANGE THINGS
You can look up exercises this gym has, and — if the member let you read their training — their routines and weekly schedule. You never change anything yourself: you propose a change with a propose tool, and the member decides on a card with Apply or Discard. Propose only after you know their goal, days and equipment (from their setup or by asking). Use exercises from find_exercises; use a custom name only when nothing fits. Keep routines to what fits their usual session. Write each summary as one short sentence the member will read on the card. After proposing, tell them briefly what you proposed and that nothing changes until they tap Apply. Never propose a change because of an injury or pain.`
- New SSE frame type: `{ type: 'proposal', id, kind, summary, payload }` (add to the `sse()` union).

- [ ] **Step 1: Tests in `scripts/ai-coach-core.mjs`:** every tool has `strict: true` and `additionalProperties: false`; `toolCall('propose_routine', {…replace_routine_id:null…})` → `create_ai_proposal` with kind `routine.create` and no `summary`/null keys in payload; with an id → `routine.replace` and `routine_id` in payload; `propose_schedule` → `schedule.set`; `propose_goal` → `goal.create`; `find_exercises` → `ai_coach_exercises` with `p_muscle`/`p_equipment`; unknown → error; the prompt contains "nothing changes until they tap Apply"; `sse({type:'proposal',…})` frames JSON. Run → FAIL, implement, → PASS.
- [ ] **Step 2: `index.ts` tool loop.** After the claim (unchanged — one claim per member message): loop up to `MAX_ROUNDS`: stream the request with `tools: TOOLS, tool_choice: { type: 'auto' }`; forward text deltas as `text` frames; accumulate token usage across rounds (message_start/message_delta); `const final = await stream.finalMessage()`; if `final.stop_reason !== 'tool_use'` → done; else append `{ role: 'assistant', content: final.content }` **unchanged** (append-only — thinking blocks must not be edited) and run each `tool_use` block: `toolCall` → `rpc(name, auth, ANON, args)` **as the member**; results → `tool_result` blocks (JSON string content; `is_error: true` with the plain error message on failure, never a raw stack); for `create_ai_proposal` successes also emit a `proposal` frame (`id` = returned uuid, `kind`, `summary`, `payload`). All results go back in **one** user message. After `MAX_ROUNDS` with tools still requested, send a `text` frame "I've stopped here — tell me if you'd like me to carry on." then `done`. Usage recorded once in `finally` (tokens summed over rounds). Keep every Phase 1/2 behaviour (gates, claim, cancel, errors).
- [ ] **Step 3: Strict tsc** of the function (copy to `~/sdkcheck/fn5`, swap the `npm:` specifier, Deno stub, `npx tsc --noEmit --strict --target es2022 --module nodenext --moduleResolution nodenext --allowImportingTsExtensions --lib es2022,dom fn5/deno.d.ts fn5/index.ts` → exit 0) and the node core test → PASS.
- [ ] **Step 4: Commit** `ai-coach: tools — look up exercises and the member's plan, propose changes` + Co-Authored-By.

---

### Task 3: Proposal cards, the changes sheet, and the marks

**Files:** Create `g-fitness-member/src/lib/api/aiProposals.ts`, `g-fitness-member/src/components/ProposalCard.tsx`, `g-fitness-member/src/components/CoachChanges.tsx`; modify `g-fitness-member/src/lib/api/aiCoach.ts` (parse `proposal` frames → `onProposal` callback), `ChatbotPage.tsx`, `Routines.tsx` (mark), `GymPlan.tsx` (mark), `pages/trainer/TrainerMembers.tsx` (mark), `lib/api/routines.ts` + `lib/api/gymPlans.ts` (select `source`, tolerating its absence before 0145), `Privacy.tsx`.

**Interfaces:** `aiProposals.ts` exports `type Proposal = { id; kind; summary; payload; status; created_at; decided_at }`, `listProposals()`, `applyProposal(id) → {kind, routine_id?}`, `undoProposal(id)`, `discardProposal(id)`.

- [ ] **Step 1:** `askCoach(question, history, onText, onProposal?)` — a `proposal` frame calls `onProposal({id, kind, summary, payload})`.
- [ ] **Step 2: `ProposalCard`** (from `noc.tsx` parts; never a component declared inside a render body): the summary; the detail — routine: name and each exercise "Name — 3 × 10, rest 90 s" (or "3 × 30 s" when timed); replace: "Replaces: <current name>"; schedule: each day "Mon — <routine name or 'Rest'>" (routine names resolved from the member's routines; unknown → "a routine"); goal: title and target. Buttons: **Apply** (amber, `NocButton variant="fill"`), **Discard** (ghost). After Apply: "Applied" + **Undo**; after Undo: "Undone"; after Discard: "Discarded". Errors show the SQL's plain sentence under the card. A busy state disables both buttons.
- [ ] **Step 3: ChatbotPage:** proposals arriving during a reply render as cards directly under that coach message (in component state keyed by message id). A header text button "Changes from the coach" (shown when `coach?.allowed`) opens `CoachChanges` — a `GlassSheet` listing `listProposals()` grouped Waiting / Applied / Undone-or-discarded, each with its card actions. Keep every Phase 1/2 rule (rules first, consent first, history = coach replies + their questions; proposal cards are not added to history).
- [ ] **Step 4: Marks.** `Routines.tsx`: a routine with `source === 'coach'` shows a small "Built with the coach" pill (`StatusPill` or the page's existing tag style). `GymPlan.tsx`: a day row whose plan row has `source === 'coach'` shows "Set by the coach". `TrainerMembers.tsx` "Saved routines": the same "Built with the coach" pill. Reads tolerate a database without the column (treat as 'member').
- [ ] **Step 5: Privacy** — append to the assistant sentence verbatim: `The coach can suggest changes to your routines, your weekly plan and your goals; nothing changes until you tap Apply, and you can undo a change afterwards.`
- [ ] **Step 6: Screen checks.** `scripts/member-coach-tools-check.js` (from `member-coach-check.js`'s setup; the function route returns SSE with a text frame and a `proposal` frame for a routine.create with two exercises; RPC fixtures for `apply_ai_proposal`, `undo_ai_proposal`, `discard_ai_proposal`, `my_ai_proposals` recording calls and mutating an in-memory list): the card shows the summary and both exercises; Apply calls `apply_ai_proposal` with the id and the card says Applied with Undo; Undo calls `undo_ai_proposal` and says Undone; a second proposal Discarded; the Changes sheet lists them by group; an apply error shows its sentence. Extend `scripts/trainer-rooms-check.js` or add `trainer-coach-mark-check.js`: a trainee routine with `source 'coach'` shows "Built with the coach" in the member sheet. Add both to `scripts/ci/ui-checks.json` (one line each, `sed`).
- [ ] **Step 7:** `npx tsc -b`, eslint on touched files, the new checks plus `member-coach` and `member-coach-setup` pass. Commit `Coach: proposal cards with Apply and Undo, a changes sheet, and the coach's mark on routines` + Co-Authored-By.

---

### Task 4: Bookkeeping and the sweep

- [ ] probe row 0145; SystemHealth `LAST = 145`; CI: `ai-proposals` in the SQL loop; CLAUDE.md Roadmap clause for 0145 (≤ 199 lines, edit in place); `docs/AI_INTEGRATION.md`: the tools, that nothing changes without Apply, undo rules, one message per question however many tool rounds; spec Phase 3 marked done.
- [ ] Full sweep: 4 builds, eslint on changed files, 3 audits, accent-contrast, ai-coach-core, every SQL file in the CI list, every UI check. Commit. (Push/deploy is the controller's, after the final review.)
