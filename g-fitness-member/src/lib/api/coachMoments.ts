import { supabase } from '../supabaseClient';
import { setRead } from './notifications';

/**
 * The coach's moments (0218; wave 1 of the lively coach app, mock-up
 * docs/superpowers/specs/2026-10-27-lively-trainer-w1/mock-trainer-w1.html).
 *
 * Everything here is decided in SQL: which milestones a coach has reached is
 * counted from sessions that happened, people coached and ratings received,
 * and each is marked played on the coach's own row in the same call — a
 * second phone never plays it again. Before 0218 every call answers "nothing".
 */

export type CoachMilestoneKind = 'sessions' | 'people' | 'first_rating' | 'top_rating';

export interface CoachMilestone {
  kind: CoachMilestoneKind;
  /** The tier reached (10 sessions, 5 people…), the count of ratings, or the average for top_rating. */
  value: number;
  /** The real count today (60 sessions when the tier is 50). */
  total: number;
  /** The next tier, or null at the top. */
  next: number | null;
}

/** New milestones, at most one per kind, already marked as shown. */
export async function celebrateCoachMoments(): Promise<CoachMilestone[]> {
  const { data, error } = await supabase.rpc('celebrate_coach_moments');
  if (error || !Array.isArray(data)) return [];
  return (data as { kind: CoachMilestoneKind; value: number; total: number; next?: number | null }[])
    .map((m) => ({ kind: m.kind, value: Number(m.value), total: Number(m.total), next: m.next ?? null }));
}

/** True once a day: the first open today, which then plays. */
export async function coachArrival(): Promise<boolean> {
  const { data, error } = await supabase.rpc('coach_arrival');
  return !error && data === true;
}

/** A trainee's record, streak, target or challenge, written to the coach's bell by 0218's triggers. */
export interface TraineeWin {
  id: string;
  memberId: string;
  firstName: string;
  kind: 'record' | 'streak' | 'target' | 'challenge';
  /** "Ana set a new record". */
  title: string;
  /** "Barbell Squat · 80 kg — best was 75 kg". */
  message: string;
  at: string;
}

/**
 * The newest trainee wins the coach has not seen yet, from the last three
 * days — older ones wait in the bell, where they always were.
 */
export async function unseenTraineeWins(): Promise<TraineeWin[]> {
  const since = new Date(Date.now() - 3 * 86_400_000).toISOString();
  const { data, error } = await supabase.from('notifications')
    .select('id, title, message, metadata, created_at')
    .eq('type', 'trainee_win').eq('read', false).is('cleared_at', null).is('archived_at', null)
    .gte('created_at', since).order('created_at', { ascending: false }).limit(5);
  if (error || !data) return [];
  return (data as { id: string; title: string; message: string | null; created_at: string;
    metadata: { member_id?: string; first_name?: string; kind?: TraineeWin['kind'] } | null }[])
    .filter((n) => n.metadata?.member_id)
    .map((n) => ({
      id: n.id, memberId: n.metadata!.member_id as string, firstName: n.metadata?.first_name ?? 'Your trainee',
      kind: n.metadata?.kind ?? 'record', title: n.title, message: n.message ?? '', at: n.created_at,
    }));
}

/** Seen: the card goes; the row stays in the bell, read. */
export async function markWinSeen(id: string): Promise<void> {
  await setRead([id], true).catch(() => undefined);
}

/**
 * What the hub plays when it opens: the first open of the day, then any new
 * milestones. Asked once per account per load — both calls mark what they
 * answer, so a second asker (React's development double-run, a remount) must
 * share the first answer rather than receive "already played".
 */
let opening: Promise<{ arrive: boolean; milestones: CoachMilestone[] }> | null = null;
export function coachOpening(): Promise<{ arrive: boolean; milestones: CoachMilestone[] }> {
  opening ??= (async () => {
    const arrive = await coachArrival();
    return { arrive, milestones: await celebrateCoachMoments() };
  })();
  return opening;
}
let claimed = false;
/** True for the first screen that plays the opening; every later mount gets false. */
export function claimCoachOpening(): boolean {
  if (claimed) return false;
  claimed = true;
  return true;
}
/** How long the day's arrival lasts on screen. */
export const ARRIVAL_MS = 2200;
let arrivedAt: number | null = null;
/** The arrival started now. Kept here, not in a component, so a remounted hub carries on with it. */
export function startArrival(): void {
  arrivedAt = Date.now();
}
/** Milliseconds of the arrival still to run (0 when none). */
export function arrivalLeft(): number {
  return arrivedAt == null ? 0 : Math.max(0, ARRIVAL_MS - (Date.now() - arrivedAt));
}
/** Account or gym changed (memberCaches.ts). */
export function clearCoachOpening(): void {
  opening = null;
  claimed = false;
  arrivedAt = null;
}
