import { supabase } from '../supabaseClient';

/**
 * CORE Points (migration 0051).
 *
 * Nothing here can create points. The ledger has no INSERT policy for anyone —
 * rows are written only by SECURITY DEFINER triggers and the sweep — so this
 * module reads a balance and asks for a reward, and that is all it *can* do.
 * The balance shown is the balance the database will enforce at redemption.
 */

export interface PointRule {
  key: string;
  label: string;
  points: number;
}

export interface LedgerEntry {
  id: string;
  ruleKey: string;
  label: string;
  points: number;
  createdAt: string;
}

export interface Reward {
  id: string;
  name: string;
  description: string | null;
  costPoints: number;
  /** NULL = unlimited. 0 = genuinely out of stock, which is not the same thing. */
  stock: number | null;
}

export interface Redemption {
  id: string;
  rewardId: string;
  rewardName: string;
  costPoints: number;
  status: 'pending' | 'approved' | 'rejected' | 'fulfilled';
  requestedAt: string;
  decisionNote: string | null;
}

/**
 * Earned minus everything committed, computed in SQL.
 *
 * Deliberately not summed on the client: a pending request already counts
 * against it, and a phone that computed "earned" alone would show a member
 * points they cannot actually spend.
 */
export async function getBalance(memberId: string): Promise<number> {
  const { data, error } = await supabase.rpc('member_points_balance', { p_member: memberId });
  if (error) throw error;
  return Number(data ?? 0);
}

/** How points are earned. A rewards scheme with secret rules is a slot machine. */
export async function listRules(): Promise<PointRule[]> {
  const { data, error } = await supabase
    .from('point_rules')
    .select('key, label, points')
    .eq('is_active', true)
    .order('sort_order');
  if (error) throw error;
  return (data ?? []) as PointRule[];
}

export async function listLedger(memberId: string, limit = 50): Promise<LedgerEntry[]> {
  const { data, error } = await supabase
    .from('point_ledger')
    .select('id, rule_key, points, created_at, point_rules(label)')
    .eq('member_id', memberId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r) => {
    const joined = r.point_rules as { label: string } | { label: string }[] | null;
    const label = Array.isArray(joined) ? joined[0]?.label : joined?.label;
    return {
      id: r.id as string,
      ruleKey: r.rule_key as string,
      // Falls back to the key rather than to an empty row: the member should
      // still see that something was earned even if the rule was renamed.
      label: label ?? (r.rule_key as string),
      points: r.points as number,
      createdAt: r.created_at as string,
    };
  });
}

export async function listRewards(): Promise<Reward[]> {
  const { data, error } = await supabase
    .from('rewards')
    .select('id, name, description, cost_points, stock')
    .eq('is_active', true)
    .order('cost_points');
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    description: r.description as string | null,
    costPoints: r.cost_points as number,
    stock: r.stock as number | null,
  }));
}

export async function listMyRedemptions(memberId: string): Promise<Redemption[]> {
  const { data, error } = await supabase
    .from('reward_redemptions')
    .select('id, reward_id, cost_points, status, requested_at, decision_note, rewards(name)')
    .eq('member_id', memberId)
    .order('requested_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => {
    const joined = r.rewards as { name: string } | { name: string }[] | null;
    const name = Array.isArray(joined) ? joined[0]?.name : joined?.name;
    return {
      id: r.id as string,
      rewardId: r.reward_id as string,
      rewardName: name ?? 'Reward',
      costPoints: r.cost_points as number,
      status: r.status as Redemption['status'],
      requestedAt: r.requested_at as string,
      decisionNote: r.decision_note as string | null,
    };
  });
}

/**
 * Ask for a reward.
 *
 * `cost_points` is sent but the database overwrites it from the reward row
 * (0051's BEFORE INSERT trigger), so a crafted request cannot buy anything
 * cheaply. It is included because the column is NOT NULL, not because it is
 * trusted.
 */
export async function requestReward(memberId: string, reward: Reward): Promise<void> {
  const { error } = await supabase.from('reward_redemptions').insert({
    member_id: memberId,
    reward_id: reward.id,
    cost_points: reward.costPoints,
  });
  if (error) throw error;
}

/** Withdraw a request the gym has not answered yet. */
export async function cancelRedemption(id: string): Promise<void> {
  const { error } = await supabase.from('reward_redemptions').delete().eq('id', id);
  if (error) throw error;
}
