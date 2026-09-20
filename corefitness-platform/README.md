# Core Fitness — the platform app

The service's own app: the gyms on Core Fitness, the gyms asking to join, and
what the platform has done. **Runs on the owner's machine only** (`:5175`) —
letting a gym in and suspending one are the two most consequential actions in
the system, and neither belongs on the open internet. The gym owners' app is
`corefitness-admin.vercel.app`; members and coaches use the phone app.

```bash
npm install
cp .env.example .env.local     # same project as the other two apps, anon key
npm run dev                    # :5175
```

## Before it will let you in

1. Paste **`supabase/migrations/0106_platform.sql`** (then `scripts/sql/verify/verify0106.sql`).
2. Add yourself, by hand, in the Supabase SQL editor:

   ```sql
   insert into platform_admins (user_id)
   select id from profiles where lower(email) = lower('you@example.com');
   ```

   There is deliberately no screen for this: `platform_admins` has no insert
   policy at all (0097), so the only way in is a decision made in the database.

Signing in is not the same as being let in — an account outside
`platform_admins` is signed straight back out and told so.

## What it can and cannot see

It calls nothing but SECURITY DEFINER functions that check `platform_admins`
(0106): gyms with **counts and status**, applications, crash reports, and its
own decision log. It reads **no member, payment or attendance row of any gym** —
under the Data Privacy Act each gym is the controller of its members' data and
Core Fitness is only the processor. `scripts/sql/tenancy-isolation.mjs` asserts
exactly that, in CI, on every push.

Every decision is written to `platform_events` with who made it and why: a
suspension without a reason is refused, the same way a member's is (0069).

## Not here yet

**Inviting a new gym's owner by email.** That needs the Auth admin API and so a
server-side function (`approve-gym`, Part C). Until it exists, approving an
application creates the gym — seeded with Core Fitness's plans, rules and badges
so it opens working — and the owner joins by signing up in the phone app or
being named from the Gyms screen. The screen says so rather than implying an
email went out.
