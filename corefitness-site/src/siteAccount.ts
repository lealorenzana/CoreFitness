import { useEffect, useState } from 'react';
import { supabase } from './supabase';

/**
 * Who is signed in on the website, and what they have (the owner, 2026-11-08):
 *   * an account that runs an approved gym sees "You already run …" and Open your dashboard — never the apply form;
 *   * an applicant whose gym is still pending (and runs none) sees no "Gym sign in" — only My application;
 *   * "Gym sign in" opens the admin with ?from=site, where a browser already signed in as someone else is asked
 *     whether to continue or switch. No email goes in the link: addresses are logged.
 * Null while unknown or signed out.
 */
export const ADMIN_APP = 'https://corefitness-admin.vercel.app';
export const GYM_SIGN_IN = `${ADMIN_APP}/admin/login?from=site`;

export interface SiteAccount {
  email: string | null;
  /** Gyms this account owns, active. */
  runs: { name: string; slug: string }[];
  /** An application of theirs is still being decided. */
  pending: boolean;
}

export function useSiteAccount(): SiteAccount | null {
  const [account, setAccount] = useState<SiteAccount | null>(null);
  useEffect(() => {
    if (!supabase) return;
    const sb = supabase;
    let alive = true;
    const read = async () => {
      const { data } = await sb.auth.getSession();
      const user = data.session?.user;
      if (!user) { if (alive) setAccount(null); return; }
      const [gyms, apps] = await Promise.all([sb.rpc('my_gyms'), sb.rpc('my_applications')]);
      const runs = ((gyms.data ?? []) as { name: string; slug: string; role: string; status: string }[])
        .filter((g) => g.role === 'admin' && g.status === 'active').map((g) => ({ name: g.name, slug: g.slug }));
      const pending = ((apps.data ?? []) as { status: string }[]).some((a) => !['approved', 'rejected', 'withdrawn'].includes(a.status));
      if (alive) setAccount({ email: user.email ?? null, runs, pending });
    };
    void read();
    const { data: sub } = sb.auth.onAuthStateChange(() => { void read(); });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);
  return account;
}

/** "Gym sign in" is for people with a gym to sign in to — hidden for an applicant whose gym is still pending. */
export const showGymSignIn = (a: SiteAccount | null) => !a || a.runs.length > 0 || !a.pending;
