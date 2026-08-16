// The short check-in code.
//
// The QR is the fast path. This is the fallback for a flat battery, a cracked
// screen, a camera that won't focus, or a code that rotated while the member was
// queueing — and it has to be sayable out loud across a front desk.
//
// `member_profiles.qr_code` holds the member's full UUID, so the manual field in
// the admin app used to require typing 36 characters including dashes. Nobody
// was ever going to do that.
//
// The code is the first six hex digits of that UUID, uppercased. It is derived,
// not stored: every existing member has one immediately, with no migration and
// no backfill, and it can never drift out of sync with the id it points at.
//
// Six hex digits is 16.7 million codes. Collisions are therefore vanishingly
// unlikely for one gym — but "unlikely" is not "impossible", so the desk
// resolves a code against the member list and refuses to guess when two match.
// It is a lookup key, not a secret: it identifies a member, it does not
// authorise anything. The rotating QR is what carries the timestamp.

/** Raw comparable form: 6 lowercase hex chars. */
export function checkInCodeOf(memberId: string): string {
  return memberId.replace(/-/g, '').slice(0, 6).toLowerCase();
}

/** Display form, grouped for reading aloud: "A3F 92B". */
export function formatCheckInCode(memberId: string): string {
  const code = checkInCodeOf(memberId).toUpperCase();
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}

/** True when a typed string is this member's code. Tolerates spaces and case. */
export function matchesCheckInCode(memberId: string, typed: string): boolean {
  const normalised = typed.replace(/[\s-]/g, '').toLowerCase();
  return normalised.length === 6 && checkInCodeOf(memberId) === normalised;
}
