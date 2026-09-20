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
export function subscriptionWarning(b: GymBilling | null): { tone: 'warn' | 'info'; text: string } | null {
  if (!b) return null;

  if (b.lock_reason === 'suspended') {
    return { tone: 'warn', text: 'Core Fitness has suspended this gym, so the system is read-only. Contact us to sort it out.' };
  }
  if (b.lock_reason === 'overdue') {
    return { tone: 'warn', text: `This gym is read-only: its Core Fitness subscription was due ${b.days_left !== null ? Math.abs(b.days_left) + ' days ago' : 'some time ago'}. Everything is still here and comes straight back when it is settled.` };
  }
  if (b.days_left !== null && b.days_left < 0) {
    return { tone: 'warn', text: `Your Core Fitness subscription was due ${Math.abs(b.days_left)} day${Math.abs(b.days_left) === 1 ? '' : 's'} ago. The gym goes read-only ${7 + b.days_left} day${7 + b.days_left === 1 ? '' : 's'} from now.` };
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
