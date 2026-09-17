import { getMemberHome, type MemberHome } from './memberHomeService';
import {
  getBalance, listLedger, listMyRedemptions, listRewards,
  type LedgerEntry, type Redemption, type Reward,
} from '../lib/api/points';
import { listMemberPayments } from '../lib/api/payments';
import { listMyMembershipEvents, type MyMembershipEvent } from '../lib/api/memberships';

/**
 * Everything the Membership tab states, assembled in one place.
 *
 * The tab was four navigation tiles on an otherwise empty screen: it named its
 * four destinations and said nothing whatsoever about the member's membership,
 * which is the one thing they opened that tab to find out. Three reads answer
 * it, and they belong in a service rather than in the component — the house
 * rule for anything that touches more than one table.
 *
 * **Each half fails on its own.** A points RPC that errors must not take the
 * expiry date down with it, and vice versa: a screen that renders nothing
 * because one of three reads failed is worse than one that renders two thirds
 * and says which third is missing. So `points` and `lastPayment` are
 * `number | null` / `PaymentSummary | null` with a matching `…Failed` flag —
 * **null because it could not be read is a different statement from zero**, and
 * a member who sees "0 points" when the truth is "we could not check" has been
 * told something false.
 *
 * `home` is the exception and is allowed to throw: the plan, the term and the
 * frozen flag are what the screen is *for*, and there is no honest version of
 * this tab without them.
 */
export interface PaymentSummary {
  amount: number;
  /** The business date the cash was received (0008) — never `created_at`. */
  paidOn: string;
  method: string;
}

export interface MembershipHub {
  home: MemberHome;
  /** The last few confirmed payments, newest first. Empty is normal. */
  recentPayments: PaymentSummary[];
  /** Freezes, unfreezes and cancellations. Empty for most memberships. */
  events: MyMembershipEvent[];
  /** Null when the balance could not be read. Zero is a real, different answer. */
  points: number | null;
  pointsFailed: boolean;
  /** Null when there are no payments at all, which is normal on a free tier. */
  lastPayment: PaymentSummary | null;
  paymentsFailed: boolean;
  /** Active rewards, cheapest first. Null when they could not be read. */
  rewards: Reward[] | null;
  /**
   * One statement of what has moved on this account, newest first: points
   * earned, points spent, money paid, and the membership's own events. Built
   * only from rows that exist; a source that failed is left out and named in
   * `activityGaps` rather than silently thinning the list.
   */
  activity: ActivityRow[];
  activityGaps: string[];
}

export type ActivityRow =
  | { kind: 'earned'; at: string; title: string; points: number }
  | { kind: 'spent'; at: string; title: string; points: number; status: Redemption['status'] }
  | { kind: 'paid'; at: string; title: string; amount: number; method: string }
  | { kind: 'membership'; at: string; title: string; note: string | null };

export async function getMembershipHub(memberId: string): Promise<MembershipHub> {
  const [home, points, payments, events, rewards, ledger, redemptions] = await Promise.all([
    getMemberHome(memberId),
    getBalance(memberId).then(
      (n) => ({ ok: true as const, n }),
      () => ({ ok: false as const, n: 0 })
    ),
    listMemberPayments(memberId).then(
      (rows) => ({ ok: true as const, rows }),
      () => ({ ok: false as const, rows: [] })
    ),
    // Most memberships have none of these, and a failure here is not worth
    // taking the screen down for — the section simply does not render.
    listMyMembershipEvents(memberId).catch(() => [] as MyMembershipEvent[]),
    listRewards().catch(() => null),
    listLedger(memberId, 20).catch(() => null as LedgerEntry[] | null),
    listMyRedemptions(memberId).catch(() => null as Redemption[] | null),
  ]);

  // Most recent by the date the money changed hands, not by when the row was
  // typed — the desk records a Monday payment on Tuesday often enough that
  // sorting on `created_at` puts the wrong figure under "last payment".
  const paid = payments.rows
    .filter((p) => p.status === 'completed' && p.paid_on != null)
    .sort((a, b) => b.paid_on.localeCompare(a.paid_on));

  const latest = paid[0];
  const summarise = (p: (typeof paid)[number]): PaymentSummary =>
    ({ amount: Number(p.amount), paidOn: p.paid_on, method: p.method });

  const activity: ActivityRow[] = [
    ...(ledger ?? []).map((l): ActivityRow => ({ kind: 'earned', at: l.createdAt, title: l.label, points: l.points })),
    // A rejected request never took the points, so it is not an entry in a
    // statement of what moved.
    ...(redemptions ?? []).filter((r) => r.status !== 'rejected')
      .map((r): ActivityRow => ({ kind: 'spent', at: r.requestedAt, title: r.rewardName, points: r.costPoints, status: r.status })),
    // `paid_on` is a calendar date; noon keeps it on its own day when sorted
    // against timestamps in UTC+8.
    ...paid.slice(0, 10).map((p): ActivityRow => ({
      kind: 'paid', at: `${p.paid_on}T12:00:00`, title: 'Payment', amount: Number(p.amount), method: p.method,
    })),
    ...events.map((e): ActivityRow => ({
      kind: 'membership', at: e.created_at,
      title: e.kind === 'freeze' ? 'Membership frozen' : e.kind === 'unfreeze' ? 'Membership restarted' : 'Membership cancelled',
      note: e.reason,
    })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  const activityGaps = [
    ledger == null ? 'points earned' : null,
    redemptions == null ? 'rewards' : null,
    !payments.ok ? 'payments' : null,
  ].filter((x): x is string => x != null);

  return {
    home,
    rewards,
    activity,
    activityGaps,
    // Three: enough to show a rhythm, few enough that the full history stays
    // worth opening.
    recentPayments: paid.slice(0, 3).map(summarise),
    events,
    points: points.ok ? points.n : null,
    pointsFailed: !points.ok,
    lastPayment: latest
      ? { amount: Number(latest.amount), paidOn: latest.paid_on, method: latest.method }
      : null,
    paymentsFailed: !payments.ok,
  };
}
