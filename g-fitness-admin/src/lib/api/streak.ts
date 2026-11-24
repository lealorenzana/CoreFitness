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
  /** 0272: the most recent missed week the desk may restore (within 14 days), or null. */
  deskRestore: { week: string; lost: number; restoredTo: number; until: string } | null;
  /** 0272: the member's own restore, open today only (the Monday after the missed week). */
  memberRestore: { lost: number; left: number } | null;
  /** 0272: the last restores, newest first. */
  restores: { week: string; kind: 'member' | 'desk'; reason: string | null; note: string | null; weeks: number; by: string | null }[];
  /** 0272: no membership today — when it ended, the last day a renewal keeps the streak. */
  lapse: { endedOn: string; renewBy: string; inGrace: boolean } | null;
}

type Offer = { week: string; lost: number; restored_to: number; until: string; left: number } | null | undefined;
type Lapse = { ended_on: string; renew_by: string; in_grace: boolean } | null | undefined;
const toMember = (r: Record<string, unknown>): MemberStreak => {
  const desk = r.desk_restore as Offer;
  const mine = r.restore as Offer;
  const lapse = r.lapse as Lapse;
  return {
    target: Number(r.target), current: Number(r.current), best: Number(r.best),
    daysThisWeek: Number(r.days_this_week), needed: Number(r.needed),
    frozen: Boolean(r.frozen), atRisk: Boolean(r.at_risk), outOfReach: Boolean(r.out_of_reach),
    deskRestore: desk ? { week: desk.week, lost: desk.lost, restoredTo: desk.restored_to, until: desk.until } : null,
    memberRestore: mine ? { lost: mine.lost, left: mine.left } : null,
    restores: Array.isArray(r.restores) ? (r.restores as MemberStreak['restores']) : [],
    lapse: lapse ? { endedOn: lapse.ended_on, renewBy: lapse.renew_by, inGrace: lapse.in_grace } : null,
  };
};

export type RestoreReason = 'sick' | 'injury' | 'gym_closed' | 'other';
export const RESTORE_REASONS: { key: RestoreReason; label: string }[] = [
  { key: 'sick', label: 'Sick' }, { key: 'injury', label: 'Injury' },
  { key: 'gym_closed', label: 'Gym closed' }, { key: 'other', label: 'Other' },
];

/** The desk restores a member's most recent missed week (0272). Returns the new streak; throws the reason. */
export async function restoreMemberStreak(memberId: string, reason: RestoreReason, note: string): Promise<MemberStreak> {
  const { data, error } = await supabase.rpc('restore_member_streak', { p_member: memberId, p_reason: reason, p_note: note.trim() || null });
  if (error || !data) throw new Error(error?.message.replace(/^.*?: /, '') ?? 'Could not restore it.');
  return toMember(data as Record<string, unknown>);
}

/** null when not visible or before 0151. */
export async function memberStreak(memberId: string): Promise<MemberStreak | null> {
  const { data, error } = await supabase.rpc('member_streak', { p_member: memberId });
  if (error || !data) return null;
  return toMember(data as Record<string, unknown>);
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
