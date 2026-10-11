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

/**
 * Back from PayMongo (?paid=<checkout id>): PayMongo's signed confirmation
 * usually lands a few seconds after the person does. This waits for it —
 * every 2 seconds for up to a minute — and calls `onPaid` the moment the row
 * is paid, so the screen updates itself without a reload. Returns a stop
 * function. The ?paid= mark is removed once settled, so a refresh is clean.
 */
export function waitForPayment(onState: (s: 'waiting' | 'paid' | 'slow', row: CheckoutRow | null) => void): () => void {
  const id = new URLSearchParams(window.location.search).get('paid');
  if (!id) return () => {};
  let stop = false; let tries = 0;
  onState('waiting', null);
  const look = async () => {
    if (stop) return;
    const row = (await myCheckouts()).find((c) => c.id === id) ?? null;
    if (stop) return;
    if (row?.status === 'paid') {
      const url = new URL(window.location.href);
      url.searchParams.delete('paid');
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
      onState('paid', row);
      return;
    }
    if (++tries >= 30) { onState('slow', row); return; }
    window.setTimeout(() => void look(), 2000);
  };
  void look();
  return () => { stop = true; };
}

// ---- the gym's own PayMongo account (0192) ------------------------------------------------------------
export interface GymAccount { connected: boolean; live: boolean; key_last4: string; connected_at: string }
export interface GymOnlinePayment {
  id: string; member_name: string | null; purpose: string; description: string; amount: number | string;
  status: string; method: string | null; paid_at: string | null;
}
/** null = not connected; undefined = before 0192. */
export async function gymPaymentAccount(): Promise<GymAccount | null | undefined> {
  const { data, error } = await supabase.rpc('my_payment_account', { p_kind: 'gym' });
  if (error) return undefined;
  return (data as GymAccount | null) ?? null;
}
export async function gymOnlinePayments(): Promise<GymOnlinePayment[]> {
  const { data, error } = await supabase.rpc('gym_online_payments');
  if (error) return [];
  return (data ?? []) as GymOnlinePayment[];
}
async function connectCall(body: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.functions.invoke('paymongo-connect', { body });
  if (error) {
    const b = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new Error(b?.error ?? 'Could not reach PayMongo. Try again.');
  }
}
export const connectGymPayMongo = (secretKey: string, publicKey: string) => connectCall({ kind: 'gym', secretKey, publicKey });
export const disconnectGymPayMongo = () => connectCall({ kind: 'gym', disconnect: true });
