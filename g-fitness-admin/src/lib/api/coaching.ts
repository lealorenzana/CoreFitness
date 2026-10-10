import { supabase } from '../supabaseClient';

/**
 * Coaching terms (0181), the gym's side: the owner's choices, the desk's view
 * of every coaching, assigning a coach, and confirming a payment to the gym.
 * Writes are definer functions only; the database's words are the errors.
 */
export type CoachingMode = 'classes' | 'pick_pt' | 'pick_group' | 'desk_assigns' | 'coach_invites';
export type FeeMode = 'included' | 'gym_priced' | 'trainer_direct';

export interface CoachingSettings { modes: CoachingMode[]; lengths: number[]; feeMode: FeeMode }

export interface CoachingRow {
  id: string; member_id: string; trainer_id: string; kind: 'pt' | 'group'; months: number;
  status: 'invited' | 'requested' | 'awaiting_payment' | 'payment_sent' | 'active' | 'ended' | 'declined' | 'cancelled';
  fee_mode: FeeMode; price: number | null; pay_reference: string | null; starts_on: string | null; ends_on: string | null;
  started_by: 'member' | 'desk' | 'coach'; created_at: string;
}

/** NULL before 0181: the screens offer nothing. */
export async function getCoachingSettings(): Promise<CoachingSettings | null> {
  const { data, error } = await supabase.rpc('coaching_settings');
  if (error) return null;
  const r = (Array.isArray(data) ? data[0] : data) as { modes: CoachingMode[]; lengths: number[]; fee_mode: FeeMode } | undefined;
  return r ? { modes: r.modes ?? [], lengths: r.lengths ?? [1, 3, 6], feeMode: r.fee_mode ?? 'included' } : null;
}

const rpc = async (fn: string, args: Record<string, unknown>) => {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data;
};

export const saveCoachingSettings = (s: CoachingSettings) =>
  rpc('set_coaching_settings', { p_modes: s.modes, p_lengths: s.lengths, p_fee_mode: s.feeMode });
export const setCoachingPrice = (kind: 'pt' | 'group', months: number, price: number | null) =>
  rpc('set_coaching_price', { p_kind: kind, p_months: months, p_price: price });
export const assignCoaching = (memberId: string, trainerId: string, months: number) =>
  rpc('assign_coaching', { p_member: memberId, p_trainer: trainerId, p_months: months, p_price: null }) as Promise<string>;
export const confirmCoachingPayment = (id: string, received: boolean, method: string | null) =>
  rpc('confirm_coaching_payment', { p_id: id, p_received: received, p_method: method });
export const endCoaching = (id: string, reason: string | null) => rpc('end_coaching', { p_id: id, p_reason: reason });
export const coachingSweep = () => supabase.rpc('coaching_sweep').then(() => undefined, () => undefined);

export async function coachingPrices(): Promise<{ kind: 'pt' | 'group'; months: number; price: number }[]> {
  const { data, error } = await supabase.from('coaching_prices').select('kind, months, price');
  if (error) return [];
  return ((data ?? []) as { kind: 'pt' | 'group'; months: number; price: number | string }[]).map((r) => ({ ...r, price: Number(r.price) }));
}

/** Every coaching at the gym, newest first. NULL on a failed read. */
export async function listCoachings(): Promise<CoachingRow[] | null> {
  const { data, error } = await supabase.from('coachings')
    .select('id, member_id, trainer_id, kind, months, status, fee_mode, price, pay_reference, starts_on, ends_on, started_by, created_at')
    .order('created_at', { ascending: false }).limit(300);
  if (error) return null;
  return ((data ?? []) as CoachingRow[]).map((r) => ({ ...r, price: r.price == null ? null : Number(r.price) }));
}

/** One member's open or latest coaching, for the drawer. */
export async function memberCoaching(memberId: string): Promise<CoachingRow | null> {
  const { data, error } = await supabase.from('coachings')
    .select('id, member_id, trainer_id, kind, months, status, fee_mode, price, pay_reference, starts_on, ends_on, started_by, created_at')
    .eq('member_id', memberId).in('status', ['active', 'awaiting_payment', 'payment_sent', 'requested', 'invited'])
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (error || !data) return null;
  return data as CoachingRow;
}

export const MODE_WORDS: Record<CoachingMode, { title: string; blurb: string }> = {
  classes: { title: 'Timetable classes', blurb: 'Members book seats in your classes.' },
  pick_pt: { title: 'Members pick a coach (1-on-1)', blurb: 'From a coach’s profile, for a length you offer.' },
  pick_group: { title: 'Members pick a coach as a group', blurb: 'One starts it, friends join with a code — one group room.' },
  desk_assigns: { title: 'The desk assigns a coach', blurb: 'You or the front desk pick the coach for a member.' },
  coach_invites: { title: 'Coaches invite trainees', blurb: 'A coach offers to coach a member, who accepts.' },
};

export const STATUS_WORDS: Record<CoachingRow['status'], string> = {
  invited: 'Offered by the coach', requested: 'Waiting for the coach', awaiting_payment: 'Waiting for payment',
  payment_sent: 'Payment sent', active: 'Active', ended: 'Ended', declined: 'Declined', cancelled: 'Cancelled',
};
