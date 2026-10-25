import { supabase } from './supabaseClient';
import { validateQR } from '../services/checkInService';
import { matchesCheckInCode, normaliseCheckInCode } from '../utils/checkInCode';
import type { MemberWithProfile } from './api/members';

/**
 * Check-ins scanned with no connection (0211).
 *
 * The kiosk and the desk check members in against the database, so an
 * internet outage stopped the door. A scan can still be *read* offline — the
 * member app's QR carries the member's id and when it was made, and a typed
 * six-character code matches the roster the page already loaded — so it is
 * saved here, on this device, with the time it was scanned. When the
 * connection is back, record_offline_checkin() applies the rules to the
 * scanned day and records the visit at that time, or says why not.
 *
 * Device state, not a person's: the queue belongs to the door, keyed by gym so
 * a device moved to another gym never sends one gym's scans to the other (the
 * same reason lib/offlineSets.ts exists in the member app). Refused scans are
 * kept for the desk — the kiosk faces the room and never shows why.
 */
export interface SavedScan {
  id: string;
  memberId: string;
  name: string;
  scannedAt: string;
  method: 'qr' | 'manual';
  source: 'desk' | 'kiosk';
}
export interface RefusedScan extends SavedScan { reason: string }

const QUEUE = (gym: string) => `cf-checkin-outbox:${gym}`;
const REFUSED = (gym: string) => `cf-checkin-refused:${gym}`;
const read = <T,>(key: string): T[] => {
  try { const v = JSON.parse(localStorage.getItem(key) ?? '[]'); return Array.isArray(v) ? v as T[] : []; } catch { return []; }
};
const write = (key: string, v: unknown[]) => {
  try { if (v.length) localStorage.setItem(key, JSON.stringify(v)); else localStorage.removeItem(key); } catch { /* storage blocked: the scan is lost, and add() said so */ }
};

/** Words for the desk, from record_offline_checkin()'s one-word answer. */
export const REASON: Record<string, string> = {
  duplicate: 'already checked in that day',
  frozen: 'membership frozen',
  no_membership: 'no usable membership that day',
  not_member: 'not an active member here',
  too_old: 'scanned more than 72 hours ago',
  future: 'stamped in the future — check this device’s clock',
};

/** A dropped connection, as opposed to the database saying no. */
export const isOffline = (err?: unknown): boolean => {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : (err as { message?: string } | undefined)?.message ?? '';
  return /Failed to fetch|NetworkError|Load failed|network request failed|ERR_INTERNET_DISCONNECTED/i.test(msg);
};

/**
 * Reads a scan with no connection: a member QR (not a coach's — coaches check in
 * online only), a six-character code from the loaded roster, or a member id on it.
 */
export function resolveOffline(raw: string, members: MemberWithProfile[]): { memberId: string; name: string; method: 'qr' | 'manual' } | { error: string } {
  const v = validateQR(raw.trim());
  if (v.kind === 'stale') return { error: 'That QR code has expired. Ask them to refresh it.' };
  if (v.kind === 'future') return { error: 'That code is stamped in the future — this device’s clock is behind.' };
  if (v.kind === 'ok') {
    if (v.data.coach) return { error: 'Coaches check in once the connection is back.' };
    const m = members.find((x) => x.profile.id === v.data.memberId);
    return { memberId: v.data.memberId, name: m?.profile.first_name ?? 'Member', method: 'qr' };
  }
  const typed = normaliseCheckInCode(raw);
  if (typed.length === 6 && /^[0-9a-f]{6}$/.test(typed)) {
    const hits = members.filter((m) => matchesCheckInCode(m.profile.id, typed));
    if (hits.length === 1) return { memberId: hits[0].profile.id, name: hits[0].profile.first_name, method: 'manual' };
    return { error: hits.length ? 'More than one member has that code.' : 'That code is not on this device’s list — try again when the connection is back.' };
  }
  const byId = members.find((m) => m.profile.id === raw.trim().toLowerCase());
  return byId ? { memberId: byId.profile.id, name: byId.profile.first_name, method: 'manual' } : { error: 'That code could not be read offline.' };
}

export function saveScan(gym: string, s: Omit<SavedScan, 'id' | 'scannedAt'>): boolean {
  const q = read<SavedScan>(QUEUE(gym));
  // One saved scan per member per day is enough; the rest would only come back as duplicates.
  const day = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
  if (q.some((x) => x.memberId === s.memberId && new Date(new Date(x.scannedAt).getTime() + 8 * 3600_000).toISOString().slice(0, 10) === day)) return true;
  q.push({ ...s, id: crypto.randomUUID(), scannedAt: new Date().toISOString() });
  write(QUEUE(gym), q);
  return read<SavedScan>(QUEUE(gym)).length === q.length;
}
export const savedScans = (gym: string) => read<SavedScan>(QUEUE(gym));
export const refusedScans = (gym: string) => read<RefusedScan>(REFUSED(gym));
export const clearRefused = (gym: string) => write(REFUSED(gym), []);

let flushing = false;
/**
 * Sends what is saved, oldest first. Stops at the first dropped connection
 * (the rest wait for the next try); a refused scan moves to the desk's list.
 * `missing` = 0211 is not pasted yet — nothing is sent and nothing is lost.
 */
export async function flushScans(gym: string): Promise<{ recorded: number; refused: number; left: number; missing: boolean }> {
  const out = { recorded: 0, refused: 0, left: savedScans(gym).length, missing: false };
  if (flushing || out.left === 0 || isOffline()) return out;
  flushing = true;
  try {
    for (const s of savedScans(gym)) {
      const { data, error } = await supabase.rpc('record_offline_checkin', {
        p_member: s.memberId, p_scanned_at: s.scannedAt, p_method: s.method, p_source: s.source, p_activity: null,
      });
      if (error) {
        if (error.code === 'PGRST202') { out.missing = true; break; }
        if (isOffline(error)) break;
        // Anything else is the database refusing it outright (a desk account switched off, say): the desk sees it.
        write(REFUSED(gym), [...refusedScans(gym), { ...s, reason: error.message }]);
        out.refused++;
      } else if (data === 'recorded') {
        out.recorded++;
      } else {
        write(REFUSED(gym), [...refusedScans(gym), { ...s, reason: REASON[data as string] ?? String(data) }]);
        out.refused++;
      }
      write(QUEUE(gym), savedScans(gym).filter((x) => x.id !== s.id));
    }
  } finally { flushing = false; }
  out.left = savedScans(gym).length;
  return out;
}
