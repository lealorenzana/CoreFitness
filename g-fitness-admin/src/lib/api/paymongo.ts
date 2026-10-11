import { supabase } from '../supabaseClient';

/**
 * Paying Core Fitness online through PayMongo (0191). The amount is never sent
 * from here — the `paymongo-checkout` Edge Function asks the database for it —
 * and nothing is marked paid until PayMongo's signed webhook says so.
 */
export type PlatformPurpose = 'gym_subscription' | 'ai_topup' | 'custom_colours';

/** Opens PayMongo's checkout page (this tab leaves the app). Throws a sentence the owner can act on. */
export async function payOnline(purpose: PlatformPurpose, details: Record<string, unknown>, returnPath: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('paymongo-checkout', {
    body: { purpose, details, returnUrl: `${window.location.origin}${returnPath}` },
  });
  if (error) {
    const body = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new Error(body?.error ?? 'Online payment could not be opened. Try again, or send the reference instead.');
  }
  if (!data?.configured) throw new Error(data?.error ?? 'Online payment is not set up yet. Send the reference and a screenshot instead.');
  window.location.assign(data.url as string);
}

let ready: Promise<boolean> | null = null;
/** Whether Core Fitness has PayMongo switched on (its key is set). Asked once per page load. */
export function paymongoReady(): Promise<boolean> {
  ready ??= supabase.functions.invoke('paymongo-checkout', { body: { probe: true } })
    .then(({ data }) => !!data?.configured).catch(() => false);
  return ready;
}

export interface CheckoutRow {
  id: string; purpose: PlatformPurpose; description: string; amount: number | string;
  status: 'pending' | 'paid' | 'expired' | 'failed'; method: string | null; created_at: string; paid_at: string | null;
}
export async function myCheckouts(): Promise<CheckoutRow[]> {
  const { data, error } = await supabase.rpc('my_paymongo_checkouts');
  if (error) return [];
  return (data ?? []) as CheckoutRow[];
}

/** Custom colours (0191): unlocked or not, and the price. null before 0191 (then nothing is locked). */
export async function themeState(): Promise<{ custom_colours: boolean; price: number | string | null } | null> {
  const { data, error } = await supabase.rpc('my_theme_state');
  if (error) return null;
  return data as { custom_colours: boolean; price: number | string | null };
}
