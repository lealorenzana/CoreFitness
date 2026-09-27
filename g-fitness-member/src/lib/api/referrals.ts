import { supabase } from '../supabaseClient';

/**
 * Refer a friend (0125).
 *
 * Nothing here is paid on sign-up. A friend who arrives through a member's
 * code is recorded as referred; when the desk records their first real payment
 * (above ₱0), the database pays both, once — the referrer at most five times a
 * month. The screen only shows the code and what has happened.
 */

export interface MyReferral { friendName: string; status: 'pending' | 'rewarded' | 'void'; createdAt: string; rewardedAt: string | null; points: number }

const clean = (m: string) => m.replace(/^.*?: /, '');

/** Null before 0125, or for someone who is not a member here. */
export async function myReferralCode(): Promise<string | null> {
  const { data, error } = await supabase.rpc('my_referral_code');
  return error || typeof data !== 'string' ? null : data;
}

export async function myReferrals(): Promise<MyReferral[]> {
  const { data, error } = await supabase.rpc('my_referrals');
  if (error) return [];
  return ((data ?? []) as { friend_name: string; status: MyReferral['status']; created_at: string;
    rewarded_at: string | null; points: number }[]).map((r) => ({
    friendName: r.friend_name, status: r.status, createdAt: r.created_at, rewardedAt: r.rewarded_at, points: r.points,
  }));
}

/** An existing account, after asking to join, names who sent them. */
export async function claimReferral(gymId: string, code: string): Promise<void> {
  const { error } = await supabase.rpc('claim_referral', { p_gym: gymId, p_code: code.trim() });
  if (error) throw new Error(clean(error.message));
}

/** What each side earns, from the gym's own rules — never a number typed here. */
export async function referralRewards(): Promise<{ referrer: number | null; friend: number | null }> {
  const { data, error } = await supabase.from('point_rules').select('key, points, is_active')
    .in('key', ['referral', 'referral_welcome']);
  if (error) return { referrer: null, friend: null };
  const rows = (data ?? []) as { key: string; points: number; is_active: boolean }[];
  const pts = (k: string) => { const r = rows.find((x) => x.key === k); return r && r.is_active ? r.points : null; };
  return { referrer: pts('referral'), friend: pts('referral_welcome') };
}

/** The `?ref=` a join link carries, uppercased; null when absent or malformed. */
export function refFromUrl(): string | null {
  const v = new URLSearchParams(window.location.search).get('ref');
  const code = (v ?? '').toUpperCase().replace(/[^A-Z]/g, '');
  return code.length === 6 ? code : null;
}
