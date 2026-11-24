# Demo data

**For a filled gym to test with, use [`scripts/fresh-start/`](../fresh-start/README.md)** —
it builds Core Fitness Lab (Gym #1) with four sign-ins on today's schema.

What is left here:

| File | What it is |
|---|---|
| `remove-demo-data.sql` | Calls `remove_demo_data()` (0117/0168): removes every row with a demo id (`5eed…`). The platform app's Platform screen does the same with a typed confirmation. |
| `part3/` | One member's two-year history, written for G Fitness and lealorenzanaa@gmail.com — both gone since the 2026-10-18 fresh start, so pasting it adds nothing. Kept because `scripts/sql/demo-part3.mjs` tests it and `scripts/fresh-start/3–5` are generated from it. |

The original seeds (parts 1 and 2) no longer load on today's schema. Part 1 lives on as a
test fixture in `scripts/sql/fixtures/` (never paste it); part 2 was removed on 2026-10-18.

**`lab-switch-members.sql`** (Part G, 2026-11-01) — paste once after migration 0229. Makes *Core Fitness Lab 2* (hidden, never billed, code LABTWO) owned by the Lab's owner login, and moves two of the Lab's made-up members through a real gym switch (one done, one waiting at the desk), so switching can be tried. Remove demo data takes the made-up members away; Lab 2 stays until deleted.

**`lab-populate.sql`** (2026-11-24) fills Core Fitness Lab's empty and stale pages (current terms and receipts, two weeks of check-ins and shop sales, End of day closeouts, coaching requests and the week ahead, class bookings and a waitlist, coach check-ins, equipment reports, notes, goals, freeze/cancel requests, referrals, testimonials, coach credentials, coaching prices, time slots). Ids `5eed9…`; re-runnable; dates follow the day it runs. **`lab-populate-remove.sql`** takes it all out (Remove demo data misses the gym-level rows).

**`lab-defense.sql`** (2026-11-24, defense day) fills what `lab-populate.sql` left at zero: 6 members waiting for approval, gym switches both ways with Lab 2, streak restores, cash taken out of the drawer, personal records from logged sets, weekly repeat bookings, a published waiver (with PAR-Q answers, a few flagged) and house rules signed by members and the demo logins, an AI top-up and its credits, and the next morning's check-ins, coach check-ins and payments. Ids `5eed8…`; new people `5eed0001-…-0000000000{41..48}` with seed emails, so Remove demo data takes them.
