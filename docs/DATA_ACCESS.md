# The data-access layer, and the traps in it

`src/lib/api/*.ts` — one module per table, typed against `src/types/db.ts`. Above them sit per-app
**services** that assemble a screen from several API calls: `dashboardService`,
`memberDetailService`, `trainerDetailService`, `scheduleService`, `bookingQueueService`,
`chatbotService` (admin); `trainerService`, `bookingService`, `memberHomeService` (member). Put
multi-table screen assembly in a service, not a component.

RLS enforces authorization. The API layer does **not** duplicate it — a check in TypeScript that
the database also makes is a check that can drift out of agreement with the database.

## Copying between the two apps

The two apps have no shared workspace, so most of these modules exist twice and must stay in sync
by hand. Two things make that dangerous:

- **`notify.ts` legitimately differs** between them. Diff before you copy.
- **Many of these files were untracked for months**, so an overwrite was unrecoverable. They are
  committed now, but check `git status` before clobbering one.

## Every trap that has actually cost time here

### A zero-row write is not an error

`.update()` and `.delete()` on rows that do not exist — or that RLS hides — report **success** and
affect nothing. PostgreSQL has no opinion about this; neither does PostgREST.

It has bitten five times:

| Where | Symptom |
|---|---|
| Onboarding experience level | Every value ever collected was silently discarded |
| Admin Notifications → Recall | "Recalled" toast; the broadcast was still in members' bells |
| Attendance → Undo check-in | "Removed"; the row was still there |
| Trainer profile photo | "Photo updated"; `photo_url` stayed NULL |
| `cancelOwnBooking` | "Cancelled"; the seat was never released |

**Fix:** add `.select()` so the statement becomes `… RETURNING`, then check the row count and
throw. `lib/api/mutate.ts` (both apps) has `assertWrote()` so this is one line:

```ts
const { data, error } = await supabase
  .from('memberships').update(updates).eq('id', id).select('id');
if (error) throw error;
assertWrote(data, 'That membership could not be updated. Someone may have changed it first.');
```

### The audit, and which writes are deliberately left unguarded

`python scripts/audit-writes.py` counts them. **116 writes, 91 guarded.** The
remaining 25 are not bugs. The test is: **would the user be misled by being told
this worked?**

**Deliberately unguarded — a zero-row result is a normal outcome:**

| Function | Why |
|---|---|
| `notifications.setRead` / `setCleared` / `setArchived` / `markAllAsRead` | The row may already be read on another device. Interrupting somebody because a read-flag did not move is worse than the silence. |
| `notifications.deleteNotifications` / `deleteAllNotifications` | Deleting what is already gone is the intended end state. |
| `push.enablePush` / `disablePush` / `clearPushOnSignOut` | Push is a courtesy channel and never allowed to fail a user action. Sign-out must not be blocked by a subscription row. |
| `achievements.markSeen` | A cosmetic "new" dot. |
| `notificationPrefs.updateMyPrefs`, `sharePrefs.saveSharePrefs`, `trainerRatings.saveMyRating`, `planFeatures.setPlanFeature` | `upsert` — there is nothing to miss. |
| `gymPlans.saveMyPlan` | Delete-then-insert; the delete matching nothing is the first save. |
| `members.approveMemberRegistration` / `rejectPendingRegistration` — the `pending_registrations` DELETE | The queue entry already being gone is the desired end state. **Their `profiles` UPDATE is guarded**; only the delete is not. |
| The `INSERT`s in `members.ts` | See the next section — guarding an insert this way is the bug, not the fix. |

**An automated pass added `.select('id')` to those inserts and it had to be
reverted.** A regex that matches "a supabase write with no select" matches
inserts too, and `.insert().select()` is a different and worse thing. If you
sweep these again, match `.update(` and `.delete(` only.

### But never `.insert().select()` a row you cannot read

The mirror image. `.insert().select()` compiles to `INSERT … RETURNING`, so PostgreSQL checks the
**SELECT** policy on the new row as well — and fails with `42501` naming the *insert*, which sends
you looking at the wrong policy. Drop `.select()` wherever the writer is not the row's owner.

So: `.select()` on self-updates (you want the zero-row throw), no `.select()` when writing a row
that belongs to someone else.

### Test RLS as a non-superuser

A table owner bypasses RLS entirely, so a policy assertion run as `postgres` passes whether or not
the policy works. Every SQL check here runs in a throwaway `postgres:16-alpine` container under a
dedicated role:

```sql
create role app_user login;
grant usage on schema public to app_user;
grant select, insert, update, delete on all tables in schema public to app_user;
-- inside the test transaction:
set local role app_user;
```

`auth.uid()` is stubbed to return the fixture's id. Assertions go in a `do $$ … $$` block so a
failure aborts with a message instead of printing a row nobody reads.

### `.order(col, { referencedTable })` does not order the parent

It emits `embedded.order=…`, which sorts **inside** an embedded resource. On a to-one embed —
`trainer_profiles` → `profiles` — there is a single object and nothing to sort, so the call is a
no-op and rows come back in whatever order PostgreSQL felt like. Sort those client-side; see
`byName()` in `lib/api/trainers.ts`.

### `signUp` does not error on a duplicate email

It returns a user with an empty `identities` array. Check that, not the error.

Self-registration also goes through the `handle_new_member_signup` trigger on `auth.users` (0005),
not a client insert: with email confirmation on, `signUp()` returns no session to insert with.

### Checking what is actually live

The schema in `supabase/migrations/` is what *should* be deployed, not what is. A migration file
existing proves nothing. Probe the real project read-only with the anon key — a missing column
answers `42703`, a missing table `PGRST205`, a missing function `PGRST202`:

```bash
curl -s "$URL/rest/v1/member_profiles?select=date_of_birth&limit=1" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON"
```

`200 []` means the column exists and RLS simply returned nothing — which is the answer you want.
**Policy-only migrations (0034, 0035) cannot be detected this way**; there is no anonymous probe
for "does a DELETE policy exist". Those have to be confirmed in the SQL editor, or by using the
feature and seeing the client's row-count guard stay quiet.

### `.or()` breaks on a comma in user input

PostgREST's `or=` is a **comma-separated list wrapped in parentheses**, so a comma, paren, `*`, `%`
or backslash inside a search term is parsed as filter syntax rather than as text. Measured against
the live project: the sanitised form returns `200`, and the same query with a raw comma in the term
returns **`400 PGRST100`** — so a front-desk search for `Dela Cruz, Maria` would have killed the
entire members section of the palette, silently, because the failure was caught per-section.

Strip `,()*%\` from anything interpolated into `.or()` (`services/searchService.ts` does). Dots are
safe and must survive — email addresses are the single most-searched thing here. For a **single**
`.ilike()` call there is no list to break, so escape `%` and `_` properly instead of stripping them
(`lib/api/activityLog.ts` does), or a member searching `50%` matches every row in the table.

### `OLD` is unassigned in an INSERT trigger

In PL/pgSQL, reading `OLD.anything` during an `INSERT` raises *"record \"old\" is not assigned yet"*
and **aborts the statement**. So the innocuous-looking `coalesce(new.col, old.col)` at the top of an
insert-or-update trigger does not fall back to NULL — it makes every INSERT on that table fail. In
0037 that would have meant no member could ever book a class again.

`NEW` is populated for both INSERT and UPDATE, so the coalesce is never needed on an
`after insert or update` trigger. On a trigger that also handles DELETE, branch on `TG_OP` *before*
touching either record. Note that a green `tsc` build and a SQL parser both pass this happily —
`libpg_query` treats a plpgsql body as an opaque string literal, so only a running Postgres or a
careful read catches it.

## `<>` against a nullable role skips the guard entirely

Every role check in this codebase was written as:

```sql
if get_my_role() <> 'admin' then raise exception 'Only admins can …'; end if;
```

`get_my_role()` returns NULL for any caller with no `profiles` row — an anonymous request holding
the public anon key, or a user mid-sign-up. **`NULL <> 'admin'` is NULL, not TRUE**, so the `if`
body never runs and the guard is skipped. Three-valued logic: the comparison is "unknown", and
plpgsql treats unknown as not-true.

This shipped in 0038 and was **live and exploitable**, confirmed against the real project with
nothing but the anon key that ships in the deployed bundle:

```
POST /rest/v1/rpc/revoke_achievement  →  204 No Content
```

204 is success — an unauthenticated caller ran a DELETE against `achievement_unlocks`. 0039 fixes
it with `IS DISTINCT FROM`, the NULL-safe comparison: `NULL IS DISTINCT FROM 'admin'` is TRUE, so
an unknown role is treated as "not an admin" rather than as "no opinion".

**Why it mattered there and not in the five older instances** (0006, 0016, 0018, all fixed anyway):
those are triggers, and a trigger only fires once RLS has already allowed the write — a caller with
no profile row cannot pass the `profiles` or `memberships` UPDATE policies. `award_achievement` and
`revoke_achievement` are **SECURITY DEFINER functions reachable directly at `/rest/v1/rpc/…`**.
SECURITY DEFINER bypasses RLS, so the check inside the function is the only boundary there is.

The rule: **inside a SECURITY DEFINER function, the role check is load-bearing — write it NULL-safe,
and probe it as anon before believing it.** A green build and a passing SQL parse both say nothing
about this; only the live 204 did.

Note when probing: PostgREST maps `insufficient_privilege` (42501) to **401**, not 403.

**Two probe results that look like holes and are not** — both cost time in the 2026-08-19 anon
audit, on top of the real 0038 bug above:

- **A *blocked* `UPDATE`/`DELETE` also answers `204 No Content`.** RLS filters rows rather than
  raising, so "policy refused everything" and "wrote the row" are the same status code. Re-run with
  `Prefer: return=representation` and read the body: `[]` means zero rows changed. Never conclude a
  write succeeded from a 204 alone — and note this cuts the other way too, which is exactly how the
  0039 hole hid.
- **An RPC called with the wrong argument signature answers `404` (`PGRST202`).** PostgREST resolves
  functions by name *and* arguments, so `POST /rpc/foo` with `{}` 404s on a function that plainly
  exists. Send the real signature before reporting a function missing.


## The audit trail and global search (admin-only)

`activity_log` (0037) answers what the schema could not. `bookings` records a cancellation by
flipping `status`, keeping **no timestamp and no actor** — so a member cancelling their own class
and the front desk cancelling it for them were indistinguishable after the fact.

It is written **only** by SECURITY DEFINER triggers: admin has SELECT, and there is **no INSERT
policy at all**. That is what makes it trustworthy — the member app and the Edge Functions are
caught by the same triggers, and nothing reachable from a browser can forge a row.

Read it through the `activity_feed` view, which **must** stay `security_invoker`; without that the
view runs as its owner and the admin-only SELECT policy is bypassed.

Cancellations from before 0037 are **not** backfilled. No honest timestamp exists for them, and
inventing one would defeat the point of having the log.

Global search (`services/searchService.ts`, Ctrl+K) fires 11 parallel queries across nine entity
types from **one** character up. A section that fails is **named in the results** rather than shown
empty — "couldn't load bookings" and "no bookings" are different answers.


## A SECURITY DEFINER guard can block its own writer

`auth.uid()` is **NULL outside a browser session** — pg_cron, the SQL Editor, an Edge Function.
So `if get_my_role() is distinct from 'admin' then raise` is *true* for exactly the caller
entitled to run it. Shipped wrong twice: 0055's `settle_goals()` from cron, and 0062's
`retire_plan()` from the SQL Editor.

**Always guard on `auth.uid() is not null and <not-admin>`** (the shape 0063 settled on). And
**probe the guard before believing it** (0038 → 0039) — resolve the function to its *last*
definition, since a later migration may have replaced it.

## A trigger needs an event to fire on

"Attended" is an approved booking whose time has **passed**, and nothing writes a row when time
passes. Anything keyed on elapsed time must be a **re-runnable sweep** called from a page load
(and from pg_cron where it exists), never a trigger — as triggers they compile and never fire.

Live examples: class/PT points (0051), reminders (0053), `sweep_stale_requests()` (0071).

Every automated message goes through `notify_once`, whose dedupe key sits behind a **partial
unique index** (0053). `not exists` races itself, and these functions run on every page load.

## RLS filters rows, never columns

A policy chooses which rows a statement can see. It cannot hide a column. So a trainer allowed to
read `trainer_ratings` reads `member_id` too, and filtering the name out in JSX leaves it in the
network response for anyone with devtools open.

The fix is a **view without the column** (0072's `trainer_ratings_anon`). But a view with
`security_invoker = false` reads *every* row regardless of the caller, so it must be **revoked
from `authenticated`** and reached only through a SECURITY DEFINER function that filters on
`auth.uid()`. Granting it directly leaks more than the hole it was closing.

## A policy on a table whose RLS is off is not protection

It reads exactly like protection and is none. **Assert `enable row level security` in the same
file that adds the policy** — and remember an `EXISTS` subquery inside a policy is itself
RLS-filtered (0050), so it can only reach tables the caller can already read.

## Cancelling, trainer visibility, and the attention queue (0081–0083)

Added 2026-09-15 from a system-wide review. All three are written and
replay-tested; see CLAUDE.md's roadmap for whether they are pasted.

### A cancellation records why, who and when — or does not happen

Members could self-cancel from 0016 and the row recorded nothing. 0037 wrote the
gap down while reconstructing history: "`bookings` stores no `cancelled_at` and
no `cancelled_by`, so for every booking already sitting at status='cancelled'
there is no honest answer to 'when?' or 'by whom?'."

- **The status enum did not grow.** "Cancelled by member/trainer/admin" as four
  terminal states would turn every `status = 'cancelled'` check into an IN list,
  including 0015's partial unique indexes that free a trainer's slot. Who
  cancelled is an *attribute*: `cancelled_by_role`, stamped server-side.
- **Reasons are a table**, not an enum — `point_rules` and `achievements` are
  the precedent. The desk can add one without a migration, and `is_active`
  retires one without orphaning the bookings that cite it.
- **A trigger refuses a bare `status='cancelled'` update**, so the reason is
  mandatory however the write arrives. Deliberately a trigger and not a CHECK: a
  CHECK would reject every pre-existing cancelled row — real history — the
  moment anything touched it.
- **0081 reverses 0071 on one point.** 0071 said "a trainer decides, and the
  only decisions are yes and no. Cancelling on a member's behalf is the desk's
  job." The gym asked for the opposite. The escape is a transaction-local flag
  only `cancel_booking()` sets, so a trainer PATCHing the table directly still
  gets the old refusal, and the column pins run above it — cancelling cannot
  smuggle in a change of `member_id` or `starts_at`.

### "My members" is derived, never stored

`member_profiles`, `profiles`, `memberships` and `attendance` **all** read
`using (get_my_role() = 'trainer')` — every member's name, plan, expiry, freeze
history and check-in, readable by any coach. This mattered more than the roster
looked: 0032 exists so members choose what a trainer may see, and that care was
undone one level up.

`is_my_trainee()` derives it from PT sessions and classes taught — the same two
joins `may_rate_trainer()` uses, so who a coach may see and who may rate them
cannot drift apart. No assignment table for a fact the bookings already state.

**Policies for one command are OR'd.** The first draft added a narrow policy
*beside* 0006's wide-open one and changed nothing at all; the suite caught it
("3 member rows"). Replace the wide policy, never sit next to it.

### The attention queue leaves the clock alone

0071's `sweep_stale_requests()` already escalated — trainer at 24h, member at
48h, every admin at 72h. 0083 adds where that notification should have pointed.

- `suggest_trainers_for_session()`: **availability filters, everything else only
  ranks.** Overlap is half-open (`overlaps`), so a 10:30 session collides with a
  10:00 hour. It does not invent a qualification match — a PT session has no
  "requested service", only free-text notes.
- `reassign_pt_session()` leaves the session **pending** (the new coach still
  accepts — the two-stage approval 0071 removed) and does **not** reset
  `requested_at` (the member really has been waiting; resetting would hide the
  delay from the queue that exists to surface it).
- `remind_trainer()` is dedupe-keyed by **Manila day**, not by session: the
  sweep's once-ever rule is right for a sweep and wrong for a person chasing
  someone. It returns whether a message was created, so the screen can say
  "already reminded today" instead of claiming to have sent one.
