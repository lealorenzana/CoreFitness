import { supabase } from '../supabaseClient';

/**
 * Web push subscription management.
 *
 * The Settings switch this backs is the real thing: turning it on asks the
 * browser for permission and registers an endpoint the send-push Edge Function
 * will actually deliver to. Turning it off unregisters that endpoint.
 *
 * Subscriptions are per install, not per member — the same person may have the
 * app on a phone and a laptop, and switching push off on one must not silence
 * the other.
 */

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export type PushSupport =
  | { supported: true }
  | { supported: false; reason: string };

/** Why push can't work here, in words a member can act on. */
export function pushSupport(): PushSupport {
  if (typeof window === 'undefined') return { supported: false, reason: 'Not available here' };
  if (!('serviceWorker' in navigator)) {
    return { supported: false, reason: 'This browser has no service worker support' };
  }
  if (!('PushManager' in window)) {
    // The usual case on iOS Safari in a tab: push only works once the app has
    // been added to the home screen, so this is worth saying plainly.
    return { supported: false, reason: 'Add the app to your home screen to enable notifications' };
  }
  if (!VAPID_PUBLIC_KEY) {
    return { supported: false, reason: 'Push is not configured for this deployment' };
  }
  return { supported: true };
}

/**
 * VAPID keys are base64url; PushManager wants raw bytes.
 *
 * Backed by an explicit ArrayBuffer rather than `Uint8Array.from(...)`: under
 * TypeScript 5.7 the latter widens to `Uint8Array<ArrayBufferLike>`, which no
 * longer satisfies `BufferSource` and fails the build.
 */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalised = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalised);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return null;
  return reg.pushManager.getSubscription();
}

/**
 * True when a service worker is actually registered — not merely supported.
 *
 * `vite-plugin-pwa` does not register one on the dev server, so on
 * `localhost:5173` the browser reports full push *capability* while having
 * nothing to subscribe with.
 */
export async function hasServiceWorker(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) return false;
  return (await navigator.serviceWorker.getRegistration()) != null;
}

/**
 * `navigator.serviceWorker.ready` never rejects and never times out — with no
 * registration it simply hangs forever. Awaiting it directly left the Settings
 * toggle stuck in its disabled/"busy" state with no error and no way back,
 * which read as the switch being dead.
 */
async function readyRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration();
  if (!existing) {
    throw new Error(
      'Push needs the installed app. Open Core Fitness from your home screen or at its web address — it is not available on the dev server.'
    );
  }
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('The app’s background worker did not start. Reload and try again.')), 8000)
    ),
  ]);
}

/** True when this install is registered AND the browser still permits it. */
export async function isPushEnabled(): Promise<boolean> {
  if (!pushSupport().supported) return false;
  if (Notification.permission !== 'granted') return false;
  return (await currentSubscription()) != null;
}

/**
 * Ask for permission, subscribe, and store the endpoint.
 * Throws with a readable message — the caller surfaces it as a toast.
 */
export async function enablePush(): Promise<void> {
  const support = pushSupport();
  if (!support.supported) throw new Error(support.reason);

  // Registration is checked BEFORE asking for permission. Prompting first and
  // failing afterwards costs the member a decision they can't take back — a
  // denied permission can only be undone in browser settings, not re-prompted.
  if (!(await hasServiceWorker())) {
    throw new Error(
      'Push needs the installed app. Open Core Fitness from your home screen or at its web address — it is not available on the dev server.'
    );
  }

  const permission = await Notification.requestPermission();
  if (permission === 'denied') {
    // A denied permission cannot be re-prompted; only the browser's own site
    // settings can undo it, so saying "try again" would be a lie.
    throw new Error('Notifications are blocked for this site. Allow them in your browser settings first.');
  }
  if (permission !== 'granted') throw new Error('Notification permission was not granted');

  const reg = await readyRegistration();
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY!),
    }));

  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error('You need to be signed in to turn on notifications');

  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
    throw new Error('This browser returned an incomplete subscription');
  }

  // Upsert on endpoint: re-subscribing the same install must not accumulate
  // duplicate rows that would each deliver the same notification.
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: userId,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      user_agent: navigator.userAgent.slice(0, 300),
    },
    { onConflict: 'endpoint' }
  );
  if (error) throw error;
}

/** Unsubscribe this install and forget its endpoint. */
export async function disablePush(): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;

  const endpoint = sub.endpoint;
  // Drop the row first: if unsubscribe() succeeds and the delete then fails,
  // the sender keeps pushing to an endpoint nothing can receive.
  const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
  if (error) throw error;
  await sub.unsubscribe().catch(() => {});
}

/**
 * Drop this device's push subscription as part of signing out.
 *
 * `push_subscriptions.endpoint` is UNIQUE — one row per install — and nothing
 * used to clear it on logout. So a phone kept delivering the previous account's
 * notifications to whoever signed in next: log out as a member, log in as a
 * trainer, and the member's booking alerts still arrive, with their content, on
 * a screen they no longer control. Reported from a real phone.
 *
 * Three things about the order matter:
 *
 *  1. **Before `signOut()`, never after.** The delete policy is
 *     `user_id = auth.uid()`, so it only works while the session is still the
 *     one that owns the row. Run it afterwards and PostgREST deletes zero rows
 *     and reports success — the documented trap that makes a no-op look done.
 *  2. **`unsubscribe()` happens even when the delete fails**, which is the
 *     opposite of `disablePush()`. Killing the browser subscription is the
 *     guarantee that actually stops delivery to this handset; the row is
 *     bookkeeping. `send-push` prunes on the 410 the dead endpoint now returns,
 *     so the row cleans itself up on the next send.
 *  3. **It never throws.** A member on a bad connection must still be able to
 *     sign out — refusing to log out is worse than a stale row, especially on
 *     the shared phone this bug is about.
 */
export async function clearPushOnSignOut(): Promise<void> {
  let sub: PushSubscription | null = null;
  try {
    sub = await currentSubscription();
  } catch {
    return; // no service worker, nothing subscribed — nothing to clear
  }
  if (!sub) return;

  try {
    await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  } catch {
    // Network failure. Deliberately swallowed and NOT allowed to skip the
    // unsubscribe below — the first draft awaited both in one try block, so a
    // rejected delete jumped past unsubscribe() and left the handset still
    // receiving. The row surviving is recoverable; the live subscription is
    // the actual leak.
  }

  // Always. This is what stops delivery to this device, and the 410 it now
  // returns is what makes send-push prune the row on its next send.
  await sub.unsubscribe().catch(() => {});
}
