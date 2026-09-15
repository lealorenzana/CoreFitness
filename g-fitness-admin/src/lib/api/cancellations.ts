import { supabase } from '../supabaseClient';

/**
 * Cancelling a booking, with a reason (0081). The desk's copy.
 *
 * Deliberately the same shape as the member app's module — `diff before you
 * copy` — and the one real difference is the actor passed to
 * `listCancellationReasons`, which decides which reasons are offered.
 *
 * Every rule is in `cancel_booking()`: ownership, already-cancelled,
 * already-started, a reason that exists and that this caller may give, and a
 * note when the reason demands one. Since 0081 the database also refuses a bare
 * `status='cancelled'` update, so this is the only way in — for the desk as much
 * as for anyone else.
 */

export interface CancellationReason {
  key: string;
  label: string;
  applies_to: string;
  needs_note: boolean;
  sort_order: number;
}

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
