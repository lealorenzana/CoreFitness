import {
  getBalance, listLedger, listMyRedemptions, listRewards, listRules, getSavingFor,
  type LedgerEntry, type PointRule, type Redemption, type Reward,
} from '../lib/api/points';

/**
 * The Rewards screen, assembled (reworked 2026-09-19, with 0092).
 *
 * Everything beyond the four 0051 reads is arithmetic on the member's own
 * ledger — never a promise:
 *
 *   pace       points earned over the last 28 days ÷ 4, "about N a week"; null
 *              with nothing earned in that window (no pace, no estimate)
 *   estimate   weeks to a reward = points still needed ÷ pace, rounded up —
 *              worded "about", and only shown when there is a pace
 *   per rule   how many times each rule paid out this calendar month
 */

export interface RewardsView {
  balance: number | null;
  rules: PointRule[];
  rewards: Reward[];
  mine: Redemption[];
  /** Undefined before 0092 (feature hidden); null when nothing is pinned. */
  savingFor: string | null | undefined;
  earnedThisMonth: number;
  /** Points a week over the last 28 days, or null with none earned. */
  perWeek: number | null;
  /** rule key → times it paid this month. */
  ruleCounts: Record<string, number>;
  ledgerFailed: boolean;
}

export async function loadRewards(memberId: string): Promise<RewardsView> {
  const [balance, rules, rewards, mine, ledger, savingFor] = await Promise.all([
    getBalance(memberId),
    listRules(),
    listRewards(),
    listMyRedemptions(memberId),
    listLedger(memberId, 500).catch(() => null as LedgerEntry[] | null),
    getSavingFor(memberId),
  ]);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const windowStart = now.getTime() - 28 * 86_400_000;
  const rows = ledger ?? [];
  const thisMonth = rows.filter((l) => new Date(l.createdAt).getTime() >= monthStart);
  const last28 = rows.filter((l) => new Date(l.createdAt).getTime() >= windowStart)
    .reduce((s, l) => s + l.points, 0);

  const ruleCounts: Record<string, number> = {};
  for (const l of thisMonth) ruleCounts[l.ruleKey] = (ruleCounts[l.ruleKey] ?? 0) + 1;

  return {
    balance, rules, rewards, mine, savingFor,
    earnedThisMonth: thisMonth.reduce((s, l) => s + l.points, 0),
    perWeek: last28 > 0 ? Math.round(last28 / 4) : null,
    ruleCounts,
    ledgerFailed: ledger == null,
  };
}

/** "about 3 weeks" to afford it at the current pace, or null when no pace. */
export function etaLabel(cost: number, balance: number, perWeek: number | null): string | null {
  const need = cost - balance;
  if (need <= 0) return null;
  if (!perWeek) return null;
  const weeks = Math.ceil(need / perWeek);
  return weeks <= 1 ? 'about a week at your pace' : `about ${weeks} weeks at your pace`;
}
