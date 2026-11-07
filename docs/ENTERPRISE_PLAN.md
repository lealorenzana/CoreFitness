# Enterprise plan — Project H

**Status: a plan, no code (2026-11-07).** Spec: [gym workflows redesign → H](superpowers/specs/2026-10-10-gym-workflows-redesign-design.md).
What it would take to run Core Fitness as a business that gyms pay for, rather than a capstone on free tiers:
what to pay for and when, how the code would be split, staging beside production, and what changes when
G Fitness becomes the first paying gym.

**Prices are approximate (checked 2026-11-07, mostly from third-party summaries) and in US dollars, as the
vendors bill; ₱ figures use ₱58 = $1.** Check each vendor's own pricing page before paying anything.

---

## 1. Where it runs today

| Piece | Today | The risk on a free tier |
|---|---|---|
| Database, Auth, Storage, Edge Functions | Supabase Free, one project (`ifwxtekyjgeljerslnzr`) | Pauses after a week with no traffic; 500 MB database, 1 GB files; **no point-in-time restore**; production and testing share one database |
| Admin app, phone app, website | Vercel Hobby (`*.vercel.app`) | Hobby is for non-commercial use — **a paying gym makes this commercial** |
| Platform app | localhost only | Fine — only the platform owner uses it |
| Email | `send-email` → Resend or Brevo, free tier | ~100 emails a day on Resend's free tier: one busy morning of invitations and receipts can hit it |
| Payments | PayMongo, live, QR Ph | The webhook has never seen a real payment (CLAUDE.md → *Queued last*) |
| Backups | Weekly encrypted dump by GitHub Actions ([BACKUPS](BACKUPS.md)) | Up to a week of data lost in the worst case |
| Errors | Nobody is told when a screen breaks | A gym finds out before we do |
| AI coach | Claude via `ai-coach`, paid per use | Cost grows with members who use it |

## 2. Three cost tiers

### Lean — the first paying gym (≈ $45–70 a month, ≈ ₱2,600–4,100)
The least that makes charging a gym honest.
- **Supabase Pro** — $25/month: no pausing, 8 GB database, 100 GB files, **daily backups kept 7 days**, includes $10 of compute (one Micro). This is the one thing that cannot wait.
- **Vercel Pro** — $20/month for one developer seat (viewers free): allowed to be commercial.
- **Email** — stay on Resend's free tier only while sends stay under ~100 a day; otherwise **Resend Pro $20/month** (≈ 50,000 emails).
- **Domain** — a `.com` (~$12/year) or `.ph` (~$42–45/year at the cheapest registrar, often far more elsewhere). One domain is enough: `corefitness.ph`, `admin.corefitness.ph`, `app.corefitness.ph`.
- **Errors and uptime** — free tiers (an error tracker's free plan; an uptime monitor pinging the three apps and one Edge Function every 5 minutes).
- Keep the weekly GitHub backup **as well as** Supabase's daily one — they protect against different things (a deleted project vs a bad day).

### Standard — about 5–20 gyms (≈ $150–250 a month, ≈ ₱8,700–14,500)
- Everything in Lean, plus:
- **A second Supabase project for staging** (≈ $10 + its compute) — see §4.
- **Bigger compute** for production (Small, ≈ $15, or Medium) once the dashboard's queries slow at the morning rush.
- **Resend Pro** for certain, and a sending domain with SPF/DKIM/DMARC set, so invitations stop landing in spam.
- **Paid error tracking** (≈ $26/month class) — alerts by email or phone when a screen throws.
- **A second developer seat** on Vercel if someone else ships.
- A budget line for the **AI coach** (Claude, billed per use) — gated in SQL already; set a monthly ceiling.

### Enterprise — many gyms, or a chain (≈ $400–1,000+ a month)
- **Point-in-time restore** — $100/month for 7 days of it: undo to the minute, not the day.
- **Supabase Team** ($599/month) only if a customer asks for SOC 2 reports, SSO into the dashboard, or longer log retention.
- Larger compute, read replica if reports get heavy.
- **Vercel Enterprise** only if a contract requires an SLA.
- A support inbox and an on-call rule (who answers when a gym's kiosk is down at 6 a.m.).

**What a gym pays covers this early.** At Starter ₱1,299 / Growth ₱2,999 / Pro ₱5,999 a month (0230), **three
paying Starter gyms already cover Lean**; Standard is covered by roughly five Growth gyms.

## 3. Splitting the repository

Today one repository holds four apps, the database and the scripts. That is right for a capstone (one place,
one history) and wrong for a team (one change rebuilds and redeploys everything, and every app's CI runs on
every push).

**The split:**

| Repository | Holds | Deploys to |
|---|---|---|
| `corefitness-db` | `supabase/` (migrations, functions, policies), the SQL harness (`scripts/sql/`), the red team, the probe, backups | Supabase (staging, then production) |
| `corefitness-shared` | A small package: `types/db.ts`, `lib/api/*` shared by both apps, `gymTheme`, `memberDataExport`, `coachGoals`, `legalVersions`, `receipt` | Published privately (GitHub Packages) |
| `corefitness-admin` | `g-fitness-admin/` (renamed at last) | Vercel |
| `corefitness-member` | `g-fitness-member/` + the TWA (`android/`), the signing key **never** in it | Vercel + Play |
| `corefitness-platform` | `corefitness-platform/` | stays local, or a protected Vercel project |
| `corefitness-site` | `corefitness-site/` | Vercel |

**Why a shared package and not copies:** "most modules exist twice, once per app — diff before you copy" is in
CLAUDE.md because the copies drift (`notify.ts` differs on purpose; `coachGoals.ts` must not). A package makes
"must stay identical" a fact. Modules that differ on purpose stay in each app.

**Order (each step leaves everything working):**
1. Move the shared modules into a `packages/shared` folder **inside this repo** first, imported by both apps (a workspace). Fix what breaks while it is still one repo.
2. Generate `types/db.ts` from the database (`supabase gen types`) in `corefitness-db` and publish it with the package, so a column change reaches both apps as a type error.
3. Split with `git filter-repo` so each new repository keeps its own history.
4. Give each repository its own CI (today's `scripts/ci/ui-checks.json` splits by `"app"` already).
5. Point each Vercel project at its new repository; check env vars exist **before** the first deploy (Vite inlines them).
6. Archive this repository read-only, with a README pointing to the six.

**Rename while splitting:** `g-fitness-admin` / `g-fitness-member` were left alone on purpose (CLAUDE.md); a
split is the one moment renaming costs nothing extra.

## 4. Staging beside production

Today a migration is pasted straight into the database gyms use. With paying gyms:

- **Two Supabase projects: staging and production.** Same migrations, different data. Staging holds Core Fitness Lab and fixtures; production holds real gyms only.
- **Every migration goes to staging first**, then the probe and the red team run against staging, then the same file is pasted into production. The one-at-a-time rule stays (CLAUDE.md: `db push` is wrong here).
- **Vercel Preview deploys point at staging** (Preview env vars), **Production at production.** A preview link can then never touch a real gym.
- **Secrets differ per project**: PayMongo test keys on staging, live keys only on production; VAPID, Resend and Claude keys per project.
- **Edge Functions deploy to staging first** with the same `--use-api` command, changing `--project-ref`.
- The platform owner's test gym moves to staging; production lists only real gyms.

## 5. When G Fitness becomes the first paying gym

Before they re-apply through the site (their last step, CLAUDE.md → *Fresh start*):
1. **Move to Lean (§2)** — Supabase Pro and Vercel Pro first: a paused database or a non-commercial plan cannot carry a paying customer.
2. **Prove PayMongo** — the queued live test: one small plan paid by QR Ph must show Paid on Money.
3. **Own domain and sending domain** — invitations from the gym's own-looking address, not a free-tier sender.
4. **Turn on alerts** — uptime and errors, sent to the platform owner's phone.
5. **Check the legal pages** — the gym documents (`#legal/terms|dpa|privacy`) published at the version G Fitness agrees to; Privacy names every vendor that now processes data (Supabase, Vercel, Resend, PayMongo, Anthropic for the AI coach) and where.
6. **Restore drill** — restore last week's backup into staging once, and time it. A backup never restored is a hope.
7. **Write the support promise** — how G Fitness reaches us, and how fast we answer.

After they are live: watch the first month's bills against §2, and move to Standard when the second gym signs
or the database passes half its size.

## 6. What does not change
RLS stays the boundary; rules stay in SQL; members are archived, never deleted; migrations stay pasted by hand
and probed; the checks in CI stay the gate. The split and the tiers change **where** things run and **who pays**,
not how the system decides anything.

## Sources (prices)
[Supabase pricing](https://supabase.com/pricing.md) · [Vercel Pro plan](https://vercel.com/docs/plans/pro-plan) ·
[Resend pricing](https://resend.com/pricing.md) · [.ph domain prices](https://domainoffer.net/tld/ph)
