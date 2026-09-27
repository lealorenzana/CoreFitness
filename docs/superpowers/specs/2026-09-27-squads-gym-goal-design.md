# Squads and the gym-wide goal — design

**Date:** 2026-09-27 · **Status:** built — SQL, member, admin and trainer; pasted by hand · **Migration:** 0124 · **Roadmap:** piece 3 of 5

## Decisions made in conversation

| Question | Decision |
|---|---|
| A squad's weekly score | **Training days** — distinct Manila days each member checked in or logged a workout, summed. The same definition as 0028's badges and 0052's challenges, so no screen disagrees with another. |
| Joining | **A squad code from a friend.** Squads are friend groups; nobody is added by a stranger. |
| Gym goal reward | **Bonus points** to every member who contributed, paid by the database once. |

## Squads

- 3–5 is the intent; the database allows **2 to 5 active members** (a squad of one is a person). One active squad per member per gym.
- `create_squad(name, weekly_target)`: the creator joins; a **6-letter code** unique in the gym is generated. `join_squad(code)` refuses a full squad or a member already in one. `leave_squad()`; the last one out archives the squad.
- **Weekly target** (1–35 days): when the squad's training days this Manila week reach it, `settle_squads()` records the week once (`squad_weeks`, unique per squad per week) and pays **every active member** the gym's `squad_week` rule (30 by default, the gym re-prices it) through the usual ledger key — once. Checks this week and last week, like `settle_challenges`, so a Sunday finish still pays on Monday. Runs on page load (pg_cron optional).
- Privacy: a squad's **code and members** are visible only to its members and the desk. The **squad board** shows squad names, sizes, days and target — never member names.

## Gym-wide goal

- The owner sets a goal: title, metric (`training_days`, `workouts_logged`, `checkins`), target, dates, reward points.
- Progress is **computed** across the gym's active members (never stored). `settle_gym_goals()` marks it reached once and pays `reward_points` to every member who contributed at least one unit in the window, via the ledger (`gym_goal` rule, idempotent per goal).
- Members see the running goal on the Season screen and Today with their own contribution.

## Screens

Member: **Squad** page (`/member/squad`): create / join with code / my squad with each member's days this week and the target bar / leave; squad board. The current gym goal on Season and a Today strip. Admin: **Challenges → Gym goal** card (create, progress, contributors) and a read-only squad list. Trainer: the trainee sheet shows their squad and this week's days.

## Testing

`scripts/sql/squads-goals.mjs` and fixtures; `verify0124.sql`.
