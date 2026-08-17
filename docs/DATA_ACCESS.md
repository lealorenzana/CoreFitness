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

It has bitten three times:

| Where | Symptom |
|---|---|
| Onboarding experience level | Every value ever collected was silently discarded |
| Admin Notifications → Recall | "Recalled" toast; the broadcast was still in members' bells |
| Attendance → Undo check-in | "Removed"; the row was still there |

**Fix:** add `.select()` so the statement becomes `… RETURNING`, then check the row count and
throw. The two admin buttons above now do exactly that, and migrations 0034/0035 add the DELETE
policies that make the write succeed for real.

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
