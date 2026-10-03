import { supabase } from '../supabaseClient';
import { pushOnly } from './notify';

/**
 * The gym streak (0151), the desk's side: one member's streak for the drawer,
 * and the weekly "keep your streak" sweep the dashboard runs. The rules are
 * SQL's — this module asks and reads.
 */

export interface MemberStreak {
  target: number; current: number; best: number; daysThisWeek: number; needed: number;
  frozen: boolean; atRisk: boolean; outOfReach: boolean;
}

/** null when not visible or before 0151. */
export async function memberStreak(memberId: string): Promise<MemberStreak | null> {
  const { data, error } = await supabase.rpc('member_streak', { p_member: memberId });
  if (error || !data) return null;
  const r = data as Record<string, unknown>;
  return {
    target: Number(r.target), current: Number(r.current), best: Number(r.best),
    daysThisWeek: Number(r.days_this_week), needed: Number(r.needed),
    frozen: Boolean(r.frozen), atRisk: Boolean(r.at_risk), outOfReach: Boolean(r.out_of_reach),
  };
}

/**
 * Tells each member whose streak needs every day left this week, once a week
 * (notify_once writes the record), then pushes the alert. Never throws: the
 * record is what matters, and the push is a courtesy (CLAUDE.md, notifications).
 */
export async function streakNudgeSweep(): Promise<void> {
  const { data, error } = await supabase.rpc('streak_nudge_sweep');
  if (error || !Array.isArray(data)) return;
  for (const r of data as { member_id: string; title: string; message: string }[]) {
    pushOnly({ userId: r.member_id, title: r.title, message: r.message, type: 'system', actionUrl: '/member/home' });
  }
}
