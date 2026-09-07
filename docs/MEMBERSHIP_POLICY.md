# Membership Policy — freezing, cancellation and refunds

**Status: a proposal for the gym to approve, not a decision already taken.**
The percentages and limits below are seeded by migrations `0070`/`0073` into a
table the admin can edit. Nothing here is hardcoded in either app.

**The percentages are a floor, not the rule.** Since 0073 the refund is
`max(pro-rata for the unused term, the percentage below)` less a documented
fee — because the Consumer Act expects pro-rata and a gym may be more generous
than the law but not less. See *The basis for these numbers*.

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
| Cancelled **after 30 days** | **Pro-rata on the unused term** | RA 7394 expects the unused portion back. Freezing is still offered as the better option for someone who intends to return. |
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
| Longest single freeze | **30 days** | Beyond this it needs an admin, not the front desk. *A stored setting with no reader — a freeze here has no end date to check it against.* |
| Total frozen days per year | **60** | Without a ceiling a membership could be frozen and simply never unfrozen — a cancellation the gym never recorded and the member never agreed to. **Shown at the desk, not enforced.** |
| Reason | **Required** | For freezing and for cancelling. An unfreeze needs none. |
| Access while frozen | **None** | Cannot check in, cannot book. A freeze pauses the membership, not attendance alone. |
| Frozen days | **Credited back to the expiry date** | The member is not charged for days the gym denied them — the same reading of a prepaid term that makes the pro-rata refund the lawful one. |

An admin can override the monthly count. The front desk cannot. That asymmetry
is enforced in SQL (`trg_membership_event_guard`, migration 0057), not in the
form — so it holds no matter which screen the write comes from.

**The yearly ceiling is different, and deliberately weaker.** It is displayed in
the freeze dialog — "N of 60 days used this year", with a warning once it is
passed — and nothing refuses on it. Members have been told about the monthly
limit; nobody has ever been told about a yearly one, and a desk cannot defend a
refusal it cannot explain. The four decisions behind this paragraph, including
why frozen days extend the expiry, are recorded in
[TEST_MATRIX](TEST_MATRIX.md#decisions--settled-7-september-2026).

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

Researched September 2026. Every source below was read, not merely listed —
earlier drafts of this file named a "search plan" instead of doing the search,
which was a gap and not a principle.

### The finding that changed the system

**A refund on a prepaid service membership in the Philippines is expected to be
pro-rata for the unused portion**, with only "reasonable and documented"
deductions, under the Consumer Act (RA 7394). A "no refund" clause does not
override that — statutory rights survive the contract, and DTI mediates and can
order refunds and sanctions.

That contradicted the first version of the table above, whose fourth row read
*"cancelled after 30 days — no refund"*. On a 30-day membership cancelled on
day 8, the tiered table paid 25% where pro-rata is about 73%. That is not a
rounding difference — it is the gym holding money a mediator could order it to
return.

**So migration 0073 changed the rule, not just this document.** Refunds are now:

```
refund = max(pro-rata for unused days, gym tier floor) − documented fee
```

The tiers survive as a **floor**, which is where they belong: a gym may be more
generous than the law (the 7-day full refund is exactly that), and may not be
less. The processing fee defaults to zero and should stay there unless the gym
can name the cost it covers.

### On the plans themselves

| What the research says | Where it came from | What we did with it |
|---|---|---|
| Industry annual retention averages **66.4%** — roughly one member in three leaves each year | HFA 2025 Fitness Industry Benchmarking Report, reported by [Nutripy](https://nutripy.io/blog/gym-retention-rate-benchmarks-2026) | Sets the scale of the problem the engagement features exist to address, and gives Retention a benchmark to be measured against rather than a bare number |
| The top cancellation reason is **not visiting enough to justify the cost (46%)**, ahead of money (22%) and moving (15%) | [Gym Rescue](https://www.gymrescue.com/blog/gym-membership-retention-statistics-and-tips/), [Glofox](https://www.glofox.com/blog/gym-membership-statistics/) | Justifies the whole attendance-and-points loop: the intervention that matters is getting people *in*, not discounting |
| Members completing a full onboarding are **87% active at 6 months** vs **38%** without (Dr Paul Bedford) | [PushPress](https://www.pushpress.com/blog/gym-member-retention-guide) | Supports the onboarding flow being mandatory rather than skippable, and the experience-level question that drives class recommendations |
| Extending a free trial from 3 to 7 days raised **delayed conversion 42.36%** and overall subscriptions **20.92%** across 680,588 users | Zhang & Duan (2025), *Frontiers in Psychology*, [PMC12217587](https://pmc.ncbi.nlm.nih.gov/articles/PMC12217587/) | Directional support for a **longer** trial. **Stated honestly: this is a SaaS study of 3 vs 7 days, not a gym study of 30. It supports the direction, not the specific number.** |
| Freeze policies typically cap at **1–3 months**, and an excessive hold fee backfires by pushing members to cancel outright | [Gymolix](https://gymolix.com/blog/gym-membership-freeze-policy-guide), [FitnessJudge](https://www.fitnessjudge.com/posts/which-gym-memberships-let-you-freeze-or-pause-most-easily/) | Our 30-day single freeze and 60-day annual ceiling sit inside the common range; the freeze carries **no fee**, deliberately |
| Deferred revenue during a freeze is almost always smaller than the lifetime value lost to a cancellation | [Cloud Gym Manager](https://www.cloudgymmanager.com/membership-freezes-and-holds-done-right-policies-proration-and-automation/) | The reason freezing is offered readily and the ceiling exists only to stop an indefinite freeze becoming an unrecorded cancellation |

### What still is not evidence

The **specific percentages** in the tier table (100 / 50 / 25) are still a
judgement about this gym, not a finding from literature. What the research
changed is their *status*: they are now a floor above a legally-grounded
pro-rata baseline, rather than the rule itself. That is a much more defensible
position than the one this document started with.

**For the manuscript**, the two sources that carry real weight are RA 7394 for
the refund model and Zhang & Duan (2025) for trial design; the trade-press
statistics are industry benchmarks and should be cited as such, not as peer
review. Confirm the HFA report directly — it is quoted second-hand above.

### Sources

- Consumer Act of the Philippines (RA 7394) — refunds on unused service
  memberships: [Respicio & Co.](https://www.lawyer-philippines.com/articles/refund-for-unused-service-memberships-in-the-philippines-your-rights-under-the-consumer-act)
  · [DTI on "No Return, No Exchange"](https://aseanconsumer.org/read-news-dti-warns-against-establishments-implementing-a-no-return-no-exchange-policy-explains-to-consumers-the-rule-on-return-and-exchange)
  · [Batas Natin on warranty and refund obligations](https://batasnatin.com/laws/consumer-act-ra-7394-warranty-and-refund-obligations-for-sellers)
- Zhang & Duan (2025). Longer or shorter? A large-scale randomized field
  experiment on free trial duration in the freemium model. *Frontiers in
  Psychology*. [Full text](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2025.1568868/full)
- Retention benchmarks: [Nutripy](https://nutripy.io/blog/gym-retention-rate-benchmarks-2026)
  · [PushPress](https://www.pushpress.com/blog/gym-member-retention-guide)
  · [Glofox](https://www.glofox.com/blog/gym-membership-statistics/)
  · [Gym Rescue](https://www.gymrescue.com/blog/gym-membership-retention-statistics-and-tips/)
- Freeze policy practice: [Gymolix](https://gymolix.com/blog/gym-membership-freeze-policy-guide)
  · [Cloud Gym Manager](https://www.cloudgymmanager.com/membership-freezes-and-holds-done-right-policies-proration-and-automation/)
  · [FitnessJudge](https://www.fitnessjudge.com/posts/which-gym-memberships-let-you-freeze-or-pause-most-easily/)

**This is not a substitute for a supervisor's review.** Trade-press figures cite
primary reports second-hand; before any of this reaches the manuscript, the HFA
benchmarking report and Bedford's onboarding work should be obtained directly.

---

## Where this is enforced

| Rule | Enforced by |
|---|---|
| Reason required to freeze or cancel | `trg_membership_event_guard` (0057) |
| Two freezes per calendar month | `freezes_this_month()` (0057) |
| Frozen days in the last year | **Nothing.** `frozen_days_last_year()` (0070) computes it and the freeze dialog *shows* it against `gym_settings.max_freeze_days_per_year`; no trigger refuses on it. Decided, not overlooked — [TEST_MATRIX](TEST_MATRIX.md#decisions--settled-7-september-2026) §3. |
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
