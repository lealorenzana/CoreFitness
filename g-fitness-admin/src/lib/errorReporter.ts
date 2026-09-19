import { supabase } from './supabaseClient';

/**
 * Files a row in `client_errors` (0095) when something breaks, so the gym
 * learns about a crash without waiting for someone to complain.
 *
 * **Identical in both apps** apart from the `app` passed to `installErrorReporter`
 * — keep them in step (the same rule as lib/coachGoals.ts).
 *
 * Fire-and-forget and never throws: reporting an error must not become a second
 * error. At most 8 reports per page load, and the same message only once, so a
 * render loop cannot flood the table (the database also caps it at 300 an hour).
 * Before 0095 is pasted the insert fails quietly and nothing else changes.
 */

type App = 'member' | 'admin';

let app: App = 'member';
let sent = 0;
const seen = new Set<string>();
const MAX_PER_LOAD = 8;

/** Noise browsers raise that says nothing about the app. */
const IGNORE = [/ResizeObserver loop/i, /^Script error\.?$/i, /Non-Error promise rejection captured/i];

export function reportError(err: unknown, extra?: { where?: string }): void {
  try {
    const e = err instanceof Error ? err : new Error(typeof err === 'string' ? err : JSON.stringify(err));
    const message = `${extra?.where ? `[${extra.where}] ` : ''}${e.message || 'Unknown error'}`.slice(0, 1000);
    if (IGNORE.some((re) => re.test(e.message))) return;
    if (seen.has(message) || sent >= MAX_PER_LOAD) return;
    seen.add(message);
    sent += 1;
    const script = Array.from(document.scripts).map((s) => s.src).find((src) => /\/assets\/index-/.test(src));
    void supabase.from('client_errors').insert({
      app,
      route: location.pathname.slice(0, 300),
      message,
      stack: (e.stack ?? '').slice(0, 4000) || null,
      user_agent: navigator.userAgent.slice(0, 300),
      build: script ? script.split('/').pop()?.slice(0, 80) ?? null : 'dev',
    }).then(() => undefined, () => undefined);
  } catch {
    /* never let the reporter throw */
  }
}

export function installErrorReporter(which: App): void {
  app = which;
  window.addEventListener('error', (ev) => reportError(ev.error ?? ev.message));
  window.addEventListener('unhandledrejection', (ev) => reportError(ev.reason, { where: 'promise' }));
}
