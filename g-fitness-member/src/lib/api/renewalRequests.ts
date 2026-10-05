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
  /** Paid online (0167): what was sent, waiting for the desk to confirm. */
  paid: { method: string; reference: string; amount: number } | null;
}

/** One of the gym's own accounts a member can pay into (0167). */
export interface GymPayMethod {
  id: string; kind: 'gcash' | 'maya' | 'bank' | 'other'; label: string;
  account_name: string | null; account_number: string | null; qr_image: string | null; instructions: string | null;
}

interface Row {
  id: string; plan_id: string; note: string | null; status: RenewalRequest['status'];
  created_at: string; closed_at: string | null; close_note: string | null;
  pay_method_label?: string | null; pay_reference?: string | null; pay_amount?: number | string | null;
  membership_plans: { name: string; price: number | string } | null;
}

/** The latest few, newest first. Null before 0091 is live — the screens then offer no request. */
export async function listMyRenewalRequests(memberId: string): Promise<RenewalRequest[] | null> {
  const base = 'id, plan_id, note, status, created_at, closed_at, close_note, membership_plans (name, price)';
  const read = (cols: string) => supabase.from('renewal_requests').select(cols)
    .eq('member_id', memberId).order('created_at', { ascending: false }).limit(5);
  // Before 0167 the pay_* columns do not exist: read without them.
  let { data, error } = await read(base + ', pay_method_label, pay_reference, pay_amount');
  if (error) ({ data, error } = await read(base));
  if (error) return null;
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id, planId: r.plan_id, note: r.note, status: r.status, createdAt: r.created_at,
    closedAt: r.closed_at, closeNote: r.close_note,
    planName: r.membership_plans?.name ?? null,
    planPrice: r.membership_plans ? Number(r.membership_plans.price) : null,
    paid: r.pay_reference ? { method: r.pay_method_label ?? 'Online', reference: r.pay_reference, amount: Number(r.pay_amount ?? 0) } : null,
  }));
}

/** The gym's accounts a member may pay into — empty when the gym takes payments at the desk only. */
export async function listGymPayMethods(): Promise<GymPayMethod[]> {
  const { data, error } = await supabase.from('gym_payment_methods')
    .select('id, kind, label, account_name, account_number, qr_image, instructions')
    .eq('active', true).order('sort_order');
  if (error) return [];
  return (data ?? []) as GymPayMethod[];
}

/** "I paid": a renewal request carrying the payment, for the desk to confirm (0167). */
export async function requestRenewalPaid(planId: string, methodId: string, reference: string, proof: string | null): Promise<void> {
  const { error } = await supabase.rpc('request_renewal_paid', {
    p_plan: planId, p_method: methodId, p_reference: reference, p_proof: proof,
  });
  if (error) throw error;
}

export async function requestRenewal(planId: string, note?: string): Promise<void> {
  const { error } = await supabase.rpc('request_renewal', { p_plan: planId, p_note: note ?? null });
  if (error) throw error;
}

export async function withdrawRenewalRequest(): Promise<void> {
  const { error } = await supabase.rpc('withdraw_renewal_request');
  if (error) throw error;
}
