# Membership Policy — freezing, cancellation and refunds

**Status: a proposal for the gym to approve, not a decision already taken.**
The percentages and limits below are seeded by migration `0070` into a table the
admin can edit. Nothing here is hardcoded in either app.

This document and `refund_rules` must be changed together. A policy the system
enforces but nobody can read is the failure mode this file exists to prevent —
the same one that made migration 0041 necessary.

---

## Why the policy has to exist at all

Before `0070` the honest answer to "do I get a refund?" was: *the gym decides at
the desk, differently each time, with nothing written down.*

That is a problem for three separate people:

- **The member** cannot know what they are agreeing to when they pay.
- **Whoever is at the desk** has to invent an answer under pressure and defend
  it, and two staff will invent different ones.
- **The gym** has no record of what was promised, so a dispute three weeks later
  is one person's memory against another's.

The panel asked for this to be defined and reflected in the system. It now is,
in both directions: the rules are data, and every refund records the rule it was
computed from.

---

## The rules

### Cancellation and refunds

| Situation | Refund | Reasoning |
|---|---|---|
| Cancelled within **7 days**, has not visited once | **100%** | They bought access and never used it. Keeping the money buys the gym one refund and loses it every referral that member would have made. |
| Cancelled within **7 days**, has visited | **50%** | The service was delivered, partially. Half acknowledges both facts. |
| Cancelled **8–30 days** | **25%** | A month is the unit the gym sells; most of it has been made available. |
| Cancelled **after 30 days** | **None.** Unused whole months may be **frozen** instead | Past this point the sale is complete. Freezing gives back the thing they actually want — time — without the gym refunding a month it held open for them. |
| Medical, with documentation | **Admin discretion**, any amount, reason required | A rule that cannot bend breaks. This one bends *on the record*: the amount, the reason and who approved it are all stored. |

**Day counting starts from `memberships.start_date`,** not from the payment
date, and is computed in Manila time. Those are different days for anyone who
paid in advance, and using the wrong one moves people across the 7-day
boundary in the gym's favour, which is exactly the kind of quiet unfairness
nobody notices until someone checks.

**"Has visited" means at least one `attendance` row on or after the start date.**
Not a self-report, and not "did they collect their QR code".

### Freezing

| Rule | Value | Reasoning |
|---|---|---|
| Freezes per calendar month | **2** | A calendar month, not a rolling 30 days — "twice a month" is what the gym says out loud, and a rolling window would refuse a freeze on the 1st because of one on the 3rd of the month before. |
| Longest single freeze | **30 days** | Beyond this it needs an admin, not the front desk. |
| Total frozen days per year | **60** | Without a ceiling a membership could be frozen and simply never unfrozen — a cancellation the gym never recorded and the member never agreed to. |
| Reason | **Required** | For freezing and for cancelling. An unfreeze needs none. |

An admin can override the monthly count. The front desk cannot. That asymmetry
is enforced in SQL (`trg_membership_event_guard`, migration 0057), not in the
form — so it holds no matter which screen the write comes from.

### What the member is told

- The **quote** is shown before the cancellation is confirmed, with the rule
  that produced it. A number with no reason is not something anyone can accept
  or dispute.
- If **no rule matches**, the system says *"an admin decides"* and does **not**
  say 0%. Those are different answers and must never be shown as the same one.
- The refund is a **cash transaction recorded at the desk**. This gym is
  cash-only by design; nothing in the system moves money, and it does not
  pretend to.

---

## What the plans are, and what the tiers mean

The gym sells three (migration 0060):

| Plan | Tier | Duration | What it is for |
|---|---|---|---|
| **Free Trial** | `freemium` | 30 days | A real trial, granted automatically on approval. |
| **Free Plan** | `free` | Non-expiring | The floor. Exists so somebody who cannot pay is still a member. |
| **Premium** | `premium` | 30 days | The paid tier, with a monthly personal-training allowance. |

`Pro` exists as an enum value and no longer as a sellable plan — Postgres cannot
drop an enum value, so both apps keep it in `PlanTier` and the tier option is
shown only while editing a plan already on it (0060, 0063).

**What each plan unlocks is not the tier.** It is `plan_features` (0049), a
plan × feature matrix the admin edits, resolved by `plan_allows()` — the same
function RLS calls, so the screen and the database cannot disagree. The tier is
a label; the matrix is the rule.

**The free workout library is never gated.** It exists *for* members who cannot
pay. Only the assistant's model escalation is gated, never the rule table.

---

## The basis for these numbers

Stated plainly, because a capstone panel will ask where they came from.

**What they are actually derived from:**

1. **The gym's own constraint.** Cash-only, single location, small roster. A
   refund is money physically handed back from a till, so a policy with many
   fine gradations is one the desk cannot execute.
2. **The structure of what is sold.** The unit is a month. The tiers follow the
   proportion of that month the member has had access to — which is why the
   boundaries are 7 and 30 days and not arbitrary figures.
3. **A cooling-off period is the common shape** for prepaid consumer services,
   and 7 days is the most widely used length. The distinction between "used it"
   and "did not" is what makes it fair in both directions.

**What they are *not* derived from:** a specific published study of gym refund
policy. I have not read one, and I am not going to attach a citation to these
numbers that I cannot vouch for. A fabricated reference in a capstone is worse
than an honest "this is reasoned from the business, not from the literature".

**If a literature basis is required for the manuscript**, these are the real
places to look, and each needs to be read and cited properly rather than taken
from this list:

- Philippine **Consumer Act (RA 7394)** and DTI issuances on prepaid services —
  the binding legal floor, and the one that actually matters. Check whether it
  constrains any of the above; if it does, the law wins and this table changes.
- **IHRSA** industry reports on membership retention and attrition — the trade
  body most cited on gym churn.
- Academic work on **freemium conversion** and on **subscription cancellation
  and win-back**, in information-systems and marketing venues.
- Consumer-protection guidance on **cooling-off periods** for prepaid services
  in comparable jurisdictions.

Ask a supervisor or librarian to confirm the specific sources. Do not cite
anything from this file as if it were a reference — it is a search plan.

---

## Where this is enforced

| Rule | Enforced by |
|---|---|
| Reason required to freeze or cancel | `trg_membership_event_guard` (0057) |
| Two freezes per calendar month | `freezes_this_month()` (0057) |
| Frozen days in the last year | `frozen_days_last_year()` (0070) |
| Refund percentage | `refund_quote()` (0070) |
| Refund actually given | `membership_events.refund_amount` / `refund_percent` / `refund_rule` (0070) |
| Reason required to suspend an account | `set_account_status()` (0069) |

The rule text is **copied onto the event row**, not joined to `refund_rules`.
Editing the policy next year must not rewrite what a member was told last year.


---

## Editing and retiring a plan — the mechanics

**Postgres cannot drop an enum value.** `'pro'` therefore survives in `plan_tier` and in both
apps' `PlanTier` type even though the Pro plan was retired (0060, 0063). The tier `<option>` is
rendered **only while editing a plan already on that tier** — without that condition the
`<select>` has no matching option and silently rewrites the plan to Free on save.

**Retiring is `is_active = false`**, which is correct while any membership still points at the
plan: `memberships.plan_id` has no cascade.

**Deleting is `retire_plan()` (0062, fixed in 0063), never a bare `delete`.** It moves every
membership — *whatever its status*, not only the active ones — to the free tier in one
transaction. A bare delete raised a foreign-key violation.

**Count members with `plan_member_counts()`.** The client-side tally counted only
`status = 'active'`, so a plan somebody was on read **"Active Members 0"** — and the delete guard
believed it.

## What a plan unlocks

Not the tier. `plan_features` (0049) is a plan × feature matrix the admin edits, resolved by
`plan_allows()` — **the same function RLS calls**, so the screen and the database cannot drift.

- **A plan may never have a missing cell.** An insert trigger seeds every one, and **that seeding
  CASE needs an `else`**: three branches returned NULL into a NOT NULL column, so adding a tier
  failed on its own trigger (0057).
- **Gates lock and explain, never hide**, worded from the `features` row that denied it.
- **Never gate the free workout library (0019)** — it exists *for* members who cannot pay. Only
  the assistant's model escalation is gated, never the rule table.
