import { supabase } from '../supabaseClient';

const ids = (data: unknown): Set<string> => new Set(Array.isArray(data)
  ? (data as unknown[]).map((r) => (typeof r === 'string' ? r : Object.values(r as Record<string, string>)[0]))
  : []);

/**
 * Members moving between gyms (0227) — never which other gym: that is the
 * member's business. Empty before 0227, or when a read fails.
 *   switchingIn  — asked to switch to this gym; their request is waiting here.
 *   switchedOut  — left this gym for another; their records stay here.
 */
export async function gymSwitchMarks(): Promise<{ switchingIn: Set<string>; switchedOut: Set<string> }> {
  const [a, b] = await Promise.all([supabase.rpc('gym_switching_in'), supabase.rpc('gym_switched_out')]);
  return { switchingIn: a.error ? new Set() : ids(a.data), switchedOut: b.error ? new Set() : ids(b.data) };
}

export interface GymSwitch {
  id: string; member: string; name: string; photoUrl: string | null;
  direction: 'in' | 'out';
  status: 'pending' | 'completed' | 'declined' | 'withdrawn';
  askedAt: string; decidedAt: string | null;
  /** 'out': their cancellation (refund) request from their last term here is still open. */
  refundWaiting: boolean;
}

/**
 * Members → Switching (0237): who asked to switch in, and who switched out in the
 * last 90 days. The other gym is never named — that is the member's business.
 * Null when unavailable (before 0237, or the read failed).
 */
export async function gymSwitchList(): Promise<GymSwitch[] | null> {
  const { data, error } = await supabase.rpc('gym_switch_list');
  if (error) return null;
  return ((data ?? []) as {
    id: string; member: string; name: string; photo_url: string | null; direction: 'in' | 'out';
    status: GymSwitch['status']; asked_at: string; decided_at: string | null; refund_waiting: boolean;
  }[]).map((r) => ({
    id: r.id, member: r.member, name: r.name, photoUrl: r.photo_url, direction: r.direction, status: r.status,
    askedAt: r.asked_at, decidedAt: r.decided_at, refundWaiting: r.refund_waiting,
  }));
}
