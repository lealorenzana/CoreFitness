/**
 * What each screen last read, kept on this phone so the app still shows
 * something with no signal (owner's request, 2026-10-27: "it should still load
 * and then sync when it connects").
 *
 * ## How
 *
 * The Supabase client's `fetch` goes through `offlineFetch`. A read that
 * succeeds is saved; a read that fails *because there is no connection* is
 * answered from what was saved, and the app is told (`savedAsOf`) so the
 * banner can say "Offline · as of 3:40 PM". Online, nothing changes: every
 * read still goes to the database first, and the database stays the record.
 *
 * A read is a table `GET`/`HEAD`, `GET /auth/v1/user`, or an RPC on `READ_RPCS`
 * — never any other RPC, because answering a write (`cancel_booking`) from a
 * saved reply would claim something happened that did not.
 *
 * ## Whose
 *
 * Each saved reply is filed under the account signed in on this phone (the
 * session in storage), so one person's data can never answer another's. The
 * whole store is emptied by `clearOfflineReads()`, which `clearMemberCaches()`
 * calls on sign-out, on a gym switch, and whenever the account changes.
 *
 * Cache Storage, not localStorage: it holds replies (status, headers, body)
 * and is sized for them. Where it does not exist, this does nothing.
 */

const STORE = 'cf-reads-v1';
/** Older than this, a saved reply is not worth showing as "what you last saw". */
const MAX_AGE_MS = 30 * 86_400_000;

/** RPCs that only read. A name missing here is never answered from the phone. */
const READ_RPCS = new Set([
  'achievement_progress', 'achievement_rarity', 'ai_coach_status', 'assignment_detail', 'challenge_progress',
  'class_waitlist_status', 'coach_timeline', 'coaching_settings', 'current_gym_goal', 'goal_current_value',
  'goal_progress', 'gym_join_rules', 'gym_online_pay', 'gym_photo_usage', 'gym_traffic', 'list_gyms',
  'may_rate_trainer', 'member_commitments', 'member_exercise_history', 'member_last_sets',
  'member_personal_records', 'member_points_balance', 'member_progression', 'member_squad',
  'member_squad_streak', 'member_streak', 'my_ai_proposals', 'my_booking_modes', 'my_coach_setup',
  'my_coaches', 'my_coachings', 'my_conversations', 'my_day_pass', 'my_due_classwork', 'my_features',
  'my_gym_app', 'my_gym_context', 'my_gyms', 'my_house_rules', 'my_invitation', 'my_member_checkouts',
  'my_membership_request', 'my_payment_account', 'my_referral_code', 'my_referrals', 'my_room_photos',
  'my_rooms', 'my_season', 'my_signup_state', 'my_squad', 'my_squad_streak', 'my_streak',
  'my_trainer_ratings', 'my_waiver_status', 'my_whats_new', 'parq_questions', 'plan_allows', 'pr_wall',
  'program_day_targets', 'program_progress', 'public_plans', 'refund_quote', 'room_badges',
  'room_classwork', 'room_people', 'room_progress', 'room_stream', 'season_board', 'shop_catalog',
  'squad_board', 'squad_streaks', 'trainee_progress_photos', 'trainer_review_queue',
  'workout_session_summary',
]);

let base = '';
let storageKey = '';

/** Called once by the client: where the database is, and where the session is kept. */
export function configureOfflineReads(supabaseUrl: string, sessionKey: string): void {
  base = supabaseUrl.replace(/\/$/, '');
  storageKey = sessionKey;
}

type StoredSession = { user: { id: string } & Record<string, unknown>; access_token: string; refresh_token: string } & Record<string, unknown>;

/**
 * This app's own copy of the sign-in, for offline.
 *
 * supabase-js can drop its stored session when a refresh fails with no signal
 * (seen in the offline check: an hour-old session, offline, came back as "no
 * session" and was gone from storage), which sent a member to Login in the gym
 * with no bars. So the last good session is copied here too: it opens the app
 * offline, and once the signal is back it signs in again with its refresh
 * token (supabaseClient.ts) — which the server can still refuse.
 *
 * It is the same data supabase-js already keeps in localStorage, and it goes
 * where that goes: `logout()` removes it first, and a sign-out while online
 * (an account revoked) removes it too.
 */
const MIRROR = 'cf:offline-session:v1';

export function keepOfflineSession(session: unknown): void {
  try { if (session) localStorage.setItem(MIRROR, JSON.stringify(session)); } catch { /* storage blocked */ }
}

export function forgetOfflineSession(): void {
  try { localStorage.removeItem(MIRROR); } catch { /* storage blocked */ }
}

function parse(raw: string | null): StoredSession | null {
  try {
    const s = raw ? JSON.parse(raw) : null;
    return s?.user?.id && s.refresh_token ? s : null;
  } catch {
    return null;
  }
}

/** The copy alone — what `supabaseClient.ts` signs back in with. */
export function offlineSessionCopy(): StoredSession | null {
  try { return parse(localStorage.getItem(MIRROR)); } catch { return null; }
}

/** The account signed in on this phone: supabase-js's session, else this app's copy. */
export function storedSession(): StoredSession | null {
  try {
    return parse(storageKey ? localStorage.getItem(storageKey) : null) ?? offlineSessionCopy();
  } catch {
    return null;
  }
}

/** True when the failure was the connection, not the server saying no. */
export function isOffline(err?: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  if (err == null) return false;
  const name = typeof err === 'object' && err && 'name' in err ? String((err as { name: unknown }).name) : '';
  const msg = err instanceof Error ? err.message : String((err as { message?: unknown })?.message ?? err);
  return name === 'AuthRetryableFetchError'
    || /Failed to fetch|NetworkError|Load failed|Network request failed|fetch failed|ERR_INTERNET_DISCONNECTED/i.test(msg);
}

// ── Which screens are showing saved data ─────────────────────────────────────

let oldestShown: number | null = null;
const listeners = new Set<() => void>();

/** When the oldest saved reply now on screen was read, or null when all is live. */
export function savedAsOf(): number | null {
  return oldestShown;
}

export function subscribeSaved(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

function noteShown(at: number) {
  if (oldestShown != null && oldestShown <= at) return;
  oldestShown = at;
  listeners.forEach((f) => f());
}

// ── Back online ──────────────────────────────────────────────────────────────

let tick = 0;

/** Bumps when the screens should read again; the layouts key the page on it. */
export function syncTick(): number {
  return tick;
}

/** Re-reads every open screen live (the layouts remount the page). */
export function refreshScreens(): void {
  tick += 1;
  oldestShown = null;
  listeners.forEach((f) => f());
}

const typing = () => {
  const el = typeof document !== 'undefined' ? document.activeElement : null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || (el as HTMLElement).isContentEditable);
};

// When the signal returns, a screen that showed saved data reads again — unless
// someone is typing, whose words a remount would throw away: then the banner
// offers Refresh instead (OfflineBanner).
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    if (oldestShown != null && !typing()) refreshScreens();
    else listeners.forEach((f) => f());
  });
  window.addEventListener('offline', () => listeners.forEach((f) => f()));
}

// ── The store ────────────────────────────────────────────────────────────────

function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}

/** The saved-reply key for a read, or null when it is not a read this keeps. */
function keyFor(url: string, method: string, headers: Headers, body: string | null): string | null {
  if (!base || !url.startsWith(base)) return null;
  const path = url.slice(base.length);
  const isRead =
    ((method === 'GET' || method === 'HEAD') && path.startsWith('/rest/v1/') && !path.startsWith('/rest/v1/rpc/'))
    || (method === 'GET' && path.startsWith('/auth/v1/user'))
    || (method === 'POST' && READ_RPCS.has(path.slice('/rest/v1/rpc/'.length).split('?')[0]));
  if (!isRead) return null;
  const who = storedSession()?.user.id;
  if (!who) return null;
  // One row and many rows are different answers to the same URL; so is a count.
  const shape = [headers.get('accept') ?? '', headers.get('prefer') ?? ''].join('|');
  return `https://cf-offline.local/${who}/${method}/${hash(path + '#' + shape + '#' + (body ?? ''))}`;
}

async function save(key: string, res: Response): Promise<void> {
  try {
    const body = await res.clone().arrayBuffer();
    const headers = new Headers();
    for (const h of ['content-type', 'content-range', 'preference-applied']) {
      const v = res.headers.get(h);
      if (v) headers.set(h, v);
    }
    headers.set('x-cf-saved-at', String(Date.now()));
    const cache = await caches.open(STORE);
    await cache.put(key, new Response(body, { status: res.status, headers }));
  } catch { /* storage full or blocked — it just will not be there offline */ }
}

async function saved(key: string): Promise<Response | null> {
  try {
    const cache = await caches.open(STORE);
    const hit = await cache.match(key);
    if (!hit) return null;
    const at = Number(hit.headers.get('x-cf-saved-at')) || 0;
    if (Date.now() - at > MAX_AGE_MS) return null;
    noteShown(at);
    return hit;
  } catch {
    return null;
  }
}

/** The Supabase client's fetch: live first, the saved reply when there is no signal. */
export async function offlineFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const req = input instanceof Request ? input : null;
  const url = req ? req.url : String(input);
  const method = (init?.method ?? req?.method ?? 'GET').toUpperCase();
  const headers = new Headers(init?.headers ?? req?.headers);
  const body = typeof init?.body === 'string' ? init.body : null;
  const key = typeof caches !== 'undefined' ? keyFor(url, method, headers, body) : null;
  if (!key) return fetch(input, init);

  // Known to be offline: answer at once rather than wait on a request that cannot go.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    const hit = await saved(key);
    if (hit) return hit;
  }
  try {
    const res = await fetch(input, init);
    if (res.ok) void save(key, res);
    return res;
  } catch (err) {
    if (isOffline(err) || err instanceof TypeError) {
      const hit = await saved(key);
      if (hit) return hit;
    }
    throw err;
  }
}

/** Every saved reply, gone — sign-out, a gym switch, a different account. */
export function clearOfflineReads(): void {
  oldestShown = null;
  listeners.forEach((f) => f());
  if (typeof caches !== 'undefined') void caches.delete(STORE).catch(() => undefined);
}
