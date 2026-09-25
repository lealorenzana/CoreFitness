# Automatic checks (CI)

Every push to `main` and every pull request runs
[.github/workflows/ci.yml](../.github/workflows/ci.yml) on GitHub — no secrets,
no Supabase access, about ten minutes. Three jobs, and the green tick on a
commit means all three passed:

| Job | What it proves |
|---|---|
| **Build both apps** | Both compile (`tsc -b` + Vite) and every achievement icon and metric in the seed resolves (`check:achievements`) |
| **Migrations and SQL rules** | All migrations apply in order to a fresh PostgreSQL (pglite), both demo seeds load, and the four rule suites in `scripts/sql/` pass as a real `authenticated` role |
| **Fixture checks** | The screens themselves: `scripts/ci/run-ui-checks.mjs` starts both dev servers and runs every check listed in `scripts/ci/ui-checks.json` in Chromium, with Supabase replaced by a stateful fixture |

## When it goes red

Open the run → the red job → the red step. The UI job prints each check's
lines; a failure is spelled in capitals (`MISSING`, `NO`, `=ALLOWED`,
`FAILED`). Its **ui-check-shots** artifact holds every screenshot the checks
took and both dev servers' logs.

Per CLAUDE.md: **suspect the test first** — most red runs so far were a test
expecting old wording — but two were real bugs.

## Running the same checks on your PC

```bash
# once, in any folder outside the repo
npm install playwright @electric-sql/pglite

# the screens (dev servers on :5173 and :5174 first). Uses your installed
# Chrome instead of downloading Playwright's browser:
UI_CHECKS_CHANNEL=chrome node <repo>/scripts/ci/run-ui-checks.mjs
node <repo>/scripts/ci/run-ui-checks.mjs workout     # only checks whose name matches

# the database
node <repo>/scripts/sql/replay-migrations.mjs <repo> seed-demo-data.sql seed-demo-data-2.sql
```

## Adding a check

Write it as one `async (page) => { ... }` expression in `scripts/` (copy the
head of `renew-check.js` for the fixture), print `label: value` lines with a
capitalised word on failure, and add it to `scripts/ci/ui-checks.json`.

## Skills (not in git)

`.claude/skills/` is gitignored: 7.9 MB of third-party content including font
binaries, reinstallable in one command each, and nobody diffs it — the same
reasoning as the generated documentation. Nothing in CI reads them; they are a
convenience for an agent session on a developer's machine.

To restore them after a fresh clone:

```bash
npx claude-code-templates@latest --skill development/senior-backend
npx claude-code-templates@latest --skill development/senior-fullstack
npx claude-code-templates@latest --skill development/brainstorming
npx claude-code-templates@latest --skill development/mcp-builder
npx claude-code-templates@latest --skill web-development/react-best-practices
npx claude-code-templates@latest --skill creative-design/canvas-design
npx claude-code-templates@latest --skill business-marketing/seo-optimizer
```
