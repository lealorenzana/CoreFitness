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
