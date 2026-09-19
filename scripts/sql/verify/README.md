# Migration verification scripts (0092–0096)

One per migration: each signs in as the real roles (member, trainer, staff,
admin, a user with no profile) in turn, tries what that role should and should
not be able to do, and ends with `raise exception 'REPORT…'` listing every
answer — `refused` where a rule must hold, `ALLOWED` if it did not.

They run as a seed in the SQL harness (pglite; see `../README.md`):

```bash
cp scripts/sql/verify/verify0096.sql scripts/demo-data/_v.tmp.sql
node scripts/sql/replay-migrations.mjs . seed-demo-data.sql seed-demo-data-2.sql _v.tmp.sql
rm scripts/demo-data/_v.tmp.sql
```

The run always "fails" with the REPORT line — that is the output, not an
error. Read it: every rule should say `refused` and every count should match
the comment in the script. Their blanket grants make a *revoke* look ALLOWED;
that is the harness, not the migration.
