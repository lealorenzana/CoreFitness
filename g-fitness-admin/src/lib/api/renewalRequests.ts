import { supabase } from '../supabaseClient';

/**
 * Members who said "I'm coming to renew" in the phone app (0091).
 *
 * Intent, never money: the desk records the payment exactly as before, and a
 * completed payment on the member's membership — while it is on the requested
 * plan — closes the request by itself (a trigger). The only desk action here is
 * Decline, with a reason the member reads.
 */
export interface OpenRenewalRequest {
  id: string;
  memberId: string;
  memberName: string;
  photoUrl: string | null;
  planId: string;
  planName: string;
  planPrice: number;
  planDays: number | null;
  note: string | null;
  createdAt: string;
}

interface Row {
  id: string; member_id: string; plan_id: string; note: string | null; created_at: string;
  membership_plans: { name: string; price: number | string; duration_days: number | null } | null;
}

/** Oldest first — the member who asked first is served first. Null before 0091. */
export async function listOpenRenewalRequests(): Promise<OpenRenewalRequest[] | null> {
  const { data, error } = await supabase
    .from('renewal_requests')
    .select('id, member_id, plan_id, note, created_at, membership_plans (name, price, duration_days)')
    .eq('status', 'open')
    .order('created_at', { ascending: true });
  if (error) return null;
  const rows = (data ?? []) as unknown as Row[];
  const ids = [...new Set(rows.map((r) => r.member_id))];
  const people = new Map<string, { name: string; photo: string | null }>();
  if (ids.length) {
    const { data: ps } = await supabase.from('profiles').select('id, first_name, last_name, photo_url').in('id', ids);
    for (const p of (ps ?? []) as { id: string; first_name: string | null; last_name: string | null; photo_url: string | null }[]) {
      people.set(p.id, { name: `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || 'Member', photo: p.photo_url });
    }
  }
  return rows.map((r) => ({
    id: r.id, memberId: r.member_id,
    memberName: people.get(r.member_id)?.name ?? 'Member', photoUrl: people.get(r.member_id)?.photo ?? null,
    planId: r.plan_id, planName: r.membership_plans?.name ?? 'Plan',
    planPrice: Number(r.membership_plans?.price ?? 0), planDays: r.membership_plans?.duration_days ?? null,
    note: r.note, createdAt: r.created_at,
  }));
}

/** This member's open request, for the member drawer. */
export async function getOpenRenewalRequest(memberId: string): Promise<OpenRenewalRequest | null> {
  const all = await listOpenRenewalRequests();
  return all?.find((r) => r.memberId === memberId) ?? null;
}

export async function declineRenewalRequest(id: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('decline_renewal_request', { p_id: id, p_reason: reason });
  if (error) throw error;
}
