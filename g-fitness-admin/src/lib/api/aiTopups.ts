import { supabase } from '../supabaseClient';

/** The AI coach's month allowance and prepaid top-ups (0189). */
export interface AiAllowance {
  monthly: number; plan_monthly: number | null; used: number | string; credits: number;
  topup_messages: number; topup_price: number | string;
  topups: { id: string; messages: number; amount: number | string; reference: string; status: 'pending' | 'paid' | 'rejected'; reason: string | null; created_at: string }[];
}

/** null before 0189 or for anyone but the owner. */
export async function aiAllowance(): Promise<AiAllowance | null> {
  const { data, error } = await supabase.rpc('my_ai_allowance');
  if (error) return null;
  return (data as AiAllowance | null) ?? null;
}

export async function buyTopUp(packs: number, reference: string, proof: string | null): Promise<string> {
  const { data, error } = await supabase.rpc('request_ai_topup', { p_packs: packs, p_reference: reference, p_proof: proof });
  if (error) throw new Error(error.message);
  return data as string;
}
