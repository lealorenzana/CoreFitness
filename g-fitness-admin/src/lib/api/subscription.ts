import { supabase } from '../supabaseClient';

/**
 * This gym's own side of its Core Fitness subscription (0108).
 *
 * Both reads are about *this* gym and nobody else's: `my_gym_billing()` is
 * admin-only and returns no row for staff or for a member, and
 * `my_gym_features()` answers only for the current gym. The platform's ledger
 * (`gym_payments`) has RLS on with no policy at all — a gym cannot read another
 * gym's money, and cannot reach its own except through these.
 *
 * Before 0108 is pasted neither function exists. Both return null / an empty
 * list, every caller renders nothing, and the app behaves exactly as it did —
 * the same pattern every unpasted migration here follows.
 */

export interface GymBilling {
  plan_key: string;
  plan_name: string | null;
  blurb: string | null;
  price_monthly: string | null;
  price_yearly: string | null;
  paid_until: string | null;
  /** Negative is overdue. NULL when no date has ever been set. */
  days_left: number | null;
  lock_reason: 'suspended' | 'overdue' | null;
  max_members: number | null;
  members: number;
  max_staff: number | null;
  staff: number;
  last_paid_on: string | null;
  last_amount: string | null;
}

export interface GymFeature {
  feature_key: string;
  label: string;
  description: string;
  enabled: boolean;
  sort_order: number;
}

export async function getGymBilling(): Promise<GymBilling | null> {
  const { data, error } = await supabase.rpc('my_gym_billing');
  if (error || !Array.isArray(data)) return null;
  return (data[0] as GymBilling) ?? null;
}

export async function getGymFeatures(): Promise<GymFeature[]> {
  const { data, error } = await supabase.rpc('my_gym_features');
  if (error || !Array.isArray(data)) return [];
  return data as GymFeature[];
}

/**
 * How close this gym is to the ceiling its plan sets, or null when there is no
 * ceiling. The number is the same one the database enforces on `gym_roles`, so
 * "1 place left" here and a refusal at the desk cannot disagree.
 */
export function headroom(b: GymBilling | null): { used: number; cap: number; left: number } | null {
  if (!b || b.max_members === null) return null;
  return { used: b.members, cap: b.max_members, left: Math.max(0, b.max_members - b.members) };
}

/**
 * The one sentence worth putting in front of an owner, or null for silence.
 *
 * Deliberately quiet: a gym that is paid up and well inside its plan is told
 * nothing at all. A banner that is always there is furniture, and furniture
 * does not get read on the day it matters.
 */
export function subscriptionWarning(b: GymBilling | null, graceDays = 7, onTrial = false): { tone: 'warn' | 'info'; text: string } | null {
  if (!b) return null;
  // 0139: a gym that has never paid is on its free trial, and is told so in those words.
  if (onTrial && b.lock_reason === null && b.days_left !== null) {
    const d = Math.abs(b.days_left), s = d === 1 ? '' : 's';
    if (b.days_left < 0) return { tone: 'warn', text: `Your free trial ended ${d} day${s} ago. The gym goes read-only ${graceDays + 1 + b.days_left} day${graceDays + 1 + b.days_left === 1 ? '' : 's'} from now unless it moves to a paid plan.` };
    if (b.days_left <= 7) return { tone: 'info', text: `Your free trial ends ${b.days_left === 0 ? 'today' : `in ${d} day${s}`}. Pay Core Fitness for a plan to keep everything running.` };
  }

  if (b.lock_reason === 'suspended') {
    return { tone: 'warn', text: 'Core Fitness has suspended this gym, so the system is read-only. Contact us to sort it out.' };
  }
  if (b.lock_reason === 'overdue') {
    return { tone: 'warn', text: `This gym is read-only: its Core Fitness subscription was due ${b.days_left !== null ? Math.abs(b.days_left) + ' days ago' : 'some time ago'}. Everything is still here and comes straight back when it is settled.` };
  }
  if (b.days_left !== null && b.days_left < 0) {
    return { tone: 'warn', text: `Your Core Fitness subscription was due ${Math.abs(b.days_left)} day${Math.abs(b.days_left) === 1 ? '' : 's'} ago. The gym goes read-only ${graceDays + 1 + b.days_left} day${graceDays + 1 + b.days_left === 1 ? '' : 's'} from now.` };
  }
  if (b.days_left !== null && b.days_left <= 7) {
    return { tone: 'info', text: `Your Core Fitness subscription runs out ${b.days_left === 0 ? 'today' : `in ${b.days_left} day${b.days_left === 1 ? '' : 's'}`}.` };
  }

  const room = headroom(b);
  if (room && room.left === 0) {
    return { tone: 'warn', text: `Your plan allows ${room.cap} active members and you have ${room.used}. The next sign-up will be refused until someone is archived or the gym moves to a bigger plan.` };
  }
  if (room && room.left <= 5) {
    return { tone: 'info', text: `${room.left} place${room.left === 1 ? '' : 's'} left on your plan — ${room.used} of ${room.cap} members.` };
  }
  return null;
}

// ---- 0138: the grace period, receipts, and the reminder sweep ---------------------------------

export interface GymSubscription {
  plan_name: string | null;
  price_monthly: string | null;
  /** From `my_gym_billing()` (0108), which `my_gym_subscription()` never carried. Null when there is none. */
  price_yearly?: string | null;
  paid_until: string | null;
  days_left: number | null;
  /** The platform's setting: read-only this many days after paid_until. */
  grace_days: number;
  /** The first read-only day. */
  read_only_on: string | null;
  lock_reason: string | null;
  max_members: number | null;
  members: number;
  max_staff: number | null;
  staff: number;
  /** Never paid, on a plan with a free period (0139). Absent before 0139. */
  on_trial?: boolean;
}
export interface GymReceiptRow {
  id: string; receipt_no: string; amount: string; paid_on: string; covers_from: string | null;
  covers_until: string; method: string | null; plan_name: string | null;
}
export interface GymReceipt {
  receipt_no: string; amount: string; paid_on: string; covers_from: string | null; covers_until: string;
  method: string | null; reference: string | null; plan_name: string | null; gym_name: string; gym_address: string | null;
  business_name: string; business_address: string | null; business_email: string | null; business_phone: string | null;
  receipt_note: string | null;
}

/** undefined = 0138 not live; null = not the owner. */
export async function getSubscription(): Promise<GymSubscription | null | undefined> {
  const [{ data, error }, billing] = await Promise.all([supabase.rpc('my_gym_subscription'), getGymBilling()]);
  if (error) return undefined;
  const sub = ((data ?? []) as GymSubscription[])[0] ?? null;
  // The yearly price lives on the plan; without it a yearly gym was shown, and
  // asked to pay, twelve times the monthly price.
  return sub ? { ...sub, price_yearly: billing?.price_yearly ?? null } : null;
}
export async function myGymPayments(): Promise<GymReceiptRow[]> {
  const { data, error } = await supabase.rpc('my_gym_payments');
  if (error) return [];
  return (data ?? []) as GymReceiptRow[];
}
export async function gymReceipt(id: string): Promise<GymReceipt | null> {
  const { data, error } = await supabase.rpc('gym_payment_receipt', { p_payment: id });
  if (error) throw new Error(error.message);
  return ((data ?? []) as GymReceipt[])[0] ?? null;
}
/** Reminders before the lock (0138). Fire-and-forget: a sweep never breaks a page. */
export function sweepBillingReminders(): void {
  void supabase.rpc('billing_reminders_sweep').then(() => undefined, () => undefined);
}

// ---- 0148: paying Core Fitness from anywhere ---------------------------------------------------
export interface PayOption {
  id: string; kind: 'gcash' | 'maya' | 'bank' | 'other'; label: string; account_name: string | null;
  account_number: string | null; qr_image: string | null; instructions: string | null;
}
export interface PaymentClaim {
  id: string; amount: string; paid_on: string; method_label: string; reference: string; months: number;
  status: 'pending' | 'verified' | 'rejected'; reason: string | null; created_at: string; decided_at: string | null;
}

/** undefined = 0148 not live. */
export async function payOptions(): Promise<PayOption[] | undefined> {
  const { data, error } = await supabase.rpc('platform_payment_options');
  if (error) return undefined;
  return (data ?? []) as PayOption[];
}
export async function myPaymentClaims(): Promise<PaymentClaim[]> {
  const { data, error } = await supabase.rpc('my_gym_payment_claims');
  if (error) return [];
  return (data ?? []) as PaymentClaim[];
}
/** The owner tells Core Fitness they paid; the platform checks it against its own history. */
export async function claimPayment(c: {
  amount: number; paidOn: string; method: string; reference: string; proof: string | null; months: number; note: string | null;
}): Promise<string> {
  const { data, error } = await supabase.rpc('submit_gym_payment', {
    p_amount: c.amount, p_paid_on: c.paidOn, p_method: c.method, p_reference: c.reference,
    p_proof: c.proof, p_months: c.months, p_note: c.note,
  });
  if (error) throw new Error(error.message);
  return data as string;
}
