import { supabase } from '../supabaseClient';
import type { PaymentRow } from '../../types/db';

export async function listPayments(): Promise<PaymentRow[]> {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function listMemberPayments(memberId: string): Promise<PaymentRow[]> {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('member_id', memberId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** Local calendar date as YYYY-MM-DD. Not toISOString() — that shifts to UTC and
 *  lands on the wrong day for the eight hours either side of midnight in Manila. */
function toDateString(d: Date): string {
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

function addDays(dateString: string, days: number): string {
  const [y, m, d] = dateString.split('-').map(Number);
  return toDateString(new Date(y, m - 1, d + days));
}

/**
 * Records a payment and activates/extends the linked membership. Two sequential
 * writes (no client-side multi-table transaction in supabase-js) — this is the
 * fix for the old localStorage prototype where recording a payment never touched
 * the member's actual membership status.
 */
export async function recordPayment(
  // `invoice_number` is omitted because the database assigns it (0045). It used
  // to be built here as `INV-${String(Date.now()).slice(-6)}`, a space of a
  // million values that cycles every 16m40s — two payments recorded that far
  // apart got the same number, on a column with no unique constraint, so the
  // collision was silent. A trigger now issues `INV-<year>-<seq>` and overwrites
  // anything a caller sends, so passing one here would be a lie either way.
  payment: Omit<PaymentRow, 'id' | 'created_at' | 'paid_on' | 'invoice_number'> & {
    membership_id: string;
    /** NULL on a non-expiring plan (0024) — the membership gets no end date. */
    duration_days: number | null;
    paid_on?: string;
  }
): Promise<PaymentRow> {
  const { duration_days, paid_on, ...paymentFields } = payment;

  // Cash-only gym: always stamp who took the money. Without this there's no audit
  // trail for a disputed payment.
  let recordedBy = paymentFields.recorded_by;
  if (!recordedBy) {
    const { data: { user } } = await supabase.auth.getUser();
    recordedBy = user?.id ?? null;
  }

  const today = toDateString(new Date());

  // Read the membership before writing, to decide where the new term starts.
  const { data: current, error: currentError } = await supabase
    .from('memberships')
    .select('status, expiry_date, start_date')
    .eq('id', payment.membership_id)
    .single();
  if (currentError) throw currentError;

  // Renewing early carries the unused days over. Resetting to today would quietly
  // confiscate them, which teaches members to renew on the last possible day —
  // exactly when a lapse happens. If the membership already ran out, start today.
  //
  // A non-expiring plan has no term to extend: it gets no end date at all, and
  // `never_expires` is what says so. Writing a far-future date instead is how
  // the free tier ended up counting down from 3650 days.
  const lifetime = duration_days == null;
  const stillRunning =
    current.status === 'active' && current.expiry_date != null && current.expiry_date > today;
  const newExpiry = lifetime ? null : addDays(stillRunning ? current.expiry_date : today, duration_days);

  const { data: inserted, error: insertError } = await supabase
    .from('payments')
    .insert({ ...paymentFields, recorded_by: recordedBy, paid_on: paid_on ?? today })
    .select()
    .single();
  if (insertError) throw insertError;

  const { error: membershipError } = await supabase
    .from('memberships')
    .update({
      status: 'active',
      expiry_date: newExpiry,
      never_expires: lifetime,
      // First activation only — a renewal must not rewrite when the member joined.
      start_date: current.start_date ?? today,
    })
    .eq('id', payment.membership_id);
  if (membershipError) throw membershipError;

  return inserted;
}

export async function updatePaymentStatus(
  id: string,
  status: PaymentRow['status']
): Promise<void> {
  const { error } = await supabase.from('payments').update({ status }).eq('id', id);
  if (error) throw error;
}
