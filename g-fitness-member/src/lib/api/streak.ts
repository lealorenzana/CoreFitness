import { supabase } from '../supabaseClient';

/**
 * The gym streak (0151): consecutive weeks in which a member reached their own
 * weekly target of training days (a check-in or a logged workout, 0124's one
 * definition). Frozen weeks neither count nor break it, and the week in progress
 * never breaks it. Everything is decided in SQL — this module asks and reads.
 */

export interface StreakCard {
  target: number;
  current: number;
  best: number;
  daysThisWeek: number;
  needed: number;
  daysLeft: number;
  /** Monday → Sunday: a training day or not. */
  week: boolean[];
  todayIndex: number;
  frozen: boolean;
  /** Exactly as many days left as the week still needs. */
  atRisk: boolean;
  /** More days needed than remain this week. */
  outOfReach: boolean;
  nextMilestone: number | null;
  nudges: boolean;
}

type Row = {
  target: number; current: number; best: number; days_this_week: number; needed: number; days_left: number;
  week: boolean[]; today_index: number; frozen: boolean; at_risk: boolean; out_of_reach: boolean;
  next_milestone: number | null; nudges: boolean;
};

export const toStreak = (r: Row): StreakCard => ({
  target: r.target, current: r.current, best: r.best, daysThisWeek: r.days_this_week, needed: r.needed,
  daysLeft: r.days_left, week: r.week ?? [], todayIndex: r.today_index, frozen: r.frozen, atRisk: r.at_risk,
  outOfReach: r.out_of_reach, nextMilestone: r.next_milestone, nudges: r.nudges,
});

/** null = no streak here (Progress switched off at this gym, or 0151 not live yet). */
export async function myStreak(): Promise<StreakCard | null> {
  const { data, error } = await supabase.rpc('my_streak');
  if (error || !data) return null;
  return toStreak(data as Row);
}

/** Records and pays any milestone newly reached. Returns those weeks (e.g. [4]). Never throws. */
export async function settleMyStreak(): Promise<number[]> {
  const { data, error } = await supabase.rpc('settle_my_streak');
  if (error || !Array.isArray(data)) return [];
  return data as number[];
}

/** The member's own weekly target (2–5) and whether they want the reminder. */
export async function setStreakTarget(target: number, nudges: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_streak_target', { p_target: target, p_nudges: nudges });
  if (error) throw new Error(error.message.replace(/^.*?: /, ''));
}

/** A trainee's streak, for their coach. null when not visible or not live. */
export async function memberStreak(memberId: string): Promise<StreakCard | null> {
  const { data, error } = await supabase.rpc('member_streak', { p_member: memberId });
  if (error || !data) return null;
  return toStreak(data as Row);
}

/** The one sentence under the streak — what this week still needs, said plainly. */
export function streakLine(s: StreakCard): { text: string; tone: 'state' | 'action' | 'muted' } {
  if (s.frozen) return { text: 'Paused while your membership is frozen — it will not break.', tone: 'muted' };
  if (s.needed === 0) return { text: `This week's target is reached${s.current > 0 ? ' — your streak is safe' : ''}.`, tone: 'state' };
  if (s.outOfReach) {
    return s.current > 0
      ? { text: 'This week is out of reach now. Start a new streak on Monday.', tone: 'muted' }
      : { text: `Train ${s.target} days in a week to start a streak.`, tone: 'muted' };
  }
  if (s.atRisk) {
    return { text: s.needed === 1 ? 'Train today to keep your streak.' : `Train every day left this week to keep it — ${s.needed} more.`, tone: 'action' };
  }
  return {
    text: `${s.needed} more training ${s.needed === 1 ? 'day' : 'days'} this week ${s.current > 0 ? 'keeps it going' : 'starts a streak'}.`,
    tone: 'action',
  };
}
