import { supabase } from '../supabaseClient';

/**
 * Members asking to pause or stop, from the phone app (0118).
 *
 * Intent, never the act. Freezing and cancelling remain front-desk actions for
 * the reason they always were — a member who could freeze themselves would
 * freeze on the day they were about to expire — and nothing here changes that.
 * What changed is that the asking is now a row with a reason and a date, rather
 * than a Messenger message the system never saw.
 *
 * **There is no "grant" call, on purpose.** Freezing or cancelling the member
 * the way the desk always has is what closes the request (0118's trigger on
 * `membership_events`), exactly as a recorded payment closes a renewal request.
 * A button that only set the status would let the member read "granted" while
 * still being able to book — a control writing a flag nothing honours.
 *
 * The only desk action here is Decline, with a reason the member reads.
 */

export interface OpenMembershipRequest {
  id: string;
  memberId: string;
  memberName: string;
  kind: 'freeze' | 'cancel';
  reason: string;
  /** Freeze only. What they asked for; the desk sets the real dates. */
  requestedDays: number | null;
  createdAt: string;
  planName: string | null;
  expiryDate: string | null;
  membershipId: string | null;
}

interface Row {
  id: string; member_id: string; member_name: string;
  kind: 'freeze' | 'cancel'; reason: string; requested_days: number | null;
  created_at: string; plan_name: string | null;
  expiry_date: string | null; membership_id: string | null;
}

/**
 * Oldest first — whoever asked first is answered first.
 *
 * Null means "0118 is not pasted", which renders nothing at all. Empty means
 * "nobody has asked", which also renders nothing. They differ only in that the
 * first is not a fact about this gym, and neither is worth a banner.
 */
export async function listOpenMembershipRequests(): Promise<OpenMembershipRequest[] | null> {
  const { data, error } = await supabase.rpc('open_membership_requests');
  if (error || !Array.isArray(data)) return null;
  return (data as Row[]).map((r) => ({
    id: r.id,
    memberId: r.member_id,
    memberName: r.member_name?.trim() || 'Member',
    kind: r.kind,
    reason: r.reason,
    requestedDays: r.requested_days,
    createdAt: r.created_at,
    planName: r.plan_name,
    expiryDate: r.expiry_date,
    membershipId: r.membership_id,
  }));
}

/** Turn one down. The reason is required in SQL too — the member reads it. */
export async function declineMembershipRequest(id: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('decline_membership_request', {
    p_id: id, p_reason: reason,
  });
  if (error) throw new Error(error.message);
}
