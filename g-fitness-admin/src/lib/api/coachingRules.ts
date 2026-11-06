import { supabase } from '../supabaseClient';

/**
 * Coaching house rules (0235), the gym's side: does coaching pause when a
 * membership freezes, the gym's share of what members pay coaches directly,
 * and coach dues. Every write is a definer function; the database's words are
 * the errors. Reads answer null/empty before 0235 so the screens offer nothing.
 */
export type PauseRule = 'never' | 'with_membership' | 'coach_decides';

export interface HouseRules {
  pause: PauseRule;
  cutOn: boolean; cutPercent: number;
  duesOn: boolean; duesAmount: number; duesSince: string | null;
}

export const PAUSE_WORDS: Record<PauseRule, { title: string; blurb: string }> = {
  never: { title: 'Coaching keeps running', blurb: 'Freezing pauses the membership only. The member is told before they ask.' },
  with_membership: { title: 'Coaching pauses with the membership', blurb: 'Its end date moves by the days the member is away.' },
  coach_decides: { title: 'The coach decides', blurb: 'Their coach is asked each time. If the coach does not answer, coaching keeps running.' },
};

export async function getHouseRules(): Promise<HouseRules | null> {
  const { data, error } = await supabase.rpc('coaching_house_rules');
  if (error) return null;
  const r = (Array.isArray(data) ? data[0] : data) as
    { pause: PauseRule; cut_on: boolean | null; cut_percent: number | null; dues_on: boolean | null; dues_amount: number | null; dues_since: string | null } | undefined;
  if (!r) return null;
  return {
    pause: r.pause ?? 'never',
    cutOn: !!r.cut_on, cutPercent: Number(r.cut_percent ?? 0),
    duesOn: !!r.dues_on, duesAmount: Number(r.dues_amount ?? 0), duesSince: r.dues_since,
  };
}

const rpc = async (fn: string, args: Record<string, unknown> = {}) => {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data;
};

export async function saveHouseRules(r: HouseRules): Promise<void> {
  await rpc('set_coaching_house_rules', {
    p_pause: r.pause, p_cut_on: r.cutOn, p_cut_percent: r.cutPercent, p_dues_on: r.duesOn, p_dues_amount: r.duesAmount,
  });
}

// ---- the gym's share -------------------------------------------------------
export interface EarningsMonth {
  trainerId: string; trainerName: string; month: string;
  paidTotal: number; packages: number; percent: number; owed: number; settled: boolean; settledAt: string | null;
}

/** Each coach's months (newest first): packages paid to them, and the gym's share. Empty when the share is off. */
export async function coachEarnings(months = 6): Promise<EarningsMonth[]> {
  const { data, error } = await supabase.rpc('coach_earnings', { p_months: months });
  if (error) throw new Error(error.message);
  return ((data ?? []) as {
    trainer_id: string; trainer_name: string; month: string; paid_total: number; packages: number;
    percent: number; owed: number; settled: boolean; settled_at: string | null;
  }[]).map((r) => ({
    trainerId: r.trainer_id, trainerName: r.trainer_name, month: r.month, paidTotal: Number(r.paid_total),
    packages: r.packages, percent: Number(r.percent), owed: Number(r.owed), settled: r.settled, settledAt: r.settled_at,
  }));
}

export const settleCut = (trainerId: string, month: string) => rpc('settle_coach_cut', { p_trainer: trainerId, p_month: month });
export const unsettleCut = (trainerId: string, month: string) => rpc('unsettle_coach_cut', { p_trainer: trainerId, p_month: month });

// ---- coach dues --------------------------------------------------------------
export type DuesMethod = 'cash' | 'gcash' | 'maya' | 'bank' | 'other';
export const DUES_METHODS: { key: DuesMethod; label: string }[] = [
  { key: 'cash', label: 'Cash' }, { key: 'gcash', label: 'GCash' }, { key: 'maya', label: 'Maya' },
  { key: 'bank', label: 'Bank' }, { key: 'other', label: 'Other' },
];

export interface DuesMonth {
  trainerId: string; trainerName: string; month: string; due: number;
  paid: number | null; method: DuesMethod | null; recordedAt: string | null;
}

/** Each active coach's months since dues began (newest first): due and paid. Empty when dues are off. */
export async function coachDues(months = 12): Promise<DuesMonth[]> {
  const { data, error } = await supabase.rpc('coach_dues', { p_months: months });
  if (error) throw new Error(error.message);
  return ((data ?? []) as {
    trainer_id: string; trainer_name: string; month: string; due: number; paid: number | null; method: DuesMethod | null; recorded_at: string | null;
  }[]).map((r) => ({
    trainerId: r.trainer_id, trainerName: r.trainer_name, month: r.month, due: Number(r.due),
    paid: r.paid == null ? null : Number(r.paid), method: r.method, recordedAt: r.recorded_at,
  }));
}

export const recordDues = (trainerId: string, month: string, amount: number, method: DuesMethod, note?: string) =>
  rpc('record_coach_dues', { p_trainer: trainerId, p_month: month, p_amount: amount, p_method: method, p_note: note ?? null });
export const undoDues = (trainerId: string, month: string) => rpc('undo_coach_dues', { p_trainer: trainerId, p_month: month });

/**
 * Coaches behind on dues: an unpaid month BEFORE this one. This month unpaid is
 * "due", not "behind" — nobody is flagged on the 1st. `thisMonth` is the first
 * of the current month as YYYY-MM-DD (utils/dates, Manila).
 */
export function behindOnDues(rows: DuesMonth[], thisMonth: string): { trainerId: string; trainerName: string; months: number }[] {
  const by = new Map<string, { trainerId: string; trainerName: string; months: number }>();
  for (const r of rows) {
    if (r.paid != null || r.month >= thisMonth) continue;
    const b = by.get(r.trainerId) ?? { trainerId: r.trainerId, trainerName: r.trainerName, months: 0 };
    b.months++;
    by.set(r.trainerId, b);
  }
  return [...by.values()];
}

// ---- pauses ------------------------------------------------------------------
export interface CoachingPause {
  id: string; coachingId: string; memberId: string; memberName: string; trainerId: string; trainerName: string;
  frozenOn: string; decision: 'pending' | 'pause' | 'keep'; resumedOn: string | null; daysCredited: number | null; endsOn: string | null;
}

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

/**
 * What freezing this member does to their coaching, in the gym's own rule —
 * said to the desk before they freeze (MembershipActionDialog). Null when the
 * member has no active coaching package, or before 0235.
 */
export async function freezeCoachingNote(memberId: string, firstName: string): Promise<string | null> {
  const rules = await getHouseRules();
  if (!rules) return null;
  const { data: c } = await supabase.from('coachings').select('trainer_id, ends_on')
    .eq('member_id', memberId).eq('status', 'active').order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!c) return null;
  const { data: t } = await supabase.from('gym_people').select('first_name, last_name').eq('id', c.trainer_id).maybeSingle();
  const coach = t ? `${t.first_name ?? ''} ${t.last_name ?? ''}`.trim() || 'their coach' : 'their coach';
  const ends = c.ends_on ? new Date(`${c.ends_on}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) : null;
  if (rules.pause === 'with_membership') {
    return `${firstName}'s coaching with ${coach} pauses too — its end date${ends ? ` (${ends})` : ''} moves by the days they are away.`;
  }
  if (rules.pause === 'coach_decides') {
    return `${coach} is asked whether ${firstName}'s coaching pauses too. If ${coach} has not answered by the time the membership is back on, it keeps running.`;
  }
  return `${firstName}'s coaching with ${coach} keeps running${ends ? ` and still ends ${ends}` : ''} — your gym does not pause coaching on a freeze.`;
}
