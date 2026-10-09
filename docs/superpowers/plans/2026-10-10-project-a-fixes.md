# Project A — Fixes across all apps — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One date rule enforced on every picker and in SQL, page numbers on every history list, Trainers + Credentials merged, shop photos + tooltips, the progress-photos switch made visible, and win-back sends capped and grouped.

**Architecture:** A pure `dateRules.ts` (byte-identical in admin, member, platform) turns a `mode` into `{min,max}`; each app's one picker takes a required `mode`. A 0171 migration adds BEFORE triggers that refuse dates outside the same windows. Lists page through a shared hook per app (client slice where the list is already loaded small, `range()` + exact count where it is a history table).

**Tech Stack:** React 19, Vite, TS, Tailwind v3 (admin) / v4 (member) / plain CSS (platform), Supabase Postgres, pglite harness, Playwright fixture checks.

**Spec:** `docs/superpowers/specs/2026-10-10-gym-workflows-redesign-design.md` (section A)

## Global Constraints
- Dates are `'YYYY-MM-DD'` from `utils/dates.ts` `todayKey()` (Manila local), never `toISOString()`.
- Modes: `future` = today … today+2y · `record` = a stated window back, never future · `history` = gym's first day … today · `birth` = 120 years back … today − min age (default 16).
- Pages of 20, numbered, with "N things · page X of Y".
- An unused import fails the build; run `npm run build` + `npx eslint <changed files>` per app.
- Every migration: `migration_0171_applied()`, `scripts/sql/verify/verify0171.sql`, probe entry, `LAST = 171`, CI suite.
- RLS is the boundary; a zero-row write is guarded with `assertWrote()`.

## File map
| File | Responsibility |
|---|---|
| `g-fitness-admin/src/lib/dateRules.ts` (+ identical member, platform copies) | mode → bounds, `clampToBounds`, `explain` hint |
| `scripts/date-rules-check.mjs` | unit checks + byte-identical check of the three copies |
| `scripts/audit-dates.py` | fails on a raw `type="date"`/`type="month"` or a picker without `mode` |
| admin `components/ui/DatePicker.tsx` | required `mode`, bounded month/year navigation, hint line |
| member `components/ui/DateField.tsx` (new) | sheet calendar in Nocturne using dateRules |
| platform `components/DatePicker.tsx` (new) | same calendar, platform CSS |
| `supabase/migrations/0171_date_windows_and_winback_cap.sql` | date triggers + win-back cap |
| `scripts/sql/date-windows.mjs` | pglite suite for 0171 |
| member `hooks/usePagedQuery.ts` + `components/ui/Pager.tsx` | server paging for member histories |
| admin `pages/Trainers.tsx`, `components/ui/TrainerDetailDrawer.tsx` | credentials merged in |
| admin `pages/Shop.tsx`, member `pages/ShopMenu.tsx` | product photo + tooltips |
| admin `pages/Activity.tsx` | grouped win-back line |

---

### Task 1: `dateRules.ts` + checks

**Files:** Create `g-fitness-admin/src/lib/dateRules.ts`, copy to `g-fitness-member/src/lib/dateRules.ts` and `corefitness-platform/src/lib/dateRules.ts`; create `scripts/date-rules-check.mjs`.

**Interfaces — Produces:**
`type DateMode = 'future' | 'record' | 'history' | 'birth'`;
`dateBounds(mode, opts?: { today?: string; backDays?: number; earliest?: string; minAge?: number; aheadDays?: number }): { min: string; max: string }`;
`withinBounds(value: string, b: {min:string;max:string}): boolean`; `boundsHint(mode, b): string`.

- [ ] **Step 1: write the check first** — `scripts/date-rules-check.mjs` imports the admin copy via `node --experimental-strip-types` and asserts:
```js
import { readFileSync } from 'node:fs';
const R = process.argv[2];
const { dateBounds, withinBounds } = await import(`${R}/g-fitness-admin/src/lib/dateRules.ts`);
const t = '2026-10-10'; let bad = 0;
const eq = (l, a, b) => { const ok = JSON.stringify(a) === JSON.stringify(b); console.log(`${ok ? 'ok  ' : 'FAIL'}  ${l}`); if (!ok) { bad++; console.log('   got', a, 'want', b); } };
eq('future: today … +2y', dateBounds('future', { today: t }), { min: '2026-10-10', max: '2028-10-10' });
eq('record: 30 days back, never future', dateBounds('record', { today: t, backDays: 30 }), { min: '2026-09-10', max: '2026-10-10' });
eq('record: never before earliest', dateBounds('record', { today: t, backDays: 30, earliest: '2026-10-01' }), { min: '2026-10-01', max: '2026-10-10' });
eq('history: earliest … today', dateBounds('history', { today: t, earliest: '2025-06-01' }), { min: '2025-06-01', max: '2026-10-10' });
eq('birth: 120y … today − 16y', dateBounds('birth', { today: t }), { min: '1906-10-10', max: '2010-10-10' });
eq('birth: min age 18', dateBounds('birth', { today: t, minAge: 18 }).max, '2008-10-10');
eq('2002 is not a future date', withinBounds('2002-05-01', dateBounds('future', { today: t })), false);
eq('leap day birth max', dateBounds('birth', { today: '2028-02-29' }).max, '2012-02-29');
const copies = ['g-fitness-admin', 'g-fitness-member', 'corefitness-platform'].map((a) => readFileSync(`${R}/${a}/src/lib/dateRules.ts`, 'utf8'));
eq('three copies are byte-identical', copies.every((c) => c === copies[0]), true);
process.exit(bad ? 1 : 0);
```
- [ ] **Step 2:** `node --experimental-strip-types scripts/date-rules-check.mjs "$PWD"` → FAIL (module missing).
- [ ] **Step 3: implement** `dateRules.ts`:
```ts
/** One rule for every date picker (spec A1). Pure; identical in admin, member and platform. */
export type DateMode = 'future' | 'record' | 'history' | 'birth';
export interface DateBounds { min: string; max: string }
export interface BoundOpts { today?: string; backDays?: number; earliest?: string; minAge?: number; aheadDays?: number }

const pad = (n: number) => String(n).padStart(2, '0');
const parts = (k: string) => k.split('-').map(Number) as [number, number, number];
const fmt = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
function localToday(): string { const d = new Date(); return fmt(d.getFullYear(), d.getMonth() + 1, d.getDate()); }
function addDays(k: string, n: number): string { const [y, m, d] = parts(k); const x = new Date(y, m - 1, d + n); return fmt(x.getFullYear(), x.getMonth() + 1, x.getDate()); }
/** Same month/day N years earlier; 29 Feb falls back to 28 Feb in a non-leap year. */
function addYears(k: string, n: number): string {
  const [y, m, d] = parts(k); const ty = y + n; const last = new Date(ty, m, 0).getDate();
  return fmt(ty, m, Math.min(d, last));
}
const later = (a: string, b: string) => (a > b ? a : b);

export function dateBounds(mode: DateMode, o: BoundOpts = {}): DateBounds {
  const today = o.today ?? localToday();
  switch (mode) {
    case 'future': return { min: today, max: o.aheadDays ? addDays(today, o.aheadDays) : addYears(today, 2) };
    case 'record': { const back = addDays(today, -(o.backDays ?? 30)); return { min: o.earliest ? later(back, o.earliest) : back, max: today }; }
    case 'history': return { min: o.earliest ?? addYears(today, -5), max: today };
    case 'birth': return { min: addYears(today, -120), max: addYears(today, -(o.minAge ?? 16)) };
  }
}
export const withinBounds = (v: string, b: DateBounds) => v >= b.min && v <= b.max;
export function boundsHint(mode: DateMode, b: DateBounds): string {
  if (mode === 'future') return 'From today';
  if (mode === 'birth') return 'Your date of birth';
  return `Between ${b.min} and ${b.max}`;
}
```
- [ ] **Step 4:** copy the file byte-for-byte to member and platform; rerun → all `ok`.
- [ ] **Step 5:** add `node --experimental-strip-types scripts/date-rules-check.mjs "$PWD"` to `.github/workflows/ci.yml` beside the accent-contrast step; commit `Date rules: one module, three identical copies`.

### Task 2: Admin picker takes a mode; every admin date input uses it

**Files:** Modify `g-fitness-admin/src/components/ui/DatePicker.tsx`; replace inputs in `components/GymGoalSection.tsx:147,149`, `components/PayCoreFitness.tsx:128`, `components/shop/ShopSales.tsx:59,61`, `components/ui/CashCloseout.tsx:95`, `components/ui/MemberDetailDrawer.tsx:815`, `components/ui/RecordPaymentModal.tsx:368`, `components/ui/TrainerMonthTotals.tsx:73` (month → DatePicker `history` + `granularity="month"`), `pages/AttendanceHistory.tsx:243,248`, `pages/Challenges.tsx:411,417`, `pages/Events.tsx:555`, `pages/Members.tsx:1253`, `components/members/AddMemberWizard.tsx:159`.

**Interfaces — Consumes:** Task 1. **Produces:** `DatePicker` props `mode: DateMode` (required), `bounds?: BoundOpts`, `granularity?: 'day'|'month'`; `min`/`max` remain as extra narrowing (intersection).

- [ ] **Step 1:** in `DatePicker.tsx` compute `const b = dateBounds(mode, bounds); const lo = min && min > b.min ? min : b.min; const hi = max && max < b.max ? max : b.max;` and use `lo/hi` everywhere `min/max` were used; years list = `Number(lo.slice(0,4))…Number(hi.slice(0,4))`; disable Previous when `view` month < lo's month and Next when > hi's; show `boundsHint(mode, {min:lo,max:hi})` in the footer (12px, muted); `granularity="month"` shows the 12-month grid and emits `YYYY-MM`.
- [ ] **Step 2:** replace each listed input. Modes: GymGoal starts/ends `future` (ends `min` = starts); PayCoreFitness paidOn `record` `{backDays: 31}`; ShopSales from/to `history` `{earliest: gym first day}`; CashCloseout `record {backDays: 7}`; MemberDetailDrawer & RecordPaymentModal paidOn `record {earliest: max(1st of month, member joined)}`; TrainerMonthTotals `history` month; AttendanceHistory `history`; Challenges starts/ends `future`; Events `future`; Members (DOB) & AddMemberWizard `birth {minAge: gym min age ?? 16}`. Gym first day = `gyms.created_at` via the existing `useGym()` context (add `createdOn` to it if absent).
- [ ] **Step 3:** `scripts/audit-dates.py` — walk `*/src/**/*.tsx` in the four apps; fail on `type="date"`, `type="month"`, `type="datetime-local"`, `type: 'date'`, or `<DatePicker`/`<DateField` without `mode=`. Run → passes for admin, fails for member/platform until Tasks 3–4.
- [ ] **Step 4:** add a fixture check `scripts/admin-dates-check.js` (Playwright, admin app, existing fixture pattern from `admin-checkin-check.js`): open Challenges → New, open the starts picker, assert the year list has no year < 2026 and day 1 of last month is disabled; open Members → a DOB picker and assert the first year is today−120 and the last today−16. Register in `scripts/ci/ui-checks.json`.
- [ ] **Step 5:** `npm run build && npx eslint` (admin), run the check, commit `Admin calendars: future by default, bounded years, mode required`.

### Task 3: Member `DateField`

**Files:** Create `g-fitness-member/src/components/ui/DateField.tsx`; modify `components/rooms/AssignSheet.tsx:112` (`future`), `components/ui/CredentialsSection.tsx:168` (issued: `record {backDays: 3650}`), `:171` (expires: `future`), `pages/progress/tabs/GoalsTab.tsx:194` (`future`), `pages/ProgressPhotos.tsx:102` (`record {backDays: 365}`), `pages/trainer/TrainerSchedule.tsx:332` (`future`); `components/ui/BirthDateField.tsx` year list from `dateBounds('birth', {minAge})`.

**Interfaces — Produces:** `<DateField value onChange mode bounds? label? />` emitting `YYYY-MM-DD` or `''`.

- [ ] **Step 1:** build `DateField`: a `TextInput`-styled button showing the formatted date; tapping opens a `GlassSheet` with a month grid (same cell logic as admin `DatePicker`), month/year header limited to bounds, today ringed amber (`--color-secondary`), selected violet, disabled cells at 35% opacity, `boundsHint` under the grid, Clear and Today. Wrapper `pointerEvents` rule from CLAUDE.md (always-mounted root owns `pointerEvents`). Type floor 12px.
- [ ] **Step 2:** replace the six inputs; BirthDateField keeps its three selects (spec: birth uses selects) but its years run `min…max` from `dateBounds('birth', { minAge })`.
- [ ] **Step 3:** fixture check `scripts/member-dates-check.js`: Goals → Add target → open date → no year before today; Progress photos → taken-on cannot pick tomorrow. Register in `ui-checks.json`.
- [ ] **Step 4:** build + lint member, `python scripts/audit-dates.py` (member now clean), commit `Member calendars: DateField with the same rule`.

### Task 4: Platform picker

**Files:** Create `corefitness-platform/src/components/DatePicker.tsx` (port of admin's, plain CSS classes added to `src/index.css`: `.dp`, `.dp-grid`, `.dp-cell`); modify `components/GymDocuments.tsx:59` (`history`), `components/PaymentClaims.tsx:115` (`future`), `pages/Activity.tsx:90,91` (`history`), `pages/Announcements.tsx:102` (`future`), `pages/GymProfile.tsx:131` (`future`), `pages/Gyms.tsx:271` (dialog field type `'date'` → render `DatePicker mode="future"`), `pages/Money.tsx:275` (`record {backDays: 62}`), `:280,:285` (`history` / `future`).

- [ ] **Step 1:** port the component (same props as admin's) with platform CSS.
- [ ] **Step 2:** replace the inputs above.
- [ ] **Step 3:** build platform, `python scripts/audit-dates.py` → clean in all four apps; add the audit to CI next to `audit-routes.py`; commit `Platform calendars: same picker, same rule`.

### Task 5: Migration 0171 — dates refused in SQL + win-back cap

**Files:** Create `supabase/migrations/0171_date_windows_and_winback_cap.sql`, `scripts/sql/verify/verify0171.sql`, `scripts/sql/date-windows.mjs`; modify `scripts/probe-migrations.py`, `corefitness-platform/src/lib/migrations.ts` (`LAST = 171`), `.github/workflows/ci.yml` (suite `date-windows`).

- [ ] **Step 1: test first** — `scripts/sql/date-windows.mjs` (pattern of `push-claim.mjs`), as `authenticated` admin of a test gym: inserting a `challenges` row with `starts_on='2002-01-01'` raises `22008`; `gym_goals` ends before starts raises; `events.starts_at` in the past raises on INSERT but an UPDATE that does not touch it succeeds (old rows untouched); `payments.paid_on` in the future raises and a day before the 1st of this month raises, `workout_logs.performed_on` 31 days back raises and 30 passes; `body_measurements.measured_on` same; `progress_photos.taken_on` tomorrow raises; `member_profiles.date_of_birth` tomorrow and 121 years back raise; `fitness_goals.target_date` past raises; `room_assignments.due_on` past raises; `platform_announcements.ends_at` past raises. Win-back: a second non-manual `winback_sends` for the same member in the same Manila month is skipped (row count stays 1); a member checked in within 7 days gets none; a manual send always goes.
- [ ] **Step 2:** run → FAIL (no triggers).
- [ ] **Step 3:** write the migration. One helper and one trigger per table, firing only when the column is set on INSERT or changed on UPDATE (`tg_op = 'INSERT' or new.col is distinct from old.col`) so existing rows never block an unrelated edit:
```sql
create or replace function assert_date_window(p_value date, p_min date, p_max date, p_what text)
returns void language plpgsql immutable as $$
begin
  if p_value is not null and (p_value < p_min or p_value > p_max) then
    raise exception '% must be between % and %.', p_what, p_min, p_max using errcode = '22008';
  end if;
end $$;
```
Windows (Manila today = `(now() at time zone 'Asia/Manila')::date`, called `d`): challenges/gym_goals starts & ends `d … d+730` and ends ≥ starts; events.starts_at::date `d … d+730`; platform_announcements.ends_at::date `d … d+730`; fitness_goals.target_date & room_assignments.due_on `d … d+730`; payments.paid_on `date_trunc('month', d)::date … d`; gym_payments.paid_on `d-62 … d`; workout_logs.performed_on & body_measurements.measured_on `d-30 … d`; progress_photos.taken_on `d-365 … d`; member_profiles.date_of_birth `d - 120 years … d`; trainer_credentials.issued_on `d-3650 … d`, expires_on `d … d+3650`.
Win-back: `create or replace function winback_cap() returns trigger` (BEFORE INSERT on `winback_sends`, `security definer`) returning NULL when `new.rule_key <> 'manual'` and (a non-manual send exists for `(gym_id, member_id, month)` or an attendance row exists for the member in the last 7 days — table/column confirmed with `\d attendance` in the harness). Marker `migration_0171_applied()`.
- [ ] **Step 4:** rerun suite → all ok; run `replay-migrations.mjs`, `retention.mjs`, `tenancy-isolation.mjs` → still pass.
- [ ] **Step 5:** verify file (REPORT: triggers present, `assert_date_window` exists, cap trigger present, marker), probe entry, `LAST`, CI; commit `0171: date windows in SQL, one win-back per member per month`.

### Task 6: Pagination — member

**Files:** Create `g-fitness-member/src/hooks/usePagedQuery.ts`, `components/ui/Pager.tsx`; modify `pages/AttendanceHistory.tsx`, `VisitHistory.tsx`, `PaymentHistory.tsx`, `WorkoutHistory.tsx`, `NotificationsAll.tsx`, `AccountActivity.tsx`, `RewardRequests.tsx`, `BookingHistory.tsx`, `CoachNotes.tsx`, `trainer/TrainerBookings.tsx`, and the matching `lib/api/*` list functions to accept `{ from, to }` and return `{ rows, total }`.

**Interfaces — Produces:**
```ts
export function usePagedQuery<T>(key: string, fetchPage: (from: number, to: number) => Promise<{ rows: T[]; total: number }>, perPage = 20):
  { rows: T[]; total: number; page: number; pages: number; setPage: (p: number) => void; loading: boolean; error: unknown }
```
`<Pager page pages total noun onPage />` renders `‹ 1 2 … 17 ›` and "321 visits · page 1 of 17"; page lives in the URL (`useUrlState('page')`) so Back returns to it.

- [ ] **Step 1:** fixture check `scripts/member-paging-check.js`: route `/rest/v1/attendance*` to return 20 rows with `Content-Range: 0-19/321`; open `/member/attendance-history`; assert "page 1 of 17", 20 rows, tap 2 → request carries `Range: 20-39`, Back → page 1. → FAIL.
- [ ] **Step 2:** implement hook (fetch with `.range(from, to)` and `{ count: 'exact' }`; ignore stale responses by request id) and `Pager` (noc styles, violet current page, 44px tap targets).
- [ ] **Step 3:** convert the pages; each api function adds `.range(from, to)` and `count: 'exact'`.
- [ ] **Step 4:** check passes; build + lint; commit `Member histories page by 20`.

### Task 7: Pagination — admin and platform

**Files:** admin `pages/Members.tsx`, `Payments.tsx`, `AttendanceHistory.tsx`, `Activity.tsx`, `Retention.tsx`, `Invitations.tsx`, `components/shop/ShopSales.tsx`, renewal requests list (`components/ui/RenewalRequests*.tsx`), `WinbackMessages.tsx` sent list; platform `pages/Applications.tsx`, `Support.tsx`, `Money.tsx` (receipts, claims), `Usage.tsx`.

- [ ] **Step 1:** fixture check `scripts/admin-paging-check.js`: Payments with 45 fixture rows shows `1–20 of 45` and 3 page buttons; Activity likewise.
- [ ] **Step 2:** lists already loaded in full and bounded (Members ≤ plan limit) use existing `usePaged(items, 20)` + `Pagination`; unbounded histories (Payments, AttendanceHistory, Activity, ShopSales, platform Money/Usage/Support/Applications) fetch by `range()` + exact count with a small `usePagedFetch` hook in each app mirroring Task 6's signature.
- [ ] **Step 3:** `scripts/audit-lists.py`: flags `.from('<history table>').select(` in `lib/api` without `.range(` or `.limit(` for tables: attendance, payments, activity_log, notifications, workout_logs, point_ledger, shop_sales, gym_payments, support_messages. Add to CI.
- [ ] **Step 4:** build + lint admin and platform; checks pass; commit `Admin and platform histories page by 20`.

### Task 8: Trainers + Credentials in one page

**Files:** Modify `g-fitness-admin/src/pages/Trainers.tsx`, `components/ui/TrainerDetailDrawer.tsx`, `components/layout/Sidebar.tsx:110,193,214`, `App.tsx:121`; move the review viewer out of `pages/Credentials.tsx` into `components/trainers/CredentialReview.tsx`; delete `pages/Credentials.tsx`.

- [ ] **Step 1:** fixture check `scripts/admin-trainers-credentials-check.js`: a trainer with 2 pending credentials shows a "Needs review · 2" badge; opening the drawer shows a Credentials section with both files and Verify/Reject; Verify calls the existing review RPC; `/credentials` redirects to `/trainers?review=1`, which filters to trainers with pending items; the sidebar has no Credentials row. → FAIL.
- [ ] **Step 2:** extract the viewer (file preview, arrow keys, decision + reason) into `CredentialReview.tsx` unchanged in behaviour; the drawer renders it filtered to that trainer; card badge from a per-trainer count of `trainer_credentials` with `status = 'pending'` (plus "Expired" when only expired ones remain, "Verified" when all are verified).
- [ ] **Step 3:** route `credentials` → `<Navigate to="/trainers?review=1" replace />`; remove the sidebar row and update the People group blurb to "Members, invitations and coaches".
- [ ] **Step 4:** check passes; `python scripts/audit-routes.py` and `audit-dead-code.py` clean; build + lint; commit `Trainers and their credentials on one page`.

### Task 9: Shop photos and tooltips

**Files:** Modify `g-fitness-admin/src/pages/Shop.tsx` (product form photo upload; tooltips), member `pages/ShopMenu.tsx`, desk sale list; migration piece in 0171: `alter table products add column if not exists photo_path text` and `reserve_gym_photo()` accepts a `'shop'` prefix (path `media/gyms/<gym>/shop/<uuid>`), storage policy unchanged (0120 path rule).

- [ ] **Step 1:** add to `scripts/sql/shop.mjs`: an owner can set `photo_path` on their product; a desk user cannot change it; another gym cannot read it.
- [ ] **Step 2:** product form: square photo picker (reserve slot → upload → save path), preview, remove; product rows show a 40px thumbnail; member menu shows a 64px photo, a neutral placeholder icon when none.
- [ ] **Step 3:** tooltips (`data-tip`) on: Stock ("Changes only through sales, restocks and corrections — never typed over"), Void ("Same day only, before the drawer is closed"), Out of stock ("Members see 'Out of stock', never the count"), Price ("The database's price is what the desk charges"), Restock, Correction.
- [ ] **Step 4:** `shop.mjs` passes; fixture check for the thumbnail; build + lint both apps; commit `Shop: product photos and tooltips`.

### Task 10: Progress-photos switch visible; win-back grouped in the log

**Files:** admin `pages/GymApp.tsx` (Your app → switches), `pages/Activity.tsx`.

- [ ] **Step 1:** Your app lists the `photos` switch under Progress with the line "Members' private progress photos. Turn off if your gym does not want them — existing photos stay with the member." (it exists as a child module; confirm it renders and toggles `gym_modules`; add if hidden).
- [ ] **Step 2:** Activity log: consecutive `winback.sent` entries with the same title on the same Manila day render as one line "Win-back sent to N members · <title>" that expands to the names (also applied on page boundaries by grouping before slicing).
- [ ] **Step 3:** fixture check `admin-winback-log-check.js` (12 sends → one line, expands to 12); `admin-switches-check.js` still passes; commit `Your app shows the photos switch; win-back sends group in the log`.

### Task 11: Ship project A
- [ ] Run all SQL suites touched (`date-windows`, `shop`, `retention`, `tenancy-isolation`, `replay-migrations`), all new and touched fixture checks, the three audits plus `audit-dates.py`, `audit-lists.py`, `date-rules-check.mjs`; build + lint all four apps.
- [ ] Commit, `git push`, deploy member and admin (admin after `npm run build`), and hand the user 0171 + verify0171 to paste.
- [ ] Update CLAUDE.md roadmap (0171 line) and MIGRATION_STATUS.

## Notes deliberately left to their own projects
`meal_notes` (B3), `targets` (B5) and `points` (D4) switches ship with the projects that make them do something — a switch nothing reads is a lie (CLAUDE.md).
