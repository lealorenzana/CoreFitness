import { supabase } from '../supabaseClient';

/**
 * "I'm coming to the desk to renew" (0091). Intent, never money: the desk still
 * takes the cash and records the payment, and that payment closes the request
 * by itself. Every write is an RPC — the table has no write policy.
 */
export interface RenewalRequest {
  id: string;
  planId: string;
  planName: string | null;
  planPrice: number | null;
  note: string | null;
  status: 'open' | 'fulfilled' | 'withdrawn' | 'declined';
  createdAt: string;
  closedAt: string | null;
  closeNote: string | null;
}

interface Row {
  id: string; plan_id: string; note: string | null; status: RenewalRequest['status'];
  created_at: string; closed_at: string | null; close_note: string | null;
  membership_plans: { name: string; price: number | string } | null;
}

/** The latest few, newest first. Null before 0091 is live — the screens then offer no request. */
export async function listMyRenewalRequests(memberId: string): Promise<RenewalRequest[] | null> {
  const { data, error } = await supabase
    .from('renewal_requests')
    .select('id, plan_id, note, status, created_at, closed_at, close_note, membership_plans (name, price)')
    .eq('member_id', memberId)
    .order('created_at', { ascending: false })
    .limit(5);
  if (error) return null;
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id, planId: r.plan_id, note: r.note, status: r.status, createdAt: r.created_at,
    closedAt: r.closed_at, closeNote: r.close_note,
    planName: r.membership_plans?.name ?? null,
    planPrice: r.membership_plans ? Number(r.membership_plans.price) : null,
  }));
}

export async function requestRenewal(planId: string, note?: string): Promise<void> {
  const { error } = await supabase.rpc('request_renewal', { p_plan: planId, p_note: note ?? null });
  if (error) throw error;
}

export async function withdrawRenewalRequest(): Promise<void> {
  const { error } = await supabase.rpc('withdraw_renewal_request');
  if (error) throw error;
}
