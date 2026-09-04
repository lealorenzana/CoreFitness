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

Run it. A throwaway container, as a **non-superuser**:

```bash
docker run -d --name cf-sqltest -e POSTGRES_PASSWORD=pw -e POSTGRES_DB=cf postgres:16-alpine
```

Build a minimal fixture for the tables the migration touches (stub `auth.uid()` to read
`current_setting('request.jwt.claim.sub')`), apply the migration, then assert behaviour in a
`do $$ … $$` block so a failure aborts loudly instead of printing a row nobody reads.

Two traps:

- **A table owner bypasses RLS entirely.** A policy assertion run as `postgres` passes whether or not
  the policy works. Switch to a dedicated role.
- **`SET LOCAL ROLE` outside a transaction silently does nothing** — it warns and carries on as the
  owner, so the whole check passes for the wrong reason. Wrap it in `begin; … rollback;` and assert
  `current_user` before trusting anything that follows.

On Git Bash, `docker cp`/`docker exec` mangle container paths; prefix with `MSYS_NO_PATHCONV=1`.

**When Docker will not start**, `npx pgsql-parser` checks top-level syntax and `language sql` bodies —
but **plpgsql bodies are opaque to it**, which is exactly where the interesting bugs live. Say so
rather than implying the migration was verified.

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
