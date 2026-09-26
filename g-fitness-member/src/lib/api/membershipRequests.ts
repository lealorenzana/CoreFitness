import { supabase } from '../supabaseClient';

/**
 * "I need to pause" / "I need to stop" (0118). Intent, never the act.
 *
 * Freezing and cancelling stay front-desk actions, for the reason 0057 gave and
 * this does not change: a member who could freeze themselves would freeze on
 * the day they were about to expire and hold the membership indefinitely. What
 * is self-serve here is the **asking** — which until now happened on Messenger
 * and landed in the system as nothing.
 *
 * The desk still decides, and **granting is never a button**: recording the
 * real freeze or cancel closes the request by itself (0118's trigger), the same
 * way recording a payment closes a renewal request. A "mark granted" control
 * would let a member read "granted" while still being able to book.
 *
 * Every write is an RPC — the table has no write policy for anyone.
 */

export type RequestKind = 'freeze' | 'cancel';
export type RequestStatus = 'open' | 'granted' | 'declined' | 'withdrawn';

export interface MembershipRequest {
  id: string;
  kind: RequestKind;
  reason: string;
  /** Freeze only. What they asked for, not what the desk will set. */
  requestedDays: number | null;
  status: RequestStatus;
  createdAt: string;
  closedAt: string | null;
  /** The desk's reason for turning it down. The whole point of keeping it. */
  closeNote: string | null;
}

interface Row {
  id: string; kind: RequestKind; reason: string; requested_days: number | null;
  status: RequestStatus; created_at: string; closed_at: string | null; close_note: string | null;
}

/**
 * The member's latest request, whatever became of it.
 *
 * Null means "no 0118, or nothing asked yet", and both render the same: the
 * screen simply offers to ask. A failed read must never look like a pending
 * request that does not exist.
 */
export async function myMembershipRequest(): Promise<MembershipRequest | null> {
  const { data, error } = await supabase.rpc('my_membership_request');
  if (error || !Array.isArray(data) || !data[0]) return null;
  const r = data[0] as Row;
  return {
    id: r.id, kind: r.kind, reason: r.reason, requestedDays: r.requested_days,
    status: r.status, createdAt: r.created_at, closedAt: r.closed_at, closeNote: r.close_note,
  };
}

/** `days` is required for a freeze and refused for a cancel — 0118 checks both. */
export async function requestMembershipChange(
  kind: RequestKind, reason: string, days?: number
): Promise<void> {
  const { error } = await supabase.rpc('request_membership_change', {
    p_kind: kind, p_reason: reason, p_days: kind === 'freeze' ? days ?? null : null,
  });
  if (error) throw new Error(error.message);
}

export async function withdrawMembershipRequest(): Promise<void> {
  const { error } = await supabase.rpc('withdraw_membership_request');
  if (error) throw new Error(error.message);
}

/**
 * What this member would be refunded if they cancelled today (0070/0073).
 *
 * `refund_quote()` has been callable by members since 0070 and **no
 * member-facing screen has ever called it**. A refund rule somebody only
 * learns after they have cancelled is a rule they cannot act on: RA 7394
 * expects pro-rata, the gym's tiers are a floor under it, and the member it
 * protects could not see any of that.
 *
 * Shown before the ask, so the number they are agreeing to is the number the
 * database will produce. Null when there is nothing to quote — no membership,
 * or a database without 0070 — and the screen then says nothing rather than
 * implying zero.
 */
export interface RefundQuote {
  percent: number;
  amount: number;
  ruleLabel: string;
  daysUnused: number;
  basis: string;
  feeDeducted: number;
}

export async function refundQuote(membershipId: string): Promise<RefundQuote | null> {
  const { data, error } = await supabase.rpc('refund_quote', { p_membership: membershipId });
  if (error || !Array.isArray(data) || !data[0]) return null;
  const q = data[0] as Record<string, unknown>;
  return {
    percent: Number(q.percent ?? 0),
    amount: Number(q.amount ?? 0),
    ruleLabel: String(q.rule_label ?? ''),
    daysUnused: Number(q.days_unused ?? 0),
    basis: String(q.basis ?? ''),
    feeDeducted: Number(q.fee_deducted ?? 0),
  };
}
