# Coaching house rules — pause, the gym's cut, coach dues

**Status:** queued (owner, 2026-11-06), after the light-mode pass ships. Next migration number at time of writing: 0235.

## Why

The owner showed a real chat between a coach and a client at a gym:

- The client wanted to freeze while away. The coach answered: the **gym membership can freeze, coaching has no pause**, so the coaching days keep running.
- The coach added that **coaches pay the gym a membership too, and 5% to the gym**.

These are a gym's own business rules. Today the system has them nowhere: a coaching term never pauses (no gym can change that, and the member is not told before freezing); nothing records the gym's cut; nothing records what coaches pay the gym. The owner's goal: every gym can make Core Fitness work the way their gym already works, set when they onboard.

## What exists (do not rebuild)

- `0181_coaching.sql`: how a member gets a coach (`coaching_modes`), term lengths (`coaching_lengths`), who is paid (`coaching_fee_mode`: `included` / `gym_priced` / `trainer_direct`), the `coachings` rows and their end date, stand-ins.
- Freeze and cancel: a member asks, the desk does it (0118); frozen days are credited back to the membership expiry; `refund_quote()`.
- Admin onboarding: `g-fitness-admin/src/pages/Setup.tsx` has a step **"How coaching works"** (`key: 'coaching'`). Settings has the same section.

## The three rules (owner's decisions)

All three are **switches the owner sets in Setup → How coaching works**, and can change later in Settings. Every one defaults to the behaviour that exists today, so no gym's behaviour changes until its owner says so.

### 1. Does coaching pause when the membership freezes? — the gym chooses

`gym_settings.coaching_pause`: `never` (today; G Fitness) · `with_membership` · `coach_decides`.

- `never`: freezing changes the membership only. **The member is told before they ask to freeze**: "Your coaching with Coach X keeps running until <date> — it does not pause."
- `with_membership`: when a freeze is granted (the trigger on `membership_events`), each active coaching term's end date moves by the frozen days, the same way the membership's expiry does. Unfreezing early credits only the days actually frozen.
- `coach_decides`: the freeze request also asks the member's coach; the coach's Today shows "Lea is freezing 14 days — pause her coaching?" Yes moves the end date; No leaves it. The member is told which.
- Shown in: the member's freeze screen (before asking), the member's Terms (this gym's rule, read from settings, never typed), the coach's trainee page, the admin member drawer.

### 2. The gym's cut of coaching — a switch and a percent, tracked per coach

`gym_settings.coaching_cut_on boolean default false`, `coaching_cut_percent numeric(4,1)` (0–50).

- Applies when members pay the coach directly (`trainer_direct`). With `gym_priced` the gym already holds the money, so the switch is hidden.
- Computed, never stored as a balance: for each coach and month, **paid for coaching** = the coaching payments the coach marked Received; **owed to the gym** = that × percent. A settlement row (`coach_cut_settlements`: coach, month, amount, marked paid by, when) records each payment. Written only by a definer function; no INSERT policy.
- The coach sees it on their Packages page: this month, paid to you, the gym's share, settled or not. The owner sees every coach on one page (Personal training → a new "Coach earnings" view, or the Trainers page) and marks a month settled. The app never moves money.

### 3. Coach dues — a switch and an amount

`gym_settings.coach_dues_on boolean default false`, `coach_dues_amount numeric`, `coach_dues_every text` (`month`).

- The desk records a coach's dues payment like a member payment (cash, the `payments` table or a sibling, with an invoice number from the same counter). A coach who is behind is **flagged to the owner** (Dashboard → Needs you, and the Trainers page). **No lockout**: a coach behind on dues still checks in and coaches.
- The coach sees their own dues status in the You sheet.

## Onboarding (the owner's emphasis)

Setup → **How coaching works** gains three short questions, each with the gym's real wording shown back:

1. "When a member freezes, does their coaching pause?" — Never / With the membership / The coach decides.
2. "Do coaches give the gym a share of what members pay them?" — No / Yes, __ %.
3. "Do coaches pay the gym to train there?" — No / Yes, ₱__ a month.

Same three in Settings. Each answer switches that part of the app on or off, like the "What you run" step.

## Rules that carry over

- Gates lock and explain, never hide; copy is a claim (numbers read from settings, never typed); the legal pages change in the commit that changes the rule (member Terms: freezing and coaching; the platform's Terms for gyms if it mentions coaching money).
- A member feature is not done until admin and coach can see it (CLAUDE.md).
- New definer functions revoked from public/anon; a harness in `scripts/sql/`, a probe entry, CI list, ROADMAP + CLAUDE.md lines.

## Left to the builder

- Exact page placement of the owner's "Coach earnings" view (Personal training tab vs Trainers page): pick whichever fits the fit-screen rule.
- Whether coach dues share the `payments` table (with a `coach_id`) or get a small table of their own: decide from how Payments and the invoice counter are written.
