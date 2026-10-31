# Accounts, documents, paying, deleting, suspending and switching gyms (2026-10-31)

## Why
The owner's evaluator and the owner, after the simplify:

- An owner applies on the site with one account, then gets a **second, generated login** when approved — two accounts for one person.
- An applicant who did not use Google has no clear **email verification**, and no way to tie the account to their Google sign-in.
- The six business documents are sent **one at a time**; the evaluator expects **one batch**, reviewed per document, with only the
  ones the platform sends back re-sent — again as a batch.
- The application page says "ask us how to pay"; **PayMongo is not offered** there.
- Nobody can **delete their own data**, and the platform owner cannot **suspend** a person across the system.
- A member can belong to several gyms ("Join another gym"); the owner wants **one gym at a time**, with the member's history
  moving when they **switch**.

**Success:** a gym owner has one account from application to admin app; documents go in one batch and come back only where needed;
a paying gym pays before approval in the way it prefers; every person can erase their data; the platform can block an account;
a member switches gyms and keeps their training.

## Decisions (the owner's)

### 1. The applicant's account is the owner's admin login
- The account used on the site (Google, or email + password) **becomes the owner's admin login** when the platform approves the gym.
  No invitation or one-time password for owners (staff and coaches are still invited — they never apply).
- An email + password account must **confirm its address** before it can submit documents; the page offers **Send the link again**.
- A signed-in owner can **connect Google** to the same account, so either sign-in reaches it.

### 2. Documents in one batch
- The owner attaches the six documents (permit, DTI/SEC, BIR 2303, barangay clearance, ID, gym front photo) at their own pace —
  kept as a **draft** only they see — and **Submit documents** sends all six at once; it works only when all six are attached.
- **Only the platform owner (super admin) reviews**, one document at a time: verified, or **sent back with a reason** — including one
  already verified (expired, unreadable, wrong).
- The owner is told on the application page **and by email** which documents to send again and why, and re-sends **only those**,
  again as one batch (Submit works when every sent-back one has a new file).

### 3. Paying before approval
- When **all six are verified**, an owner who chose a **paid plan** pays the platform before approval: **PayMongo** (online) or
  GCash / Maya / bank (they send the reference; the platform confirms it). A **free trial** pays nothing.
- The platform approves only when the payment is in (or the plan is the free trial).

### 4. Deleting your own data — members, coaches, gym owners, applicants
- From each app's settings (the site for applicants), with a typed confirmation. The account is **locked at once** and **erased after
  7 days**; signing in within the 7 days **cancels** it.
- **Keep, but anonymised** (RA 10173 allows keeping what the law requires): payments, receipts and visits stay in the gym's books with
  the name replaced by *Deleted member*; everything personal is erased — profile, photo, contact details, workouts and sets, routines,
  measurements, targets, progress photos, chats, assistant conversations, health answers, files in storage.
- **An owner** cannot delete while their gym is open: they ask Core Fitness to close the gym or hand it to another owner first, so
  members are told and can switch. *(Owner left it to me; my recommendation, accepted.)*
- **A coach** cannot delete while members are on a package with them: the coach or desk ends or hands over each package first;
  future single sessions are cancelled with a reason and the members told. *(My recommendation.)*

### 5. The platform suspends an account
- The super admin can **block an account across every gym and app**, with a reason. The person sees the reason when they try to sign
  in, and by email; each gym the person belongs to sees *Suspended by Core Fitness* (never the reason). **Only the super admin lifts
  it.** *(Notifications: my recommendation.)*

### 6. Switching gyms — members only
- **A member belongs to one gym at a time.** "Join another gym" becomes **Switch gym**. Coaches may still work at several gyms.
- The new gym takes them in by **its own joining rules** (open, code, or desk approval); the switch completes when it accepts.
- Before confirming, the member sees what the old gym's refund rules would pay back for the unused days (the existing
  `refund_quote`); confirming files a cancellation with the old gym, whose desk processes the payout as today. When the new gym
  accepts, the old membership ends; payments and visits stay in the old gym's books; any package with a coach there ends; the old
  gym is told. *(My recommendation, accepted.)*
- **Moves with the member:** training history (workouts, sets, records), their own routines and weekly plan, body readings, targets,
  progress photos, the earned level, and training badges — "all the data needed".
- **Starts over:** the **points balance starts at zero**, and **visit badges** (earned by coming to the old gym: visit counts,
  check-in streaks) **lock again**.
- The move needs the member's **consent on the switch screen**, which says what moves (each gym is a separate controller under
  RA 10173), and Privacy says so.

### 7. Test members
- No member belongs to two gyms today (connector, 2026-10-31), so nothing is removed. A SQL file adds a few made-up members to
  Core Fitness Lab to try switching with, marked as demo data (removable by *Remove demo data*); the owner pastes it.

## Constraints
- Migrations are pasted by the owner one at a time; each ships with its marker, verify file, probe entry, CI suite and harness.
- Legal pages change in the same commit as the rule (member Privacy and Terms; the site's gym Terms, DPA and platform Privacy —
  their `VERSION` dates change and need publishing on the platform).
- Every rule lives in SQL (definer functions, no client-granted rights); RLS is the boundary; new helpers are revoked from public/anon.
- A member feature is not done until admin and the coach can see what happened (a switched or deleted member, a suspension).
- Members are archived, never deleted — the self-service deletion anonymises; it never removes the gym's books.

## Calls I made (the owner can overrule)
- Points history stays with the old gym's ledger (it is that gym's currency); the member's switch shows "earned at <old gym>" in their
  history but the spendable balance is 0.
- The 7-day erase runs as a re-runnable sweep (on sign-in pages and the platform's load, and pg_cron where available).
- Suspension and the close-the-gym request live in the platform app (a People search across gyms; Gyms → Close).
