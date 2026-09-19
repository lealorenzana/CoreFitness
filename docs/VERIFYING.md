# Verifying work in this repo

There is no test framework here. That is a deliberate trade — the project is one person's capstone
against a deadline — and it means verification is done by **running the thing and measuring it**.

**A green build proves nothing.** Every visual bug this project has shipped compiled perfectly: a
wrong cascade layer, a focus ring resolving to white, Tailwind classes that emitted no CSS at all
for months. `tsc` cannot see any of that.

---

## The browser

Start the dev server with `preview_start` (never `npm run dev` through a shell — it will not be
reachable), then measure with `getComputedStyle` rather than looking.

**Screenshots frequently time out.** The Browser pane is often not displayed, and a page that is not
compositing produces no frames. This is the same condition that stops `requestAnimationFrame` and CSS
transitions from running, so it is not an accident you can retry your way past — read the DOM instead.
`element.innerText`, `getComputedStyle`, and `getBoundingClientRect` all work regardless.

**When you genuinely need to look at the screen, drive Playwright against `localhost` instead**
(2026-09-04). It runs its own browser, composites reliably, and writes a real file you can open. Two
things to know:

- **The Browser pane scales its screenshots down to the pane's own size.** Setting a 1440px viewport
  there and screenshotting returns an 800px image with the dashboard squeezed into a corner — the
  page is fine, the picture is not. Playwright returns the viewport at full size.
- **Playwright saves relative to the repo root**, not to a sandbox. Pass a path prefix
  (`.tmp-shots/foo.png`) or you will litter the project, and it writes its own `.playwright-mcp/`
  scratch directory there regardless — that one is git-ignored.

Admin Resources and member Workouts were both confirmed rendering this way.

### Verify against the built bundle, not the source

If a class looks like it does nothing, it probably does nothing:

```bash
npm run build && grep -o 'line-through' dist/assets/*.css
```

Or measure the live value — `getComputedStyle(el).textDecorationLine` — which is stronger, because it
accounts for cascade order as well as the rule existing.

## Calling into the running app

Pure functions can be imported from the dev server and called directly:

```js
const m = await import('/src/utils/planAccess.ts');
m.planAccess({ tier: 'free', can_book_classes: false, /* … */ });
```

### Components, too

`createRoot` a scratch node and render the real component inside a `MemoryRouter`.

```js
const React = (await import('/node_modules/.vite/deps/react.js?v=638eea85')).default;
const { createRoot } = (await import('/node_modules/.vite/deps/react-dom_client.js?v=638eea85')).default;
const { MemoryRouter } = await import('/node_modules/.vite/deps/react-router-dom.js?v=638eea85');
```

Three things bite here, all of them measured:

- **Use the exact versioned URL the app's own modules use.** Read it out of `/src/main.tsx`. A
  different `?v=` hash loads a second React instance and every context throws. The hash differs per
  app — member and admin do not share one.
- **`react-dom_client.js` exports only `default`.** `createRoot` is on `.default`, not a named export.
  Destructuring it directly gives `createRoot is not a function`.
- **Portalled UI lands outside your probe node.** Drawers and modals portal to `#modal-root` or
  straight onto `document.body`, so `host.innerText` will not contain them and can read as "nothing
  rendered". Query `document`, or find the portal root.

### Reaching a screen behind the login

Two approaches, and the second is much stronger.

**Seed the page cache** — enough for a screen that reads `lib/pageCache.ts`:

```js
const pc = await import('/src/lib/pageCache.ts');
pc.writeCache('member:home', { /* a MemberHome */ });
```

Its weakness: the screen's own refetch runs a moment later and overwrites your fixture, so what you
end up measuring may not be what you seeded.

**Stub `window.fetch` per REST path and plant a session.** This is better precisely because the real
services, the real API modules and the real assembly code all run — you are replacing the network,
not the app.

```js
const json = (b) => new Response(JSON.stringify(b), { status: 200, headers: { 'Content-Type': 'application/json' } });
const realFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input.url;
  if (url.includes('/rest/v1/membership_plans')) return json(PLANS);
  if (url.includes('/rest/v1/memberships'))      return json([MEMBERSHIP]);
  // Vite's own module requests must pass through untouched.
  if (url.startsWith('/') || url.includes('localhost:5173')) return realFetch(input, init);
  return json([]);
};
```

For anything calling `supabase.auth.getUser()` — `getCurrentMemberId()` does — a stub is not enough.
With no session, supabase-js returns an error **without making a network request**, so the stub never
fires. Plant a structurally valid session first:

```js
const sb = (await import('/src/lib/supabaseClient.ts')).supabase;
sb.auth.storageKey;  // 'sb-<projectref>-auth-token'
localStorage.setItem(sb.auth.storageKey, JSON.stringify({
  access_token: '<header>.<payload>.sig',   // base64url, payload needs sub + a future exp
  refresh_token: 'r', token_type: 'bearer', expires_at: Math.floor(Date.now()/1000) + 3600,
  user: { id: 'u1', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} },
}));
```

The token is never sent anywhere real — the stubbed `fetch` answers before it leaves.

**Then navigate without reloading.** A reload throws the `fetch` patch away and lands you back on the
login screen, so the obvious `location.href = '/resources'` undoes everything you just set up. Push
the route and let React Router pick it up:

```js
history.pushState({}, '', '/resources');
window.dispatchEvent(new PopStateEvent('popstate'));
```

`ProtectedRoute` then mounts, reads the planted session locally, and asks the stub for the profile —
answer `/rest/v1/profiles` with `[{ role: 'admin', status: 'active' }]`. Note PostgREST's two shapes:
`.single()` sends `Accept: application/vnd.pgrst.object+json` and wants the **object**, everything
else wants the **array**. Return the wrong one and the screen renders empty for no visible reason.

### Driving a React controlled input from a probe

Setting `.value` does not fire React's `onChange`. Go through the native setter:

```js
const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
set.call(input, '1998');
input.dispatchEvent(new Event('input', { bubbles: true }));
```

`HTMLSelectElement.prototype` and a `'change'` event for `<select>`.

### Proving a guard blocked a write

Count the requests. An error message on screen does not prove nothing was sent:

```js
let writes = 0;
const prev = window.fetch;
window.fetch = async (i, init) => {
  if (['POST','PATCH','DELETE'].includes((init && init.method) || 'GET')) writes++;
  return prev(i, init);
};
```

### Clean up

Remove probe nodes, restore `window.fetch`, and **delete the planted session** — leaving a fake token
in `localStorage` will confuse the next real page load.

---

## SQL

Run it. **Not in Docker** — Docker has never started in this environment, so anything written
as "run it in a container" is not a plan. `@electric-sql/pglite` is real PostgreSQL compiled to
WASM, in-process, installed with one `npm install` and needing no daemon and no credentials.

**`scripts/sql/` is the working harness** — its README lists the scripts and carries the traps.
**`tenancy-isolation.mjs` is the one to run after touching any policy or definer function**: it
builds the real schema from every migration (`lib/live-db.mjs`, demo seeds at their live position,
Supabase's grants) and proves two gyms cannot reach each other — see [TENANCY](TENANCY.md). Ad hoc
queries against that schema: `last-definition.py` for a function's current text. The shape: stub only the tables the migration touches, to the same column types the real
ones use; stub `auth.uid()` to read `current_setting('request.jwt.claim.sub')`; apply the migration
**verbatim from `supabase/migrations/`** so the test cannot drift from the file; then assert
behaviour from Node, where a refusal is a caught exception whose *message* can be asserted too.

Do this before believing a migration. The first run of `scripts/sql/trainer-decisions.mjs` found a
live privilege bug that four readings of 0071 had not.

Two traps:

- **Reproduce Supabase's roles first.** `create role anon; authenticated; service_role;`. Nearly
  every migration here revokes from `anon`, and a missing role fails the whole file with an error
  that looks nothing like the rule you were testing.
- **A table owner bypasses RLS entirely.** A policy assertion run as `postgres` passes whether or not
  the policy works. `set role authenticated`, then **assert `current_user`** before believing
  anything after it — `SET LOCAL ROLE` outside a transaction silently does nothing, warns, and
  carries on as the owner.
- **Copy a stubbed function's modifiers, not just its body.** `get_my_role()` is `security definer`;
  without those two words every policy that calls it fails with 42501, for a reason that has nothing
  to do with the rule under test.
- **RLS filters rows; it does not raise.** The correct result of "a trainer edits someone else's
  class" is **zero rows and no error**. Asserting on an exception there would fail against a
  perfectly working policy.

---

## Comparing a build against what is deployed

**A Windows build and a Linux build differ in filename hash while being byte-identical.** Vite hashes
module paths, and those differ by separator across platforms. **Compare with `cmp`, never by
filename** — a mismatched hash is not evidence of a stale deploy.

**Tailwind v4 emits ~6 more utility rules on Vercel than locally.** Its content scan picks up
false-positive words from files the local build did not walk, so deployed CSS is a **superset**, not
a difference. Assert the rules you care about are present; do not assert the two files are equal.

`@electric-sql/pglite` is real Postgres in Node, which is how the SQL harness runs at all — **Docker
has never started in this environment**, so anything written as "run it in Docker" is not a plan.

---

## Report honestly

Say plainly what ran and what did not. "Verified in a container, not against the live project" is a
useful sentence; "verified" on its own, when it means "it compiled", is how this project's two
false "no mock data remains" claims happened.

## Screenshotting a login-gated screen, end to end

`shots/admin-shots.js` and `shots/member-shots.js` are working examples of the
recipe above, driven with `browser_run_code_unsafe` (`filename:` — the file must
live under the repo root). Run one, and every `shots/*.png` is regenerated.

Four things that cost time getting them working, none of which are obvious:

- **`URL`, `Buffer` and `btoa` are all undefined** in the Playwright server
  process. Parse the request URL with string ops and hand-roll base64url.
- **`page.route()` beats a `window.fetch` patch**, and `addInitScript` beats
  setting `localStorage` after load — the session has to be there before any
  module reads it, and both survive the navigations.
- **PostgREST has two response shapes.** `.single()` sends
  `Accept: application/vnd.pgrst.object+json` and wants the **object**;
  everything else wants the **array**. Return the wrong one and the screen
  renders empty with no error.
- **Wait about 5 seconds, not 2.** The member app resolves a session, then a
  profile, then the page's own service assembles several tables. The first run
  photographed the boot splash on every page — *a screenshot taken early is not
  evidence of anything.*

- **A counted query needs `Access-Control-Expose-Headers: Content-Range`.**
  Without it the browser hides the header, supabase-js reads the total as
  unknown, and a paged list shows "Showing 6" with no pager — a fixture bug
  that looks exactly like an app bug. `scripts/fill-check.js` sets it.
- **Routes outlive a run.** The runner keeps one page, so a second run stacks
  its handlers on the first's; start with `page.unrouteAll()`.

**Page fill is measured, not eyeballed:** `scripts/fill-check.js` loads Trainers,
Payments, Revenue, Activity, Credentials and Schedule at 1918×909 and ×720 and
reports rows per page, the gap under the last row, whether `<main>` overflows,
and whether the pager is on screen — plus the credentials viewer's arrow keys
and reject-needs-a-reason. It regenerates `shots/30`–`37`.

**Fixture columns must match the real ones.** The first member run showed "You
need a membership before you can book" because `events` was seeded with
`event_date` when the app selects `starts_at`, and `my_features` was unanswered.
Log what the route actually receives before assuming the fixtures are right.

**What these prove and do not prove:** the layout, wiring and wording are the
real build; the data is invented. Good enough to show a feature renders and
reads correctly. Useless for showing a database rule works — that is what
`docs/TEST_MATRIX.md` is for.
