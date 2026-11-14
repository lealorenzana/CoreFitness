import { supabase } from '../supabaseClient';

/**
 * Refer a friend (0125).
 *
 * Nothing here is paid on sign-up. A friend who arrives through a member's
 * code is recorded as referred; when the desk records their first real payment
 * (above ₱0), the database pays both, once — the referrer at most five times a
 * month. The screen only shows the code and what has happened.
 */

export interface MyReferral {
  friendName: string; status: 'pending' | 'rewarded' | 'void'; createdAt: string; rewardedAt: string | null; points: number;
  /** 0253: the gym's desk reward when it runs no points, and when the desk handed it over. */
  deskReward: string | null; deskGivenAt: string | null;
}

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
    rewarded_at: string | null; points: number; desk_reward?: string | null; desk_given_at?: string | null }[]).map((r) => ({
    friendName: r.friend_name, status: r.status, createdAt: r.created_at, rewardedAt: r.rewarded_at, points: r.points,
    deskReward: r.desk_reward ?? null, deskGivenAt: r.desk_given_at ?? null,
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

export interface ReferralTerms { pointsOn: boolean; referrer: number | null; friend: number | null; deskReferrer: string | null; deskFriend: string | null }

/** What inviting earns here (0253): points when the gym runs them, its desk reward when it does not.
 *  Before 0253 is pasted: the point rules, as before. */
export async function referralTerms(): Promise<ReferralTerms> {
  const { data, error } = await supabase.rpc('my_referral_terms');
  if (error || !data) {
    const p = await referralRewards();
    return { pointsOn: true, referrer: p.referrer, friend: p.friend, deskReferrer: null, deskFriend: null };
  }
  const d = data as { points_on: boolean; referrer_points: number | null; friend_points: number | null; desk_referrer: string | null; desk_friend: string | null };
  return { pointsOn: d.points_on, referrer: d.points_on ? d.referrer_points : null, friend: d.points_on ? d.friend_points : null,
    deskReferrer: d.points_on ? null : d.desk_referrer, deskFriend: d.points_on ? null : d.desk_friend };
}

/** One invitation's line, the same on both screens. */
export function referralLine(r: MyReferral, pointsOn: boolean): string {
  if (r.status !== 'rewarded') return 'Joined — waiting for their first payment';
  if (r.points > 0) return `Paid — ${r.points} points for you`;
  if (r.deskReward) return r.deskGivenAt ? `Paid — your ${r.deskReward} was handed over` : `Paid — your reward: ${r.deskReward}. Ask at the front desk`;
  return pointsOn ? 'Paid — past this month’s five' : 'Paid — thank you for bringing them!';
}

/** The `?ref=` a join link carries, uppercased; null when absent or malformed. */
export function refFromUrl(): string | null {
  const v = new URLSearchParams(window.location.search).get('ref');
  const code = (v ?? '').toUpperCase().replace(/[^A-Z]/g, '');
  return code.length === 6 ? code : null;
}
