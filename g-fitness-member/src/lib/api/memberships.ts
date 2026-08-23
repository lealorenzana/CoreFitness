import { supabase } from '../supabaseClient';
import type { MembershipRow, MembershipStatus, MembershipPlanRow } from '../../types/db';

export interface MembershipWithPlan extends MembershipRow {
  membership_plans: MembershipPlanRow;
}

/** Most recent membership row for a member (a member may have a history of past memberships). */
export async function getCurrentMembership(memberId: string): Promise<MembershipWithPlan | null> {
  const { data, error } = await supabase
    .from('memberships')
    .select('*, membership_plans(*)')
    .eq('member_id', memberId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as MembershipWithPlan | null;
}

/**
 * Newest first. Callers reduce this to "the member's current membership", and
 * without an explicit order Postgres is free to return renewals in any order —
 * which would let a payment activate an old expired row instead of the live one.
 */
export async function listMemberships(): Promise<MembershipWithPlan[]> {
  const { data, error } = await supabase
    .from('memberships')
    .select('*, membership_plans(*)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as MembershipWithPlan[];
}

/**
 * Currently unused — activation goes through `recordPayment`, which is also the
 * only thing that sets `never_expires` from the plan. If you ever activate a
 * membership through here instead, set that flag too, or a lifetime plan gets
 * an expiry of null meaning "not activated" rather than "never runs out".
 */
export async function updateMembershipStatus(
  id: string,
  status: MembershipStatus,
  expiryDate?: string
): Promise<void> {
  const updates: Partial<MembershipRow> = { status };
  if (expiryDate) updates.expiry_date = expiryDate;
  const { error } = await supabase.from('memberships').update(updates).eq('id', id);
  if (error) throw error;
}

/** Local calendar date as YYYY-MM-DD. Never toISOString() — that shifts to UTC. */
function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Suspends a membership without burning the days already paid for (0017).
 *
 * Front-desk action, not self-serve: a member who could freeze themselves would
 * freeze on the day they were about to expire and hold the membership
 * indefinitely. Freezing on request — injury, travel, working away — is a
 * conversation, and like every other staff power it is recorded and reversible.
 */
export async function freezeMembership(id: string): Promise<void> {
  const { error } = await supabase
    .from('memberships')
    .update({ status: 'frozen', frozen_at: today() })
    .eq('id', id);
  if (error) throw error;
}

/**
 * Resumes a frozen membership, pushing expiry out by the length of the freeze.
 *
 * The credit is computed from `frozen_at` rather than trusted from the caller,
 * so it cannot be inflated. A row somehow frozen without a date gets no credit
 * rather than an arbitrary one.
 */
export async function unfreezeMembership(membership: MembershipRow): Promise<void> {
  const frozenDays =
    membership.frozen_at == null
      ? 0
      : Math.max(
          0,
          Math.round(
            (new Date(`${today()}T00:00:00`).getTime() - new Date(`${membership.frozen_at}T00:00:00`).getTime()) /
              86_400_000
          )
        );

  const updates: Partial<MembershipRow> = { status: 'active', frozen_at: null };
  if (membership.expiry_date) updates.expiry_date = addDays(membership.expiry_date, frozenDays);

  const { error } = await supabase.from('memberships').update(updates).eq('id', membership.id);
  if (error) throw error;
}

/**
 * Stops the membership renewing, but leaves `expiry_date` alone.
 *
 * The member paid cash up front and there is no refund mechanism, so taking
 * away days they've already bought would simply be keeping their money. They
 * keep access until expiry; `membership_is_usable()` in 0017 encodes the same
 * rule server-side.
 */
export async function cancelMembership(id: string): Promise<void> {
  const { error } = await supabase
    .from('memberships')
    .update({ status: 'cancelled', frozen_at: null })
    .eq('id', id);
  if (error) throw error;
}

/**
 * Mirrors membership_is_usable() in 0024 — keep the two in step.
 *
 * Two things are easy to get wrong here:
 *
 *  - `neverExpires` is not the same as a null expiry date. A pending
 *    registration also has no expiry date and must stay unusable; only the flag
 *    grants access without one.
 *  - `cancelled` gets no lifetime exemption. Cancelling honours days already
 *    paid for, and a non-expiring plan has none, so cancelling one ends access
 *    immediately — otherwise Cancel would be a button that does nothing.
 */
export function membershipIsUsable(
  status: MembershipStatus,
  expiryDate: string | null,
  neverExpires: boolean
): boolean {
  const withinTerm = expiryDate != null && expiryDate >= today();
  if (status === 'active') return neverExpires || withinTerm;
  if (status === 'cancelled') return withinTerm;
  return false;
}

/**
 * Has this member already spent their one Freemium trial? (0041)
 *
 * `freemium_trials` holds one row per member, forever, written only by the
 * SECURITY DEFINER trigger on `memberships` — there is no INSERT policy, so a
 * browser cannot forge or clear a claim. The member's own SELECT policy is what
 * lets this read succeed.
 *
 * This is for *explaining* a disabled plan card, never for enforcing anything.
 * The trigger is the boundary: a member who called PostgREST directly to switch
 * onto the trial a second time still gets the exception, whatever this returns.
 *
 * Failure is treated as "not used". The alternative is worse — a dropped packet
 * would tell a member who has never touched the trial that they have already
 * had it, and there is no way for them to argue with that. The trigger refuses
 * a genuine second attempt regardless, so a false negative costs a clear error
 * message at the front desk while a false positive costs a sale.
 */
export async function hasUsedFreemiumTrial(memberId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('freemium_trials')
    .select('member_id')
    .eq('member_id', memberId)
    .maybeSingle();
  if (error) return false;
  return data != null;
}
