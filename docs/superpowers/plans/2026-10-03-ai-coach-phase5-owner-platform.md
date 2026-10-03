# AI Coach — Phase 5: Owner limits and usage, platform view — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The gym owner sets the coach's two message limits and sees this month's coach usage and its estimated cost on **Your app**; the platform owner sees coach messages and estimated spend per gym on **Usage**.

**Architecture:** Migration 0147 adds an owner-only writer for the two limits, an owner-only gym-totals reader, a platform-only per-gym reader, and adds `coach` to `platform_gym_usage()`. The admin app gets an "AI coach" section on Your app; the platform app gets a `coach` column and a spend tile on Usage.

**Tech Stack:** as before; admin is Tailwind v3 (`kit.tsx`, `FormField`, tokens never `brand-*`/`dark-*`).

**Spec:** `docs/superpowers/specs/2026-09-29-ai-coach-design.md` (Phase 5)

## Global Constraints

- **Totals only.** The owner and desk see gym totals — never a per-member count, never any message text. The platform sees per-gym counts only.
- **Estimated cost is labelled as an estimate**, computed from token counts at the coach model's list price, **Claude Sonnet 5.5: $2 per million input tokens, $10 per million output tokens**, shown in US dollars (the bill is in dollars), with the note "Your real bill is on console.anthropic.com." No peso conversion (a typed exchange rate goes stale).
- Limits: daily 1–500, monthly 1–100000 (0143's checks); only the gym's **owner** (`admin`) changes them; the desk can read the totals (they field member questions) but not change limits.
- Day and month boundaries are Manila (`manila_today()`), matching `ai_claim_message`.
- 0142–0146 are live by the time this is pasted (0146 after the owner pastes it); 0147 must paste cleanly on top and redefine `platform_gym_usage` from its **0140** body (check whether a later migration redefined it first).

---

### Task 1: Migration 0147

**Files:** Create `supabase/migrations/0147_ai_coach_owner_platform.sql`, `scripts/sql/verify/verify0147.sql`; append checks to `scripts/sql/ai-coach.mjs`.

**Interfaces — Produces:**
- `set_ai_coach_limits(p_daily int, p_monthly int) returns void` — caller must be an active `admin` of the current gym and `gym_writable()`; updates `gym_settings` for the current gym (plain refusal sentences: "Only the gym's owner can change the coach's limits." / "A daily limit is 1 to 500 messages." / "A monthly limit is 1 to 100,000 messages."); raises if no row was updated.
- `gym_ai_usage() returns jsonb` — caller active `admin` or `staff` of the current gym; returns `{ daily_limit, monthly_limit, month_start date, messages_month int, tokens_in_month bigint, tokens_out_month bigint, messages_today int, members_using_month int, est_cost_usd_month numeric(10,4), days: [{ day, messages }] (this Manila month, every day up to today, zero-filled) }`. `members_using_month` is a **count** of distinct members, never who. Cost = tokens_in × 2 / 1e6 + tokens_out × 10 / 1e6.
- `platform_ai_usage(p_days int default 30) returns table (gym_id uuid, messages bigint, tokens_in bigint, tokens_out bigint, est_cost_usd numeric)` — `is_platform_admin()` only (returns nothing otherwise), over the last `p_days` Manila days (1–365).
- `platform_gym_usage()` redefined from its last body + a `coach` feature: `select gym_id, 'coach', sum(messages)::bigint from ai_usage_days where day > manila_today() - v_days group by gym_id`.
- Probe marker `migration_0147_applied()`.

- [ ] **Step 1: Failing checks** (append to `scripts/sql/ai-coach.mjs`, using its owner/desk/members fixture; add an owner `admin` of the gym if missing): owner sets limits 20/900 → `ai_coach_status()` reports them; desk cannot (error, and the values unchanged); a member cannot; out-of-range refused with the plain sentences; `gym_ai_usage()` after claims/usage for two members (record via `set role service_role; select ai_claim_message(...); select ai_record_usage(...)`) returns the right month totals, today's count, `members_using_month = 2`, a cost that equals the formula, zero-filled days; the JSON contains no member id (assert no member uuid appears in its text); a member calling it gets nothing/an error; `platform_ai_usage()` as the platform admin (copy how `scripts/sql/platform-insight.mjs` makes one) returns the gym's row, as an owner returns no rows; `platform_gym_usage()` includes a `coach` row with the message sum; verify0147 OK. Run → FAIL.
- [ ] **Step 2: Migration + verify** (0143's style; check names against history; revoke public/anon; grants to authenticated).
- [ ] **Step 3: Pass**; also `platform-insight.mjs` and `tenancy-isolation.mjs`. Mutation: let staff call `set_ai_coach_limits` in a scratch copy → the desk check fails; restore; `cmp`.
- [ ] **Step 4: Commit** `0147: the owner sets the coach's limits and sees its usage; the platform sees spend per gym` + Co-Authored-By.

---

### Task 2: Your app — AI coach; platform Usage — coach

**Files:** `g-fitness-admin/src/lib/api/gymApp.ts` (or a new `aiCoach.ts` in admin: `getAiUsage()`, `setAiLimits(daily, monthly)`), `g-fitness-admin/src/pages/GymApp.tsx` (new card), `corefitness-platform/src/lib/insight.ts` (`USAGE_FEATURES` gains `{ key: 'coach', label: 'AI coach' }`; `aiUsage(days)`), `corefitness-platform/src/pages/Usage.tsx` (a spend tile and per-gym spend in the table or a tooltip), checks `scripts/admin-coach-usage-check.js` (new) and extend `scripts/platform-insight-check.js`.

- [ ] **Step 1: Your app card "AI coach"** (shown only when the gym's `assistant` module exists in its modules list — follow how the card reads modules): two number fields "Messages per member per day" and "Messages for the whole gym per month" with Save (owner only; the desk sees the values read-only), the month's totals as `StatTiles`-style tiles — "Messages this month", "Members using it", "Today", "Estimated cost" (`$0.0000` to 2 decimals, `<$0.01` when under a cent) with the note "Estimated at Claude Sonnet 5.5's list price. Your real bill is on console.anthropic.com." — and a small per-day bar row for the month (reuse the admin's existing chart/sparkline pattern if one exists; otherwise simple divs with heights; no new chart library). Copy that never names a member. If `gym_ai_usage()` is missing (0147 not pasted), the card says "This needs migration 0147." and shows nothing else (CLAUDE.md: a failed section says so).
- [ ] **Step 2: Platform Usage:** the `coach` column appears automatically via `USAGE_FEATURES`; add a tile "AI coach spend (N days)" = sum of `platform_ai_usage(days).est_cost_usd` as `$x.xx`, with a tooltip listing the top gyms by spend; the gym row's coach cell tooltip shows its estimated spend.
- [ ] **Step 3: Checks.** `admin-coach-usage-check.js` (copy `admin-switches-check.js`'s setup): owner sees the card, edits limits and Save sends `set_ai_coach_limits` with both numbers; tiles show the fixture totals and the formatted cost; the per-day row renders the month's days; the desk role sees read-only values (no Save); with `gym_ai_usage` returning a 404 the card says "This needs migration 0147."; no member name or id from the fixture appears anywhere in the card. Extend `platform-insight-check.js`: the coach column and the spend tile. Register the new check in `scripts/ci/ui-checks.json` with `sed`. `npx tsc -b` in admin and platform; eslint; run the checks (admin :5174, platform :5175).
- [ ] **Step 4: Commit** `Your app shows the coach's limits, usage and estimated cost; the platform sees coach spend per gym` + Co-Authored-By.

---

### Task 3: Bookkeeping and the sweep

- [ ] probe row 0147; SystemHealth `LAST = 147`; CLAUDE.md Roadmap clause for 0147 (≤ 199 lines, in place); `docs/AI_INTEGRATION.md`: where the owner sets limits and sees usage/cost and what it never shows; the spec's Phase 5 marked done (the AI coach is complete); `.github/workflows/ci.yml` unchanged unless a new SQL file was added.
- [ ] Full sweep (4 builds, eslint, 3 audits, accent-contrast, ai-coach-core, every SQL file, every UI check). Commit.
