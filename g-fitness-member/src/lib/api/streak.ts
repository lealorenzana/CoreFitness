import { supabase } from '../supabaseClient';

/**
 * The gym streak (0151): consecutive weeks in which a member reached their own
 * weekly target of training days (a check-in or a logged workout, 0124's one
 * definition). Frozen weeks neither count nor break it, and the week in progress
 * never breaks it. Everything is decided in SQL — this module asks and reads.
 */

/** One week in the last twelve (0152): reached, frozen, missed, before joining, or this week in progress. */
export interface StreakWeek { week: string; days: number; state: 'hit' | 'frozen' | 'miss' | 'before' | 'current' }

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
  /** Oldest first; empty before 0152 is pasted. */
  history: StreakWeek[];
  /** Weekdays the member's own training plan names (0030); 0 = no plan, or before 0153. */
  planDays: number;
  /** Days the gym is closed, 0 = Sunday (0153). */
  closedDays: number[];
}

type Row = {
  target: number; current: number; best: number; days_this_week: number; needed: number; days_left: number;
  week: boolean[]; today_index: number; frozen: boolean; at_risk: boolean; out_of_reach: boolean;
  next_milestone: number | null; nudges: boolean; history?: StreakWeek[];
  plan_days?: number; closed_days?: number[];
};

export const toStreak = (r: Row): StreakCard => ({
  target: r.target, current: r.current, best: r.best, daysThisWeek: r.days_this_week, needed: r.needed,
  daysLeft: r.days_left, week: r.week ?? [], todayIndex: r.today_index, frozen: r.frozen, atRisk: r.at_risk,
  outOfReach: r.out_of_reach, nextMilestone: r.next_milestone, nudges: r.nudges,
  history: Array.isArray(r.history) ? r.history : [],
  planDays: r.plan_days ?? 0,
  closedDays: Array.isArray(r.closed_days) ? r.closed_days : [],
});

/**
 * How the flame looks for a run — it grows the way a streak should feel like it
 * is growing. Colours stay in the app's two roles (no reds or greens): amber is
 * the flame, violet the aura that deepens with it.
 */
export type FlameTier = 'out' | 'ember' | 'flame' | 'blaze' | 'inferno';
export const flameTier = (weeks: number): FlameTier =>
  weeks <= 0 ? 'out' : weeks < 4 ? 'ember' : weeks < 12 ? 'flame' : weeks < 26 ? 'blaze' : 'inferno';
export const TIER_LABEL: Record<FlameTier, string> = {
  out: 'Not lit yet', ember: 'Ember', flame: 'Flame', blaze: 'Blaze', inferno: 'Inferno',
};

export const MILESTONES = [4, 12, 26, 52] as const;

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

/** A squad's streak (0153): consecutive weeks the squad reached its weekly target. */
export interface SquadStreak {
  name: string; target: number; current: number; best: number; daysThisWeek: number; needed: number;
  daysLeft: number; members: number; atRisk: boolean; outOfReach: boolean; history: StreakWeek[];
}

/** null when not in a squad, Squads switched off, or before 0153. */
export async function mySquadStreak(): Promise<SquadStreak | null> {
  const { data, error } = await supabase.rpc('my_squad_streak');
  if (error || !data) return null;
  const r = data as Record<string, unknown>;
  return {
    name: String(r.name), target: Number(r.target), current: Number(r.current), best: Number(r.best),
    daysThisWeek: Number(r.days_this_week), needed: Number(r.needed), daysLeft: Number(r.days_left),
    members: Number(r.members), atRisk: Boolean(r.at_risk), outOfReach: Boolean(r.out_of_reach),
    history: Array.isArray(r.history) ? (r.history as StreakWeek[]) : [],
  };
}

/** The board's squad streaks — names and numbers only. Empty before 0153. */
export async function squadStreaks(): Promise<Map<string, number>> {
  const { data, error } = await supabase.rpc('squad_streaks');
  if (error || !Array.isArray(data)) return new Map();
  return new Map((data as { squad_name: string; current_streak: number }[]).map((r) => [r.squad_name, r.current_streak]));
}

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** "Sun" / "Sat and Sun" — the gym's closed days, said plainly. */
export const closedDaysLabel = (days: number[]) => {
  const names = [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => DAY_SHORT[d]);
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
};

/** A trainee's squad streak, for their coach (0153). null when none, not visible, or before 0153. */
export async function memberSquadStreak(memberId: string): Promise<{ current: number; atRisk: boolean } | null> {
  const { data, error } = await supabase.rpc('member_squad_streak', { p_member: memberId });
  if (error || !data) return null;
  const r = data as Record<string, unknown>;
  return { current: Number(r.current), atRisk: Boolean(r.at_risk) };
}
