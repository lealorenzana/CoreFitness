import { addSet, type NewSet } from './api/workoutSets';
import { reportError } from './errorReporter';

/**
 * Sets logged with no signal (2026-09-19).
 *
 * The gym floor is where the signal is worst, and a set used to be lost with a
 * "Could not save that set" if the network blinked at the moment of the tap.
 * Now a set that cannot be sent waits here and goes up when the connection
 * returns.
 *
 * **Why this is on the device.** CLAUDE.md's rule is that per-user *state*
 * never lives in localStorage. This is not state; it is a short-lived outbox of
 * writes that have not reached the database yet — the database stays the
 * record, and an entry leaves this list the moment the server has it. It has
 * to survive the app being closed, which memory would not. Entries carry the
 * member id and only the signed-in member's are ever sent, so a shared phone
 * cannot post one member's set as another's (RLS would refuse it anyway).
 *
 * **Why a resend cannot double-count.** Each set gets its id on the phone
 * (`crypto.randomUUID()`) before the first attempt. If a request reached the
 * server but the reply was lost, the retry hits the primary key and fails with
 * 23505 — which is treated as "already there".
 */

export interface QueuedSet {
  id: string;
  logId: string;
  memberId: string;
  set: NewSet;
  queuedAt: number;
}

const KEY = 'cf:set-outbox:v1';

function read(): QueuedSet[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as QueuedSet[]) : [];
  } catch {
    return [];
  }
}

function write(list: QueuedSet[]): void {
  try {
    if (list.length === 0) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(list));
  } catch { /* storage full or blocked — the set stays in memory for this session */ }
}

/** True when the failure was the connection, not the database saying no. */
export function isNetworkError(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const msg = err instanceof Error ? err.message : typeof err === 'object' && err && 'message' in err ? String((err as { message: unknown }).message) : String(err);
  return /Failed to fetch|NetworkError|Load failed|Network request failed|fetch failed|ERR_INTERNET_DISCONNECTED|timed? ?out/i.test(msg);
}

export function newSetId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });
}

export function queueSet(entry: QueuedSet): void {
  write([...read().filter((q) => q.id !== entry.id), entry]);
}

export function pendingFor(logId: string, memberId: string): QueuedSet[] {
  return read().filter((q) => q.logId === logId && q.memberId === memberId);
}

export function dropQueued(id: string): void {
  write(read().filter((q) => q.id !== id));
}

let flushing: Promise<{ sent: number; left: number }> | null = null;

/**
 * Sends what is waiting for this member, oldest first. Stops at the first
 * network failure (the rest would fail too). A set the database *refuses* —
 * not a network problem — is dropped and reported, so one bad row cannot jam
 * the queue forever.
 */
export function flushOutbox(memberId: string): Promise<{ sent: number; left: number }> {
  if (flushing) return flushing;
  flushing = (async () => {
    let sent = 0;
    const mine = read().filter((q) => q.memberId === memberId).sort((a, b) => a.queuedAt - b.queuedAt);
    for (const q of mine) {
      try {
        await addSet(q.logId, q.set, q.id);
        dropQueued(q.id);
        sent += 1;
      } catch (err) {
        const code = (err as { code?: string } | null)?.code;
        if (code === '23505') { dropQueued(q.id); sent += 1; continue; }   // it had arrived after all
        if (isNetworkError(err)) break;
        dropQueued(q.id);
        reportError(err, { where: 'offline set refused' });
      }
    }
    return { sent, left: read().filter((q) => q.memberId === memberId).length };
  })();
  return flushing.finally(() => { flushing = null; });
}
