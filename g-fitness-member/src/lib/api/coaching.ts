import { supabase } from '../supabaseClient';

/**
 * A coaching term (0181): a member and a coach, for a length the member chose.
 * Every write goes through a definer function — the tables have no write
 * policy — so these are thin calls, and the database's words come back as the
 * error a screen shows.
 */
export type CoachingMode = 'classes' | 'pick_pt' | 'pick_group' | 'desk_assigns' | 'coach_invites';
export type FeeMode = 'included' | 'gym_priced' | 'trainer_direct';
export type CoachingStatus = 'invited' | 'requested' | 'awaiting_payment' | 'payment_sent' | 'active' | 'ended' | 'declined' | 'cancelled';

export interface CoachingSettings { modes: CoachingMode[]; lengths: number[]; feeMode: FeeMode }

export interface Coaching {
  id: string;
  memberId: string; memberName: string; memberPhoto: string | null;
  trainerId: string; trainerName: string; trainerPhoto: string | null;
  kind: 'pt' | 'group';
  roomId: string | null;
  months: number;
  status: CoachingStatus;
  feeMode: FeeMode;
  price: number | null;
  payReference: string | null;
  paySentAt: string | null;
  startsOn: string | null;
  endsOn: string | null;
  startedBy: 'member' | 'desk' | 'coach';
  createdAt: string;
  standin: { id: string; trainerId: string; name: string; from: string; to: string } | null;
  groupCode: string | null;
  /** Who is reading: the member, their coach, or a stand-in. */
  iAm: 'member' | 'coach' | 'standin';
}

export interface TrainerPaymentMethod {
  id: string; trainerId: string; kind: 'gcash' | 'maya' | 'bank' | 'other'; label: string;
  accountName: string | null; accountNumber: string | null; qrUrl: string | null; active: boolean;
}

export const OPEN_STATUSES: CoachingStatus[] = ['invited', 'requested', 'awaiting_payment', 'payment_sent', 'active'];

/** NULL before 0181 — the screens then offer nothing new. */
export async function getCoachingSettings(): Promise<CoachingSettings | null> {
  const { data, error } = await supabase.rpc('coaching_settings');
  if (error) return null;
  const r = (Array.isArray(data) ? data[0] : data) as { modes: CoachingMode[]; lengths: number[]; fee_mode: FeeMode } | undefined;
  if (!r) return null;
  return { modes: r.modes ?? [], lengths: r.lengths ?? [1, 3, 6], feeMode: r.fee_mode ?? 'included' };
}

/** NULL on a failed read, so a screen can say so instead of "no coach". */
export async function myCoachings(): Promise<Coaching[] | null> {
  const { data, error } = await supabase.rpc('my_coachings');
  if (error) return null;
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    memberId: r.member_id as string, memberName: (r.member_name as string) ?? 'Member', memberPhoto: (r.member_photo as string | null) ?? null,
    trainerId: r.trainer_id as string, trainerName: (r.trainer_name as string) ?? 'Coach', trainerPhoto: (r.trainer_photo as string | null) ?? null,
    kind: r.kind as 'pt' | 'group',
    roomId: (r.room_id as string | null) ?? null,
    months: Number(r.months),
    status: r.status as CoachingStatus,
    feeMode: r.fee_mode as FeeMode,
    price: r.price == null ? null : Number(r.price),
    payReference: (r.pay_reference as string | null) ?? null,
    paySentAt: (r.pay_sent_at as string | null) ?? null,
    startsOn: (r.starts_on as string | null) ?? null,
    endsOn: (r.ends_on as string | null) ?? null,
    startedBy: r.started_by as 'member' | 'desk' | 'coach',
    createdAt: r.created_at as string,
    standin: r.standin_id ? { id: r.standin_id as string, trainerId: r.standin_trainer_id as string, name: r.standin_name as string,
      from: r.standin_from as string, to: r.standin_to as string } : null,
    groupCode: (r.group_code as string | null) ?? null,
    iAm: r.i_am as 'member' | 'coach' | 'standin',
  }));
}

const call = async (fn: string, args: Record<string, unknown>) => {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data;
};

export const requestCoaching = (trainerId: string, kind: 'pt' | 'group', months: number, code?: string | null) =>
  call('request_coaching', { p_trainer: trainerId, p_kind: kind, p_months: months, p_code: code ?? null }) as Promise<string>;
export const respondCoaching = (id: string, accept: boolean, price?: number | null) =>
  call('respond_coaching', { p_id: id, p_accept: accept, p_price: price ?? null }) as Promise<string>;
export const inviteCoaching = (memberId: string, months: number, price?: number | null) =>
  call('invite_coaching', { p_member: memberId, p_months: months, p_price: price ?? null }) as Promise<string>;
export const submitCoachingPayment = (id: string, reference: string) =>
  call('submit_coaching_payment', { p_id: id, p_reference: reference });
export const confirmCoachingPayment = (id: string, received: boolean) =>
  call('confirm_coaching_payment', { p_id: id, p_received: received, p_method: null });
export const endCoaching = (id: string, reason?: string | null) =>
  call('end_coaching', { p_id: id, p_reason: reason ?? null });
export const setCoachingStandin = (id: string, trainerId: string, from: string, to: string) =>
  call('set_coaching_standin', { p_id: id, p_trainer: trainerId, p_from: from, p_to: to });

/** Ends terms whose date has passed (0181). Page load; failure is silent. */
export async function coachingSweep(): Promise<void> {
  await supabase.rpc('coaching_sweep').then(() => undefined, () => undefined);
}

/** The gym's price for each kind × length (gym_priced). */
export async function coachingPrices(): Promise<{ kind: 'pt' | 'group'; months: number; price: number }[]> {
  const { data, error } = await supabase.from('coaching_prices').select('kind, months, price');
  if (error) return [];
  return ((data ?? []) as { kind: 'pt' | 'group'; months: number; price: number | string }[]).map((r) => ({ ...r, price: Number(r.price) }));
}

const toMethod = (r: Record<string, unknown>): TrainerPaymentMethod => ({
  id: r.id as string, trainerId: r.trainer_id as string, kind: r.kind as TrainerPaymentMethod['kind'], label: r.label as string,
  accountName: (r.account_name as string | null) ?? null, accountNumber: (r.account_number as string | null) ?? null,
  qrUrl: (r.qr_url as string | null) ?? null, active: !!r.active,
});

/** How to pay a coach directly (trainer_direct). */
export async function trainerPaymentMethods(trainerId: string): Promise<TrainerPaymentMethod[]> {
  const { data, error } = await supabase.from('trainer_payment_methods').select('*')
    .eq('trainer_id', trainerId).eq('active', true).order('created_at');
  if (error) return [];
  return ((data ?? []) as Record<string, unknown>[]).map(toMethod);
}

export async function addPaymentMethod(m: { kind: TrainerPaymentMethod['kind']; label: string; accountName: string | null; accountNumber: string | null; qrUrl: string | null }): Promise<void> {
  const { error } = await supabase.from('trainer_payment_methods').insert({
    kind: m.kind, label: m.label, account_name: m.accountName, account_number: m.accountNumber, qr_url: m.qrUrl,
  });
  if (error) throw new Error(error.message);
}

export async function removePaymentMethod(id: string): Promise<void> {
  const { data, error } = await supabase.from('trainer_payment_methods').delete().eq('id', id).select('id');
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error('That could not be removed.');
}

export const STATUS_WORDS: Record<CoachingStatus, string> = {
  invited: 'Offered to you', requested: 'Waiting for the coach', awaiting_payment: 'Waiting for payment',
  payment_sent: 'Payment sent', active: 'Active', ended: 'Ended', declined: 'Declined', cancelled: 'Cancelled',
};

export const peso = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
export const monthsLabel = (m: number) => `${m} month${m === 1 ? '' : 's'}`;
