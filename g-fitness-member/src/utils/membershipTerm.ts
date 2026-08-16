/**
 * How much membership is left, expressed in the largest unit that still reads
 * as something a person can act on.
 *
 * The membership card used to render `daysLeft` raw. On the gym's Free Access
 * plan — 3650 days in `membership_plans`, which was the database's way of
 * saying "this tier doesn't really expire" — that put **3647 days remaining**
 * in the largest type on the first screen a member sees. True, and useless: a
 * countdown only carries meaning when the end is near enough to do something
 * about.
 *
 * Migration 0024 let the schema say it properly, so the free tier now has no
 * expiry date at all rather than a date a decade out. `kind` is what the card
 * switches on: an unlimited membership has no date and no number, so it gets a
 * sentence instead of a countdown with two blanks in it.
 */
export type MembershipTermKind =
  /** No expiry date, by design — `memberships.never_expires`. */
  | 'unlimited'
  /** A real term with days left on it. */
  | 'countdown'
  /** Ran out, or the status says so. */
  | 'expired'
  /** No membership row, or one that was never activated. */
  | 'none';

export interface MembershipTerm {
  kind: MembershipTermKind;
  /** The large figure — a number, or a short word. */
  value: string;
  /** Unit beside it, already pluralised. Empty when `value` says it all. */
  unit: string;
  /** The small line underneath. */
  caption: string;
}

export function membershipTerm(daysLeft: number | null, neverExpires = false): MembershipTerm {
  if (neverExpires) {
    return { kind: 'unlimited', value: '', unit: '', caption: 'This membership does not expire' };
  }
  if (daysLeft == null) {
    return { kind: 'none', value: '—', unit: '', caption: 'no membership on record' };
  }
  if (daysLeft < 0) {
    return { kind: 'expired', value: 'Expired', unit: '', caption: 'renew at the front desk' };
  }
  if (daysLeft === 0) {
    return { kind: 'countdown', value: 'Today', unit: '', caption: 'last day of your plan' };
  }

  // Under two months, days are what the member is counting.
  if (daysLeft <= 60) {
    return {
      kind: 'countdown',
      value: String(daysLeft),
      unit: daysLeft === 1 ? 'day' : 'days',
      caption: 'remaining',
    };
  }

  // Up to about two years, months. 30.44 is the mean month length — using 30
  // makes a 365-day plan read as "12 months" and then tick to 12 again a week
  // later, which looks broken.
  if (daysLeft <= 730) {
    const months = Math.round(daysLeft / 30.44);
    return {
      kind: 'countdown',
      value: String(months),
      unit: months === 1 ? 'month' : 'months',
      caption: 'remaining',
    };
  }

  const years = Math.round(daysLeft / 365.25);
  return {
    kind: 'countdown',
    value: String(years),
    unit: years === 1 ? 'year' : 'years',
    caption: 'remaining',
  };
}
