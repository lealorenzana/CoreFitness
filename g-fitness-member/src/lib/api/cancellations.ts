import { supabase } from '../supabaseClient';

/**
 * Cancelling a booking, with a reason (0081).
 *
 * Every rule lives in `cancel_booking()`: who may cancel what, that the session
 * has not already started, that the booking is not already cancelled, that the
 * reason exists and is one this caller may give, and that "Other" carries a
 * note. This module only calls it.
 *
 * That split matters here more than usual. The obvious implementation is a
 * PATCH setting `status = 'cancelled'` plus the reason columns, and it would
 * work — for an honest client. It would also let anyone with the anon key file
 * a cancellation with no reason, or against a session that already happened, or
 * stamp themselves as the trainer. The function refuses all three, so the
 * dialog below is a convenience and never the boundary.
 */

export interface CancellationReason {
  key: string;
  label: string;
  /** 'any' | 'member' | 'trainer' | 'staff' — who may choose it. */
  applies_to: string;
  /** True for "Other": the free-text note becomes required. */
  needs_note: boolean;
  sort_order: number;
}

/**
 * The reasons this actor may choose, in the gym's own order.
 *
 * Filtered by `applies_to` here as well as in SQL — not as the rule, but so the
 * member is never shown "Trainer unavailable" only to be told they cannot use
 * it. Offering a choice that will be refused is its own small lie.
 *
 * `sort_order` puts "Other" last (999 in the seed), which is where a list of
 * reasons expects to find it.
 */
export async function listCancellationReasons(
  actor: 'member' | 'trainer' | 'staff'
): Promise<CancellationReason[]> {
  const { data, error } = await supabase
    .from('cancellation_reasons')
    .select('key, label, applies_to, needs_note, sort_order')
    .eq('is_active', true)
    .order('sort_order');
  if (error) throw error;
  return ((data ?? []) as CancellationReason[]).filter(
    (r) => r.applies_to === 'any' || r.applies_to === actor
  );
}

/**
 * Cancel a class booking or a PT session.
 *
 * `kind` picks the table. The note is sent trimmed-or-null: an empty string
 * would satisfy a `needs_note` check that only tested for presence, and the
 * function checks `btrim(...) = ''` for exactly that reason.
 */
export async function cancelBooking(
  kind: 'class' | 'pt',
  id: string,
  reason: string,
  note?: string | null
): Promise<void> {
  const { error } = await supabase.rpc('cancel_booking', {
    p_kind: kind,
    p_id: id,
    p_reason: reason,
    p_note: note?.trim() ? note.trim() : null,
  });
  if (error) throw error;
}
