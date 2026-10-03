# AI Coach — Phase 4: Meal guidance — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The coach can propose a meal guide — everyday meal ideas with portions by hand size, never numbers — which the member applies like any other change; the guide lives under Progress → Meals.

**Architecture:** Migration 0146 adds `ai_meal_guides` (one current guide per member per gym, written only by `apply_ai_proposal`) and a new proposal kind `meals.set`, validated by a no-numbers rule the database enforces (`meal_text_ok(text)`). The Edge Function gains a `propose_meals` tool; the member app renders a meals card and a Meals tab under Progress; a trainer sees the guide only when the member shares goals with trainers (`trainer_may_see(member,'goals')`); the desk and owner never see it.

**Tech Stack:** as Phase 3.

**Spec:** `docs/superpowers/specs/2026-09-29-ai-coach-design.md` (Phase 4, option B)

## Global Constraints

- **Never a number target:** a meal guide is refused if any text contains a calorie/kcal/kJ figure, the word "macro"/"macros", a gram/grams figure, or a percentage of protein/carbs/fat. Counts of things are fine ("2 eggs", "1 cup of rice", "a palm of chicken").
- Every guide ends with the fixed line, shown by the app (not stored): "This is general guidance, not a diet plan. For anything medical — diabetes, pregnancy, allergies, an eating disorder — see a doctor or a registered nutritionist-dietitian."
- Nothing changes without Apply; undo restores the previous guide (or none).
- Privacy: the guide is the member's; trainers see it only with goals sharing; never desk/owner; Privacy says so in the same commit.
- Injury/medical rule unchanged; the prompt adds: no meal advice for a stated medical condition — refer.
- Phase 1–3 rules intact.

---

### Task 1: Migration 0146 — meal guides and `meals.set`

**Files:** Create `supabase/migrations/0146_ai_coach_meals.sql`, `scripts/sql/verify/verify0146.sql`; modify `scripts/sql/ai-proposals.mjs` (append checks).

**Interfaces — Produces:**
- `meal_text_ok(p text) returns boolean` (immutable): false when `p ~* '\d[\d,.]*\s*(k?cal|kcals?|kilocalories?|calories?|kj)\b'` or `p ~* '\mmacros?\M'` or `p ~* '\d[\d,.]*\s*(g|grams?)\M'` or `p ~* '\d+\s*%'`; true otherwise (null → true).
- table `ai_meal_guides(gym_id default acting_gym_id(), member_id references profiles on delete cascade, sections jsonb not null, updated_at timestamptz default now(), primary key (gym_id, member_id))` — RLS on; select policy `member_id = auth.uid() or trainer_may_see(member_id, 'goals')`; restrictive tenant select; no write policy; in `tenancy_gym_tables()` (copy 0145's array + `'ai_meal_guides'`).
- `sections` shape: `[{ title 1–40, items: [text 1–200] (1–8) }]`, 1–6 sections; every title and item passes `meal_text_ok`.
- `ai_proposals.kind` check extended with `'meals.set'`; `ai_proposal_check` handles it (payload `{ sections }`, refusals as plain sentences: "Meal guidance can't include calorie, gram, macro or percentage targets." for a numbers hit; shape errors "That meal guide isn't complete."); gated by `gym_module_on(gym,'progress')`.
- `apply_ai_proposal` for `meals.set`: snapshot the current row (or null) into `undo`, upsert the new sections; `undo_ai_proposal` restores the snapshot or deletes the row; refuse undo when the guide changed since (`updated_at > decided_at`, same rule as routines) with the existing "You've changed this yourself since…" sentence (the member cannot edit the guide directly in this phase, so this guards a newer applied meals.set: also refuse with "A newer change from the coach replaced this one — undo that first." when a newer applied meals.set exists).
- `my_meal_guide() returns jsonb` (own row's sections, null if none); `trainee_meal_guide(p_member uuid) returns jsonb` (sections when `trainer_may_see(p_member,'goals')` and the caller trains them per the existing trainer rule, else null).
- Redefine `ai_proposal_check`, `apply_ai_proposal`, `undo_ai_proposal` from their **0145 final bodies** (read them; keep every existing branch byte-for-byte apart from the additions).

- [ ] **Step 1: Append failing checks to `scripts/sql/ai-proposals.mjs`:** `meal_text_ok` refuses "1800 kcal a day", "150g protein", "track your macros", "40% carbs", "2,000 calories", "500 kJ" and allows "a palm of chicken", "2 eggs and toast", "1 cup of rice", "a fist of vegetables"; a meals.set with a numbers item refused with the plain sentence; a good one creates → applies → `my_meal_guide()` returns it; undo restores the previous guide (and none for the first); a newer applied meals.set blocks undoing the older; B cannot read A's guide; a desk account cannot read it; a trainer of A reads it via `trainee_meal_guide` only when A shares goals; progress module off → refused; tenancy list includes ai_meal_guides; verify0146 OK. Run → FAIL.
- [ ] **Step 2: Write the migration + verify script** (0145's style; probe marker `migration_0146_applied()`; check new names against the whole history).
- [ ] **Step 3: Pass**; also `ai-coach.mjs`, `tenancy-isolation.mjs`. Mutation: weaken `meal_text_ok` to always true in a scratch copy → the numbers checks fail; restore; `cmp`.
- [ ] **Step 4: Commit** `0146: meal guidance as a coach proposal — portions by hand, never numbers` + Co-Authored-By.

---

### Task 2: The tool, the card, the Meals tab, and the trainer view

**Files:** modify `supabase/functions/ai-coach/core.ts` (+ `scripts/ai-coach-core.mjs`), `g-fitness-member/src/components/ProposalCard.tsx`, `g-fitness-member/src/lib/api/aiProposals.ts` (+ `myMealGuide()`), `g-fitness-member/src/pages/progress/ProgressHub.tsx` + a new `tabs/MealsTab.tsx`, `g-fitness-member/src/pages/trainer/TrainerMembers.tsx` (+ the trainer service read), `g-fitness-member/src/pages/Privacy.tsx`; tests `scripts/member-coach-meals-check.js` (new, registered via `sed`), extend `scripts/trainer-coach-mark-check.js`.

- [ ] **Step 1: `propose_meals` tool** in `TOOLS` (strict; `anyOf` nullables as in Phase 3): `{ summary, sections: [{ title, items: [string] }] }` → `toolCall` → `create_ai_proposal` kind `meals.set`, payload `{sections}`. Prompt addition, verbatim: `MEALS
You can propose a meal guide with propose_meals: everyday Filipino-friendly meal ideas with portions by hand size — a palm of protein, a fist of rice or carbs, two cupped hands of vegetables, a thumb of fats. Never write a calorie, kcal, macro, gram or percentage figure; the app refuses them. If the member mentions a medical condition, pregnancy, an allergy or an eating disorder, do not give meal advice — say a doctor or a registered nutritionist-dietitian should guide them.` Core tests: the tool is strict with no type-arrays; mapping; the prompt text present.
- [ ] **Step 2: Card** — `meals.set` renders each section title and its items; the fixed general-guidance line (Global Constraints) under it, through `t()`.
- [ ] **Step 3: Meals tab** in Progress (`ProgressHub` tabs: add `{ id: 'meals', label: 'Meals' }` with a fitting Phosphor icon), reading `myMealGuide()`: the sections as rows (not a card per row), "Built with the coach", the fixed line, and an empty state "No meal guide yet. Ask the coach for one." with a link to the assistant (`/member/chatbot`). The More sheet's Progress links stay; add "Meals" there only if the Progress tabs are listed there (match the existing pattern in `memberNav.ts`).
- [ ] **Step 4: Trainer** — in the member sheet, a "Meal guide" section shown when `trainee_meal_guide()` returns sections (read-only, same rows, the fixed line); nothing when null.
- [ ] **Step 5: Privacy** — add verbatim to the coach sentence: `If you apply a meal guide from the coach, it is yours: coaches you train with see it only if you share your goals with them, and the gym's desk and owner never see it.`
- [ ] **Step 6: Checks** — `member-coach-meals-check.js`: a `proposal` frame of kind meals.set renders its sections and the fixed line; Apply calls apply; the Meals tab shows the guide (fixture `my_meal_guide`) and the empty state when null. Trainer check: guide shown when `trainee_meal_guide` returns sections, absent when null. Run with the other coach checks; `npx tsc -b`; eslint; strict tsc of the function (copy to `~/sdkcheck/fn8`, as before).
- [ ] **Step 7: Commit** `Coach: meal guides — a card, a Meals tab under Progress, and the trainer's view when shared` + Co-Authored-By.

---

### Task 3: Bookkeeping and the sweep

- [ ] probe row 0146; SystemHealth `LAST = 146`; CLAUDE.md Roadmap clause for 0146 (≤ 199 lines; also update the "0142–0145 written, not yet pasted" wording — 0142–0145 are now live, verified by the probe 2026-10-03); `docs/AI_INTEGRATION.md` meals section; spec Phase 4 marked done; `scripts/ci/ui-checks.json` has the new check.
- [ ] Full sweep (4 builds, eslint, 3 audits, accent-contrast, ai-coach-core, every SQL file, every UI check). Commit.
