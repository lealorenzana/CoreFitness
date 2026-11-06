import { supabase } from '../supabaseClient';
import type { Coaching } from './coaching';

/**
 * Coaching house rules (0235), the member's and the coach's side: does
 * coaching pause when a membership freezes, a coach's pauses to decide, and —
 * for coaches — what members paid them, the gym's share and their dues.
 * A member never reads the money (the database returns it as null to them).
 * Admin has its own copy with the desk's writes; this one has no desk writes.
 */
export type PauseRule = 'never' | 'with_membership' | 'coach_decides';

export interface HouseRules {
  pause: PauseRule;
  /** Null to a member: the share and dues are between the gym and its coaches. */
  cutOn: boolean | null; cutPercent: number | null;
  duesOn: boolean | null; duesAmount: number | null;
}

export async function getHouseRules(): Promise<HouseRules | null> {
  const { data, error } = await supabase.rpc('coaching_house_rules');
  if (error) return null;
  const r = (Array.isArray(data) ? data[0] : data) as
    { pause: PauseRule; cut_on: boolean | null; cut_percent: number | null; dues_on: boolean | null; dues_amount: number | null } | undefined;
  if (!r) return null;
  return {
    pause: r.pause ?? 'never',
    cutOn: r.cut_on, cutPercent: r.cut_percent == null ? null : Number(r.cut_percent),
    duesOn: r.dues_on, duesAmount: r.dues_amount == null ? null : Number(r.dues_amount),
  };
}

const rpc = async (fn: string, args: Record<string, unknown> = {}) => {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data;
};

const shortDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });

/** What freezing does to the member's own active coaching, in the gym's rule — said before they ask. */
export function freezeNoteFor(rule: PauseRule, c: Pick<Coaching, 'trainerName' | 'endsOn'>): string {
  const ends = c.endsOn ? shortDate(c.endsOn) : null;
  if (rule === 'with_membership') {
    return `Your coaching with ${c.trainerName} pauses too. Its end date${ends ? ` (${ends})` : ''} moves by the days you are away.`;
  }
  if (rule === 'coach_decides') {
    return `${c.trainerName} decides whether your coaching pauses too — you are told when they do. If they have not decided by the time you are back, it keeps running.`;
  }
  return `Your coaching with ${c.trainerName} keeps running${ends ? ` and still ends ${ends}` : ''} — your gym does not pause coaching on a freeze.`;
}

// ---- pauses ------------------------------------------------------------------
export interface CoachingPause {
  id: string; coachingId: string; memberId: string; memberName: string; trainerId: string; trainerName: string;
  frozenOn: string; decision: 'pending' | 'pause' | 'keep'; resumedOn: string | null; daysCredited: number | null; endsOn: string | null;
}

/** Pauses the caller may see: their own as a member, their trainees' as a coach. */
export async function coachingPauses(): Promise<CoachingPause[]> {
  const { data, error } = await supabase.rpc('my_coaching_pauses');
  if (error) return [];
  return ((data ?? []) as {
    id: string; coaching_id: string; member_id: string; member_name: string; trainer_id: string; trainer_name: string;
    frozen_on: string; decision: 'pending' | 'pause' | 'keep'; resumed_on: string | null; days_credited: number | null; ends_on: string | null;
  }[]).map((r) => ({
    id: r.id, coachingId: r.coaching_id, memberId: r.member_id, memberName: r.member_name, trainerId: r.trainer_id,
    trainerName: r.trainer_name, frozenOn: r.frozen_on, decision: r.decision, resumedOn: r.resumed_on,
    daysCredited: r.days_credited, endsOn: r.ends_on,
  }));
}

export const decidePause = (id: string, pause: boolean) => rpc('decide_coaching_pause', { p_id: id, p_pause: pause });

// ---- a coach's own money -----------------------------------------------------
export interface EarningsMonth {
  month: string; paidTotal: number; packages: number; percent: number; owed: number; settled: boolean;
}

/** The signed-in coach's months (newest first). Empty when the gym takes no share. */
export async function myEarnings(months = 6): Promise<EarningsMonth[]> {
  const { data, error } = await supabase.rpc('coach_earnings', { p_months: months });
  if (error) throw new Error(error.message);
  return ((data ?? []) as { month: string; paid_total: number; packages: number; percent: number; owed: number; settled: boolean }[])
    .map((r) => ({ month: r.month, paidTotal: Number(r.paid_total), packages: r.packages, percent: Number(r.percent), owed: Number(r.owed), settled: r.settled }));
}

export interface DuesMonth { month: string; due: number; paid: number | null; method: string | null }

/** The signed-in coach's dues months (newest first). Empty when the gym charges no dues. */
export async function myDues(months = 12): Promise<DuesMonth[]> {
  const { data, error } = await supabase.rpc('coach_dues', { p_months: months });
  if (error) throw new Error(error.message);
  return ((data ?? []) as { month: string; due: number; paid: number | null; method: string | null }[])
    .map((r) => ({ month: r.month, due: Number(r.due), paid: r.paid == null ? null : Number(r.paid), method: r.method }));
}
