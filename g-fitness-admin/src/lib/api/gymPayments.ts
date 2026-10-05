import { supabase } from '../supabaseClient';

/**
 * The gym's own GCash / Maya / bank details that members pay into (0167).
 *
 * Read straight from `gym_payment_methods` — the owner sees every row, everyone
 * else at the gym only the active ones while Online payments is on — and
 * written only through the owner-only functions, because a member who could
 * edit the account number could send the gym's money anywhere.
 */
export type PayKind = 'gcash' | 'maya' | 'bank' | 'other';

export interface GymPaymentMethod {
  id: string;
  kind: PayKind;
  label: string;
  account_name: string | null;
  account_number: string | null;
  qr_image: string | null;
  instructions: string | null;
  sort_order: number;
  active: boolean;
}

export const KIND_LABEL: Record<PayKind, string> = { gcash: 'GCash', maya: 'Maya', bank: 'Bank transfer', other: 'Other' };

/** null when 0167 is not in the database yet (the tab says so instead of an empty list). */
export async function listGymPaymentMethods(): Promise<GymPaymentMethod[] | null> {
  const { data, error } = await supabase.from('gym_payment_methods')
    .select('id, kind, label, account_name, account_number, qr_image, instructions, sort_order, active')
    .order('sort_order').order('created_at');
  if (error) return null;
  return (data ?? []) as GymPaymentMethod[];
}

export async function saveGymPaymentMethod(m: Omit<GymPaymentMethod, 'id'> & { id?: string | null }): Promise<string> {
  const { data, error } = await supabase.rpc('save_gym_payment_method', {
    p_id: m.id ?? null, p_kind: m.kind, p_label: m.label, p_account_name: m.account_name,
    p_account_number: m.account_number, p_qr_image: m.qr_image, p_instructions: m.instructions,
    p_active: m.active, p_sort: m.sort_order,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function deleteGymPaymentMethod(id: string): Promise<void> {
  const { error } = await supabase.rpc('delete_gym_payment_method', { p_id: id });
  if (error) throw new Error(error.message);
}
