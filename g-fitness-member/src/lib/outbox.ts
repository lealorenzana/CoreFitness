import { isOffline, refreshScreens, storedSession } from './offlineReads';
import { reportError } from './errorReporter';

/**
 * Your own records and chat, saved with no signal and sent when it returns
 * (owner's request, 2026-10-27; the choice was "your own records + chat").
 *
 * A write that cannot reach the server because there is no connection waits
 * here; one the server *refuses* is never queued — that error stands, as
 * before. What queues: a message, a room post or comment, a body reading, a
 * target, profile details. Bookings, renewals and freeze/cancel requests are
 * not here on purpose: seats and the gym's decision are live, so they say
 * they need a connection.
 *
 * **Why on the device.** CLAUDE.md keeps per-user *state* off localStorage.
 * This is not state: it is writes that have not reached the database yet, the
 * same reasoning as `offlineSets.ts`, and it has to survive the app closing.
 * Every job carries the account that made it, and only that account's jobs are
 * ever sent, so a shared phone cannot post one person's message as another's.
 *
 * **Why a resend cannot double up.** An insert carries an id made on the phone,
 * so a retry after a lost reply hits the primary key (23505) and counts as
 * done. Edits are the same edit twice. The one exception is a chat message,
 * sent through `send_message()`, which takes no id: if the signal drops after
 * the server has it but before the reply, the resend can repeat it.
 *
 * A job stays with the account that made it through a logout and goes at that
 * person's next sign-in on this phone — it is their unsent work, not the next
 * person's, and nobody else's session ever sends it.
 *
 * Sent oldest first; the first network failure stops the run (the rest would
 * fail too). A job the server refuses is dropped and the person is told, so
 * one bad write cannot jam everything behind it.
 */

export type JobKind = 'message' | 'room-post' | 'room-comment' | 'measurement' | 'goal-add' | 'goal-update' | 'profile'
  | 'member-profile' | 'trainer-profile'
  // A workout started, finished or discarded with no signal (lib/api/routines.ts, offlineSets.ts).
  | 'workout-start' | 'workout-finish' | 'workout-discard';

export interface Job {
  id: string;
  kind: JobKind;
  userId: string;
  /** Plain words for the banner and for a refusal: "Message to Ana". */
  label: string;
  payload: Record<string, unknown>;
  queuedAt: number;
}

const KEY = 'cf:outbox:v1';
const senders = new Map<JobKind, (payload: Record<string, unknown>, job: Job) => Promise<void>>();
const listeners = new Set<() => void>();
let refused: ((label: string, reason: string) => void) | null = null;

/** Each API module says how to send its own kind. */
export function registerSender(kind: JobKind, send: (payload: Record<string, unknown>, job: Job) => Promise<void>): void {
  senders.set(kind, send);
}

/** Where a refused job is told to the person (the app wires a toast). */
export function onRefused(fn: (label: string, reason: string) => void): void {
  refused = fn;
}

function read(): Job[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Job[]) : [];
  } catch {
    return [];
  }
}

let cache: Job[] = read();
function write(list: Job[]): void {
  cache = list;
  memo = new Map();
  try {
    if (list.length === 0) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(list));
  } catch { /* storage full or blocked — the job stays in memory for this session */ }
  listeners.forEach((f) => f());
}

const me = () => storedSession()?.user.id ?? null;

export function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });
}

// One array per (account, kind) until the outbox changes, so React's
// `useSyncExternalStore` sees the same snapshot between changes.
let memo = new Map<string, Job[]>();

/** This account's waiting jobs, optionally of one kind. Stable between changes. */
export function pending(kind?: JobKind): Job[] {
  const who = me();
  const key = `${who}|${kind ?? ''}`;
  let hit = memo.get(key);
  if (!hit) {
    hit = cache.filter((j) => j.userId === who && (!kind || j.kind === kind));
    memo.set(key, hit);
  }
  return hit;
}

/** The number waiting, for the banner. */
export function pendingCount(): number {
  return pending().length;
}

export function subscribeOutbox(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/**
 * Sends now, or — when the connection is the problem — keeps it for later.
 * Returns `'queued'` so the screen can say "Waiting to send" instead of "Sent".
 * A refusal from the server is thrown, exactly as the plain call would.
 */
export async function sendOrQueue(kind: JobKind, label: string, payload: Record<string, unknown>): Promise<'sent' | 'queued'> {
  const send = senders.get(kind);
  if (!send) throw new Error(`No sender for ${kind}`);
  const userId = me();
  const job: Job = { id: newId(), kind, userId: userId ?? '', label, payload, queuedAt: Date.now() };
  const queue = () => {
    if (!userId) throw new Error('You are offline and not signed in on this phone.');
    write([...cache, job]);
    return 'queued' as const;
  };
  // Something already waiting goes first, so this cannot overtake it.
  if (pending().length > 0 || isOffline()) return queue();
  try {
    await send(payload, job);
    return 'sent';
  } catch (err) {
    if (isOffline(err)) return queue();
    throw err;
  }
}

/** Takes jobs back before they went — a workout discarded before it ever reached the server. */
export function cancelJobs(match: (j: Job) => boolean): void {
  const who = me();
  write(cache.filter((j) => !(j.userId === who && match(j))));
}

const after: (() => void)[] = [];
/** Runs after each send-through: the set outbox goes once its workouts have. */
export function afterFlush(fn: () => void): void {
  after.push(fn);
}

let flushing: Promise<number> | null = null;

/** Sends what this account has waiting, oldest first. Resolves to how many are left. */
export function flushOutbox(): Promise<number> {
  if (flushing) return flushing;
  flushing = (async () => {
    let sentAny = false;
    for (const job of pending().sort((a, b) => a.queuedAt - b.queuedAt)) {
      const send = senders.get(job.kind);
      if (!send) continue;
      try {
        await send(job.payload, job);
        sentAny = true;
        write(cache.filter((j) => j.id !== job.id));
      } catch (err) {
        const code = (err as { code?: string } | null)?.code;
        if (code === '23505') { write(cache.filter((j) => j.id !== job.id)); sentAny = true; continue; }
        if (isOffline(err)) break;
        write(cache.filter((j) => j.id !== job.id));
        reportError(err, { where: `outbox refused: ${job.kind}` });
        refused?.(job.label, err instanceof Error ? err.message : 'The server refused it.');
      }
    }
    // What was sent now shows as the real thing on screen.
    if (sentAny) refreshScreens();
    after.forEach((f) => f());
    return pending().length;
  })();
  return flushing.finally(() => { flushing = null; });
}

// Send when the signal comes back, and once at start for anything left from last time.
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { void flushOutbox(); });
  window.setTimeout(() => { if (navigator.onLine) void flushOutbox(); }, 4000);
}
