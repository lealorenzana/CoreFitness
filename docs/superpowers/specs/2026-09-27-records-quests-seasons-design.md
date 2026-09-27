# Personal records, weekly quests and monthly seasons — design

**Date:** 2026-09-27 · **Status:** built — 0123 SQL, member, admin and trainer screens; pasted by hand · **Migration:** 0123
**Roadmap:** piece 2 of 5 (after the Content Studio, 0120–0122).

## Decisions made in conversation

| Question | Decision |
|---|---|
| Quests | **Repeating weekly challenges**, not a second system. Challenges already are "a gym-set target over a window, rewarded in points, with standings". |
| What a season tier gives | **A reward the desk hands over**, picked from the gym's existing rewards catalogue. |
| Leaderboards and the PR wall | **Off until the member opts in** (0032's stance: members choose what others see). |

## 1. Personal records

- A set is a PR when it beats the member's best **ever** for that catalogue exercise: heavier `weight_kg`, or for a timed exercise longer `duration_seconds`. Custom (uncatalogued) exercises never count — 0050 keeps them out of every aggregate.
- **The first set of an exercise is the baseline, not a PR.** Otherwise every new member collects a PR per exercise on day one.
- Detected by an `after insert` trigger on `workout_sets` (security definer) — the client cannot claim one, and the offline outbox (sets sent later) is handled because the trigger fires whenever the row arrives.
- Each PR: a `personal_records` row, a notification (`notify_once`, key per PR), and points under a new per-gym rule **`personal_record`** (15 by default; the gym re-prices or switches it off like any rule).
- **Self-logged weights are unverifiable**, so PR *points* are capped at **3 per member per Manila week** (the PR is still recorded and celebrated), and the front desk/owner can **remove** a PR: it is marked removed and its points are reversed by a negative ledger row (same rule, `source_table = 'personal_records_removed'`), so the ledger stays append-only.
- The workout player celebrates the moment a logged set comes back as a PR.
- **PR wall**: this week's PRs in the gym, **opted-in members only**, first name + last initial.

## 2. Weekly quests = repeating challenges

- `challenges.repeats_weekly` and `challenges.parent_id`. A repeating challenge is a **template**: it is never joined itself.
- `roll_weekly_quests()` creates the current Manila week's child challenge (Mon–Sun, same metric/target/reward, `parent_id` = template) if missing, and **enrols every active member** in it (and a member who joins mid-week the next time the sweep runs). Runs on page load like every other sweep here (pg_cron optional).
- Everything after that is the existing machinery, unchanged: `challenge_progress`, `settle_challenges`, standings, and `challenge_complete` points — idempotent per child challenge, so each week pays once.
- Member app: the week's children show as **This week's quests** on the Challenges page; templates never show. Admin: a **Repeat every week** checkbox on the challenge form; the list shows templates, not their weekly copies.

## 3. Monthly seasons

- A season is the **calendar month in Manila**. Season score = `sum(point_ledger.points)` for the month (earning only — spending lives in `reward_redemptions`), so reversals count against it.
- `season_tiers` (per gym, owner-edited): name, points needed, optional reward from `rewards`.
- `claim_season_reward(tier)`: allowed when this month's score ≥ the tier, once per tier per season (`season_claims` unique). Costs no points. The desk sees open claims and marks them handed over — the same shape as a redemption, without spending.
- **Season board**: this month's top 10 opted-in members by score, plus the caller's own rank whether or not they opted in (a private figure is still theirs).

## 4. Opt-in

`member_profiles.show_on_boards boolean default false`, set only by the member (`set_show_on_boards`). Read by the PR wall and the season board — never by the desk, trainer or owner views, which already see their members.

## Screens

- **Member**: a **Season** page (`/member/season`): score and next tier, tiers with Claim, the board with the opt-in switch, this week's PR wall, and a link to quests. Reached from Challenges and Rewards. PR celebration in the player; PRs listed on Progress.
- **Admin**: Rewards page gains **Season tiers** (editor) and **Season rewards to hand over**; Challenges form gains **Repeat every week**; the member drawer lists PRs with **Remove**.
- **Trainer**: the trainee sheet lists recent PRs.

## Testing

`scripts/sql/records-seasons.mjs`: PR baseline/beat/tie, timed PRs, custom exercises ignored, weekly point cap, removal reverses points, gym isolation; rolling a quest twice makes one child and enrols active members only, completion pays once per week; season score, claim once, claim below tier refused, desk hand-over, opt-in hides from boards. Fixtures for the member Season page and the admin tiers/claims. `verify0123.sql`.

## Out of scope

Squads and the gym-wide goal (piece 3), referrals (4), lobby TV (5). Verified PRs (a coach confirming a lift) — possible later on top of the removal path.
