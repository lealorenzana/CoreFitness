# Backups

Supabase's free tier keeps **no restorable history** — no point-in-time
recovery, no daily snapshots you can roll back to. One bad `UPDATE`, a paused
project, or a deleted table would be permanent. So the database is copied
every week by a GitHub Action: [.github/workflows/backup.yml](../.github/workflows/backup.yml).

| | |
|---|---|
| When | Every Sunday, 2:00 AM Manila — or any time from **Actions → Weekly database backup → Run workflow** |
| What | The `public` schema (every table the gym uses) and `auth` (sign-ins) |
| Format | `pg_dump` custom format, then **encrypted** (AES-256, your passphrase) |
| Where | A workflow artifact on GitHub, kept **90 days** |
| Not included | Uploaded photos (Supabase Storage) — see the end of this page |

**The repository is public.** On a public repository any signed-in GitHub user
can download workflow artifacts, which is why the dump is encrypted before it
is uploaded. Without the passphrase the file is useless — to anyone, including
you. Keep the passphrase somewhere safe that is not this repository.

## One-time setup (5 minutes)

1. **The connection string.** Supabase → your project → **Connect** (or
   Project Settings → Database) → **Session pooler** → copy the URI. It looks
   like `postgresql://postgres.<ref>:[YOUR-PASSWORD]@aws-0-<region>.pooler.supabase.com:5432/postgres`.
   Put your database password in place of `[YOUR-PASSWORD]`.
   *Use the Session pooler, not "Direct connection":* the direct address is
   IPv6-only and GitHub's runners cannot reach it.
2. **A passphrase.** Make up a long one (four or five random words). Write it
   down somewhere safe — a password manager, or paper kept with the gym's papers.
3. **Add both as secrets.** GitHub → the repository → **Settings → Secrets and
   variables → Actions → New repository secret**:
   - `SUPABASE_DB_URL` = the connection string from step 1
   - `BACKUP_PASSPHRASE` = the passphrase from step 2
4. **Test it.** **Actions → Weekly database backup → Run workflow**. After a
   minute or two the run shows a green tick and an artifact named
   `corefitness-YYYY-MM-DD.dump.gpg`.

Secrets are never printed in the logs and are not visible to anyone who can
only read the repository.

## Keeping one for longer than 90 days

Artifacts expire. Once a month, download the latest one (open the run →
**Artifacts**) and keep it offline — a USB drive or the gym's own cloud drive.
It is encrypted, so it is safe to store anywhere.

## Restoring

You need the `.gpg` file, the passphrase, and PostgreSQL's client tools
(`pg_restore` 17; on Windows, the PostgreSQL installer with only
"Command Line Tools" ticked).

```bash
# 1. Unzip the artifact, then decrypt (asks for the passphrase)
gpg --output corefitness.dump --decrypt corefitness-2026-09-20.dump.gpg

# 2a. Look inside without touching anything
pg_restore --list corefitness.dump | less

# 2b. Bring back ONE table into the live database (here: payments), data only
pg_restore --data-only --table=payments --dbname "$SUPABASE_DB_URL" corefitness.dump

# 2c. Everything, into a NEW empty Supabase project (the disaster case)
pg_restore --no-owner --no-privileges --dbname "<new project's session pooler URL>" corefitness.dump
```

Restoring a single table into the live project will conflict with rows that
still exist; the usual way is to restore into a new, empty project first,
check what you need, and copy it across. Ask before restoring over live data.

## Photos

Profile photos and trainer images live in Supabase Storage, not the database,
and are not in this backup. They are replaceable (members can upload again),
so they are left out deliberately to keep the backup small. To copy them too,
download the bucket from the Supabase dashboard now and then.
