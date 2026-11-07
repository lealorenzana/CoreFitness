# Demo gyms for the load test (0238)

The evaluators asked for **50 gyms × 200 members** — real accounts that sign in — and an easy way to remove
them afterwards, on the free Supabase plan.

## Build them

1. Paste `supabase/migrations/0238_demo_gyms.sql` in the Supabase SQL editor (once).
2. Open the **platform app** (`corefitness-platform`, localhost) → **Platform** → card **Demo gyms for a load test**.
3. Press **Create demo gyms**, type `create`, keep the tab open. 300 small steps, about 5–10 minutes, with a
   progress bar. If it stops (closed tab, lost connection), press it again — it carries on where it stopped.
4. Press **Download logins (CSV)** for every account: gym, town, role, username, password, where to sign in.

## What each gym has

* 1 owner, 1 front desk, 3 coaches, 200 members — all real sign-ins
* Priced plans (Free, Monthly, Premium); a mix of the platform's Growth and Pro plans, never billed
* About six months of payments at the desk (with receipt numbers), about one check-in a week per member
  (regulars more), memberships active / expired / frozen / free
* 24 trainees on 3-month packages, weekly 1-on-1 sessions, chats with their coach
* Points for the last 30 days of check-ins, and the badges each member truly met
* Listed on the website and in the app's **Find a gym**, marked **Demo**, after the real gyms

Made-up gym names in real Philippine towns (Mamburao, Calapan, Cebu City, Davao City…), Filipino names.

## Sign in

Every demo account uses the **same password: `CoreDemo-2026`**

| Who | Username | Where |
|---|---|---|
| Owner of gym 7 | `gym07.owner` | https://corefitness-admin.vercel.app |
| Front desk | `gym07.desk` | https://corefitness-admin.vercel.app |
| Coaches | `gym07.coach1` … `gym07.coach3` | https://corefitness-gym.vercel.app → Trainer |
| Members | `gym07.m001` … `gym07.m200` | https://corefitness-gym.vercel.app |

Gyms are `gym01` … `gym50`. Sign in with the **username** in the email box — the system accepts either (0236).
No real email is used: each account's address is a stand-in that is never mailed.

## Remove them

Platform app → the same card → **Remove demo gyms**, type `remove`. Two steps per gym: its rows, then its
people and sign-ins. Only gyms marked Demo are touched — Core Fitness Lab, Lab 2 and every real gym stay.

## Size

About 10,250 accounts and a few hundred thousand history rows — roughly half of the free plan's 500 MB.
The database was 38 MB before. Remove them after the presentation to get the space back.

Tested in `scripts/sql/demo-gyms.mjs` (40 checks: build, sign-in fields, history, points, badges, the Demo mark,
removal leaves nothing, the Lab untouched).
