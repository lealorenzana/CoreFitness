import { supabase } from '../supabaseClient';

/**
 * Paying the gym (or a coach paid directly) online through PayMongo (0192).
 * The money goes to the gym's or coach's OWN PayMongo account; the amount is
 * never sent from here — the database prices it — and nothing counts as paid
 * until PayMongo's signed webhook says so.
 */
export type MemberPurpose = 'membership' | 'coaching';

/** Opens PayMongo's checkout page (this tab leaves the app). */
export async function payOnline(purpose: MemberPurpose, details: Record<string, unknown>, returnPath: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('paymongo-checkout', {
    body: { purpose, details, returnUrl: `${window.location.origin}${returnPath}` },
  });
  if (error) {
    const body = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new Error(body?.error ?? 'Online payment could not be opened. Try again, or pay at the desk.');
  }
  if (!data?.configured) throw new Error(data?.error ?? 'Online payment is not set up at this gym.');
  window.location.assign(data.url as string);
}

/** Can this member pay the gym online, and which coaches take payments online. Null before 0192. */
export async function gymOnlinePay(): Promise<{ gym: boolean; trainers: string[] } | null> {
  const { data, error } = await supabase.rpc('gym_online_pay');
  if (error) return null;
  return data as { gym: boolean; trainers: string[] };
}

export interface MemberCheckout {
  id: string; purpose: MemberPurpose; description: string; amount: number | string;
  status: 'pending' | 'paid' | 'expired' | 'failed'; method: string | null; created_at: string; paid_at: string | null;
}

/**
 * Back from PayMongo (?paid=<id>): waits for the signed confirmation (every
 * 2 s, up to a minute) and reports it, so the screen updates in place. The
 * ?paid= mark is removed once settled. Returns a stop function.
 */
export function waitForPayment(onState: (s: 'waiting' | 'paid' | 'slow', row: MemberCheckout | null) => void): () => void {
  const id = new URLSearchParams(window.location.search).get('paid');
  if (!id) return () => {};
  let stop = false; let tries = 0;
  onState('waiting', null);
  const look = async () => {
    if (stop) return;
    const { data } = await supabase.rpc('my_member_checkouts');
    const row = ((data ?? []) as MemberCheckout[]).find((c) => c.id === id) ?? null;
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

// ---- a coach connects their own account ---------------------------------------------------------------
export interface PaymentAccount { connected: boolean; live: boolean; key_last4: string; connected_at: string }

export async function myPaymentAccount(kind: 'gym' | 'trainer'): Promise<PaymentAccount | null | undefined> {
  const { data, error } = await supabase.rpc('my_payment_account', { p_kind: kind });
  if (error) return undefined;   // before 0192
  return (data as PaymentAccount | null) ?? null;
}

async function connectCall(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.functions.invoke('paymongo-connect', { body });
  if (error) {
    const b = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new Error(b?.error ?? 'Could not reach PayMongo. Try again.');
  }
  return data as Record<string, unknown>;
}
export const connectPayMongo = (kind: 'gym' | 'trainer', secretKey: string, publicKey: string) =>
  connectCall({ kind, secretKey, publicKey });
export const disconnectPayMongo = (kind: 'gym' | 'trainer') => connectCall({ kind, disconnect: true });
