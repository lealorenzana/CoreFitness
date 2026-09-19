import { getBalance } from '../lib/api/points';
import { getMemberByQrCode, type MemberWithProfile } from '../lib/api/members';
import { recordCheckIn } from '../lib/api/attendance';
import { getCurrentMembership, membershipIsUsable } from '../lib/api/memberships';
import { notifyUser } from '../lib/api/notify';
import { matchesCheckInCode } from '../utils/checkInCode';

/**
 * Checking a member in from a scanned or typed code — shared by the Attendance
 * desk and the self-service Kiosk (2026-09-19), so the two can never disagree
 * about which codes are valid or who may come in.
 *
 * The parsing below moved verbatim from pages/Attendance.tsx, reasoning intact.
 */

const QR_TTL_SECONDS = 60;

interface ParsedQr {
  memberId: string;
  timestamp: number;
}

/** Current member-app format: `CF1.<timestamp base36>.<member id>`. */
const parseCompactQr = (qrCode: string): ParsedQr | null => {
  const parts = qrCode.trim().split('.');
  if (parts.length !== 3 || parts[0].toUpperCase() !== 'CF1') return null;
  const timestamp = parseInt(parts[1], 36);
  if (!Number.isFinite(timestamp) || timestamp <= 0 || !parts[2]) return null;
  return { memberId: parts[2].toLowerCase(), timestamp };
};

/**
 * Legacy base64(JSON) payload. Still accepted because an installed phone app
 * keeps serving its cached bundle until the next deploy reaches it — dropping
 * this would lock those members out of check-in in the meantime.
 */
const parseLegacyQr = (qrCode: string): ParsedQr | null => {
  try {
    const data = JSON.parse(atob(qrCode));
    if (!data?.memberId || typeof data.timestamp !== 'number') return null;
    return { memberId: String(data.memberId).toLowerCase(), timestamp: data.timestamp };
  } catch {
    return null;
  }
};

/**
 * Tolerance, in each direction, for the member's phone and this PC disagreeing
 * about what time it is.
 *
 * The timestamp exists to stop a screenshot being reused, and nothing else. It
 * was compared against a bare 60-second window, which quietly assumed two
 * unsynchronised devices agree on the current time to within a minute. They
 * often do not: `Date.now()` is UTC epoch so time zones are irrelevant, but a
 * desk PC that has been off for a while, or whose clock service has not run,
 * drifts by minutes.
 *
 * The failure that produces is the nastiest kind. If this PC's clock is more
 * than 60 seconds AHEAD of the phone, every code the member generates is
 * already expired by the time it is scanned — so the desk tells them to refresh,
 * they refresh, it fails again, forever. Nothing about that loop points at the
 * clock.
 *
 * Three minutes of grace keeps a stolen screenshot useless while absorbing the
 * drift that actually occurs. When a code falls outside even that, the desk is
 * told the measured offset instead of "expired", because at that point the clock
 * is the thing to fix and no amount of refreshing will help.
 */
const CLOCK_SKEW_GRACE_SECONDS = 180;

type QrVerdict =
  | { kind: 'ok'; data: ParsedQr }
  /** Not one of our payloads at all — a short code or a UUID may still follow. */
  | { kind: 'not-ours' }
  | { kind: 'stale'; ageSeconds: number }
  | { kind: 'future'; aheadSeconds: number };

export const validateQR = (qrCode: string): QrVerdict => {
  const data = parseCompactQr(qrCode) ?? parseLegacyQr(qrCode);
  if (!data) return { kind: 'not-ours' };

  const ageMs = Date.now() - data.timestamp;
  if (ageMs < -CLOCK_SKEW_GRACE_SECONDS * 1000) {
    return { kind: 'future', aheadSeconds: Math.round(-ageMs / 1000) };
  }
  if (ageMs > (QR_TTL_SECONDS + CLOCK_SKEW_GRACE_SECONDS) * 1000) {
    return { kind: 'stale', ageSeconds: Math.round(ageMs / 1000) };
  }
  return { kind: 'ok', data };
};

/** "4 minutes" / "40 seconds" — for a message the desk can act on. */
export const describeGap = (seconds: number): string => {
  const s = Math.abs(seconds);
  if (s < 90) return `${s} seconds`;
  return `${Math.round(s / 60)} minutes`;
};


export type Resolved = { member: MemberWithProfile; method: 'qr' | 'manual' } | { error: string };

/**
 * Turns whatever reached the desk into a member, or a sentence saying why not.
 * Three shapes: the member app's rotating QR payload (carries a timestamp), the
 * six-character check-in code the member reads out when the camera won't focus,
 * and a full member UUID pasted from the Members page.
 *
 * Not `.catch(() => null)` on the lookups: that reported a permission error, a
 * dropped connection and an unknown member as the same sentence, which is how a
 * broken lookup can look like a member who does not exist.
 */
export async function resolveCheckInCode(raw: string, members: MemberWithProfile[]): Promise<Resolved> {
  const qr = raw.trim();
  const verdict = validateQR(qr);
  if (verdict.kind === 'stale') {
    // Distinguished from a genuine expiry on purpose. Past the grace window the
    // member refreshing again cannot help, so "ask them to refresh" would send
    // the desk round a loop that never terminates.
    return {
      error: verdict.ageSeconds > (QR_TTL_SECONDS + CLOCK_SKEW_GRACE_SECONDS) * 2
        ? `That code was made ${describeGap(verdict.ageSeconds)} ago. If the member just refreshed it, this PC's clock is wrong.`
        : 'That QR code has expired. Ask the member to refresh it.',
    };
  }
  if (verdict.kind === 'future') {
    return { error: `That code is stamped ${describeGap(verdict.aheadSeconds)} in the future — this PC's clock is behind the member's phone.` };
  }
  const lookup = async (id: string): Promise<MemberWithProfile | null | { error: string }> => {
    try {
      return await getMemberByQrCode(id);
    } catch (err) {
      return { error: `Could not look that member up: ${err instanceof Error ? err.message : 'unknown error'}` };
    }
  };
  if (verdict.kind === 'ok') {
    const m = await lookup(verdict.data.memberId);
    if (m && 'error' in m) return m;
    if (!m) return { error: 'That code is valid but no member matches it.' };
    return { member: m, method: 'qr' };
  }
  // Short code — resolved against the roster already in memory rather than with
  // a prefix query, so an ambiguous code is refused outright instead of silently
  // checking in whichever row the database happened to return.
  const typed = qr.replace(/[\s-]/g, '');
  if (typed.length === 6) {
    const matches = members.filter((m) => matchesCheckInCode(m.profile.id, typed));
    if (matches.length === 1) return { member: matches[0], method: 'manual' };
    if (matches.length > 1) return { error: 'More than one member has that code — use the search instead.' };
    return { error: `No member has the code ${typed.toUpperCase()}.` };
  }
  const m = await lookup(qr);
  if (m && 'error' in m) return m;
  if (!m) {
    return {
      error: typed.length > 6
        ? 'No member matches that. Six-character codes go in as-is; anything longer must be a full member ID.'
        : 'No member matches that code.',
    };
  }
  return { member: m, method: 'manual' };
}

export type CheckInResult =
  | { ok: true; points: number | null }
  | { ok: false; message: string; reason: 'duplicate' | 'membership' | 'session' | 'failed' };

/**
 * Writes the check-in after the checks a plain status test gets wrong, then
 * tells the member. Never throws: the caller shows `message`.
 */
export async function performCheckIn(
  member: MemberWithProfile,
  method: 'qr' | 'manual',
  opts: { alreadyInToday: boolean; adminId: string | null; activity?: string; where?: 'desk' | 'kiosk' },
): Promise<CheckInResult> {
  const first = member.profile.first_name;
  if (opts.alreadyInToday) return { ok: false, reason: 'duplicate', message: `${first} already checked in today` };
  const membership = await getCurrentMembership(member.profile.id).catch(() => null);
  if (!membership) return { ok: false, reason: 'membership', message: `${first} has no membership on file` };
  // membershipIsUsable covers the cases a plain status check gets wrong: a
  // *cancelled* membership still admits the member until expiry (they paid for
  // those days), and a *frozen* one doesn't, however far off its expiry is.
  if (!membershipIsUsable(membership.status, membership.expiry_date, membership.never_expires)) {
    return {
      ok: false,
      reason: 'membership',
      message: membership.status === 'frozen' ? `${first}'s membership is frozen` : `${first}'s membership has expired`,
    };
  }
  if (!opts.adminId) {
    // Falling back to the member's own id would file a false audit record: it
    // would read as the member having checked themselves in, which RLS forbids.
    return { ok: false, reason: 'session', message: 'Your admin session could not be verified. Please refresh and try again.' };
  }
  try {
    await recordCheckIn({ memberId: member.profile.id, method, recordedBy: opts.adminId, activity: opts.activity });
  } catch (err) {
    return { ok: false, reason: 'failed', message: err instanceof Error ? err.message : 'Check-in failed' };
  }
  // The balance, at the one moment the desk can act on it. Points are awarded
  // by a trigger on the insert (0051), so this reads after the write. Never
  // allowed to fail the check-in; a failure drops the number rather than 0.
  const points = await getBalance(member.profile.id).catch(() => null);
  // Tell the member too — fire-and-forget, after the record is written: the
  // attendance row is the record and the message is only the alert. 'system',
  // because a check-in confirmation is not a category a member can mute.
  notifyUser({
    userId: member.profile.id,
    type: 'system',
    title: 'Checked in',
    message: opts.where === 'kiosk'
      ? 'You checked in at the kiosk and your attendance is logged.'
      : opts.activity
        ? `Your QR code was scanned at the front desk and logged as ${opts.activity}.`
        : 'Your QR code was scanned at the front desk and your attendance is logged.',
    actionUrl: '/member/attendance-history',
  }).catch(() => undefined);
  return { ok: true, points };
}
