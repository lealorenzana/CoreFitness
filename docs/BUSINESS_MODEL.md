# Core Fitness — business model and system maintenance

Written for the panel feedback: *"Make it startup idea (Business flow: Maintenance ng system flow)"*
— Mr. Ronnie N. Del Rosario — and the membership-access question from Mr. Leonard Flores.

Everything below describes what the system **actually does today**, not a roadmap. Where something
is a plan rather than a built feature, it says so.

---

## 1. The problem

Core Fitness is a single gym in Mamburao, Occidental Mindoro. Like most provincial gyms it runs on
cash and paper: a logbook at the door, membership expiry tracked in someone's head or a notebook,
and no way to answer "who lapsed last month" without reading back through pages.

That produces three concrete losses:

- **Silent churn.** A member stops coming and nobody notices until they've been gone two months.
  By then they're gone for good.
- **Revenue leakage.** Expiry dates are missed, so members train on lapsed memberships. Nobody is
  being dishonest — nobody can *see* it.
- **Unusable history.** The logbook records that people came, but not in a form that answers a
  question. Which hours are busy? Which plan retains best?

The gym doesn't need a bigger system. It needs the records it already keeps to become answerable.

## 2. What the product is

Two apps against one Postgres database:

| | Who | Where |
|---|---|---|
| **Admin dashboard** | Owner + front-desk staff | Desktop browser at the gym |
| **Member app** | Members and trainers | Installed Android/iOS app |

Members carry a rotating QR code; the desk scans it to check them in. Payments are recorded by
whoever took the cash. Memberships activate, expire, freeze and cancel as a consequence of those
recorded actions rather than as a separate bookkeeping exercise.

**Cash stays cash.** No online payments, no card processing, no wallet integration. That isn't a
gap — it's a deliberate fit to how this gym is actually paid. What the software adds is that the
cash transaction now *does* something: recording a payment is what extends the membership.

## 3. Membership tiers

The panel asked for access levels including a free tier "for regular members with no fund for
payment yet." That framing matters — in a provincial gym, a member without money this month is
usually a member who will have money next month, and locking them out entirely converts a cash-flow
gap into a lost customer.

| Tier | Price | Runs | Intent |
|---|---|---|---|
| **Free** | ₱0 | ongoing | Floor and locker access. Keeps a member who can't pay yet inside the community instead of gone. |
| **Freemium** | ₱0 | 3 months | Trial with limited class access. Converts curiosity into habit before asking for money. |
| **Premium** | ₱1,500 | 30 days | Full access: unlimited classes and personal training. |

**Crucially, those limits are data, not code.** Each plan carries its own entitlements —
`can_book_classes`, `can_book_pt`, and optional weekly/monthly quotas — editable by the admin.
The tier name is a label; the columns are the rules. A gym that wants classes on its free tier
changes a setting, not the source.

This is what makes it a *product* rather than one gym's software. The pricing above is Core
Fitness's; the system doesn't assume it.

### The ladder actually works now

Three things were missing until 0041, and together they meant the tiers existed in the database
and nowhere a member could act on them:

- **Members could not see what their plan included.** The entitlement columns were read in exactly
  one place — to grey out a booking button. The Home card showed the plan's *name* and its *term*,
  which on the free tier meant its single statement was "this membership does not expire": true,
  and the most misleading thing it could have said, because the tier that never runs out is also
  the tier that cannot book a class. Both apps now state included **and** excluded access wherever
  a plan is shown.
- **Nothing could change a member's plan.** `plan_id` was written once at registration and never
  again, so a Free Access member could never become Premium no matter what either app displayed.
  The front desk now picks the plan on the same form that records the cash — because at a real
  desk, upgrading *is* paying.
- **The trial could be taken twice.** A retakeable trial is not a trial; it is an indefinite free
  tier that duplicates Free Access while carrying class access Free Access deliberately lacks.
  `freemium_trials` holds one row per member, forever, written only by a SECURITY DEFINER trigger
  with no INSERT policy. The member app explains the lock; the trigger enforces it.

The conversion path the panel asked about is therefore a real path: **Free → Freemium (once) →
Premium**, with each step visible to the member and executable by the desk.

### Coach ratings, and why they are gated

Members rate the coaches they trained with (0042), and the score appears on the coach list and
profile. Two rules keep it from becoming a liability rather than an asset:

- **Only members who completed a session with that coach may rate them.** Not "members of a month" —
  that would let someone score a coach they never met.
- **The average is hidden until three ratings exist.** With four trainers, a single bad week would
  otherwise become one coach's permanent public number, visible to every future member and
  unanswerable by the coach.

For the gym this is retention data it has never had: which coach keeps people coming back is
currently a matter of the owner's impression.

### Freeze and cancel

- **Freemium** — once per member, ever, enforced in SQL. Granting a second one is deliberately not
  a button: an admin deletes the `freemium_trials` row in the SQL editor, which makes it a decision
  someone has to mean.
- **Freeze** — one per membership period, front-desk only. Frozen days are credited back to the
  expiry when it resumes. The limit exists because an unlimited freeze lets a member stretch 30
  paid days across a year; the counter resets on renewal, which is the natural period boundary.
- **Cancel** — stops the renewal but leaves access running to the expiry date. They paid cash up
  front and there is no refund mechanism, so removing days already bought would simply be keeping
  their money.

## 4. Why this can run as a startup

**Infrastructure cost today: ₱0/month.**

| Component | Service | Plan |
|---|---|---|
| Database, auth, storage | Supabase | Free |
| Member app hosting | Vercel | Hobby (free) |
| Android app | PWABuilder TWA → APK | Free, self-signed |
| iOS | Safari → Add to Home Screen | Free |

There is no server to rent, no app-store fee paid so far, and no per-seat licence. The entire
running cost of a deployed gym is the electricity for the front-desk PC.

That is the startup argument in one line: **the marginal cost of the second gym is zero.** Revenue
would come from charging gyms a subscription, not from members. A gym paying even ₱500/month for
something that recovers one lapsed ₱1,500 membership has already made the money back.

> **Verify the free-tier limits before the defense.** Supabase and Vercel change them without
> notice. What matters for the argument is the *shape* — generous free tiers, paid only at scale —
> not the specific numbers, which will have moved by the time anyone reads this.

### What breaks first, and what it costs

Being honest about limits is stronger than claiming there are none.

1. **Supabase pauses a free project after a week of inactivity.** For a live gym that never
   happens; for a demo project between defenses it absolutely does. Open the dashboard to wake it.
2. **Database size** is the first real ceiling. This schema stores text and dates, no images or
   video, so a single gym generates very little — attendance is the fastest-growing table at
   roughly one row per member per visit.
3. **The paid step is a flat monthly fee**, not per-user pricing, so the jump is affordable at the
   point it becomes necessary and predictable after that.

Nothing here needs re-architecting to cross that line. The same code runs on the paid tier.

## 5. System maintenance flow

This is the part the panel asked about specifically: not how it was built, but **how it stays
running** once it's someone's actual business.

### Daily — front desk, no technical skill required

Scan members in. Record payments as cash is handed over. Approve class and personal-training
requests from the one Bookings queue. That's the whole job; everything else is a consequence of it.

The `staff` role exists for exactly this. Staff can take payments, check members in, extend
memberships, and freeze them — **every action they can perform is a recorded, reversible
transaction**. What they cannot do is change plan pricing, create accounts, or alter settings:
those change the shape of the business, and they're admin-only. That split is enforced by the
database, not by hiding buttons.

### Weekly — owner

Read Retention: it lists members inactive for 21, 14 and 7 days from real check-in data. Call
them. This is the single highest-value thing the system enables, and it takes ten minutes.

Review the Bookings queue for anything left pending.

### Monthly — owner

Revenue by month, from `paid_on` (the day cash arrived) rather than `created_at` (the day it was
keyed in). Those diverge whenever a Saturday payment is entered on Monday, and only the first one
answers "what did we earn in August."

Check expiring memberships and renew before they lapse — renewal before expiry carries the unused
days forward, so there's no reason for a member to wait until the last day.

### Rarely — technical

- **Schema changes**: numbered SQL files in `supabase/migrations/`, run in order through the
  Supabase SQL Editor. Every change to the live database goes through a file so the schema can be
  rebuilt from scratch.
- **Deploying the member app**: `npx vercel deploy --prod`. Installed phones pick it up on next
  launch — the Android app is a shell that loads the live URL, so **there is no reinstall and no
  app-store review**. This is a genuine operational advantage worth naming in the defense.
- **Backups**: Supabase's automatic backups on the free tier are limited. For a real deployment
  this is the first thing to pay for.

### Who maintains it after the capstone

Honestly: this is the risk. A system maintained by one graduating student is one job offer away
from being unmaintained. Mitigations actually in place:

- Everything is in Postgres with a documented schema — the data outlives the apps and can be
  exported to CSV.
- No proprietary services beyond Supabase, which exports a standard Postgres dump.
- Migrations are ordered files, so a new developer can rebuild the database and understand the
  history.

## 6. Risks, stated plainly

| Risk | Reality |
|---|---|
| Single gym validation | Built for and tested against one gym. A second gym will want something this doesn't do. |
| Cash-only | Deliberate, but it means no automatic recurring revenue and no payment audit trail beyond who recorded it. |
| Free-tier dependency | Two vendors' free tiers underpin the ₱0 cost. Either could change terms. |
| Member adoption | The gym's benefit depends on members installing the app. Those who never do still get scanned in by staff, so the gym keeps its records either way — the system degrades gracefully rather than failing. |
| Maintenance | See above. The honest answer is that this needs an owner. |

## 7. What is deliberately not built

Naming these is more credible than implying the system does everything:

- **Online payments** — the gym is cash. Adding a gateway would add fees and reconciliation work
  to solve a problem it doesn't have.
- **Multi-branch** — the schema carries a `gym_id`, but nothing has been tested across branches.
- **The Progress Hub** (body measurements, goals, badges, workout logs) — still mock. It has no
  tables at all, so it is honest schema work rather than something half-connected.
- **Machine learning** — the retention "analytics" are threshold rules over real check-ins, and
  both chatbots are rule-based. Calling them AI would be the easiest claim to make and the easiest
  for a panel to puncture.

---

*Related: [MIGRATION_STATUS.md](MIGRATION_STATUS.md) for what's real vs mock,
[DEPLOYMENT.md](DEPLOYMENT.md) for the phone-app pipeline.*
