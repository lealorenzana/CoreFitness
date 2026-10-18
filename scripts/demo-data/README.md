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
