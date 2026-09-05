import { supabase } from '../supabaseClient';
import { todayKey } from '../../utils/dates';

/**
 * Gym challenges (migration 0052).
 *
 * Progress is asked for one challenge at a time rather than stored, because a
 * stored figure would need updating from attendance, workout logs, bookings and
 * goals, and would be wrong the first time any of those was edited. The count
 * is computed inside the challenge's own window; nothing here can influence it.
 */

export interface Challenge {
  id: string;
  title: string;
  description: string | null;
  metricKey: string;
  metricLabel: string;
  target: number;
  startsOn: string;
  endsOn: string;
  rewardPoints: number;
  /** Null until the member's progress has been fetched. */
  progress: number | null;
  joined: boolean;
  completedOn: string | null;
  /** Optional picture the gym attached (0065). NULL is normal. */
  imageUrl: string | null;
}

interface Row {
  id: string;
  title: string;
  description: string | null;
  metric_key: string;
  target: number;
  starts_on: string;
  ends_on: string;
  reward_points: number;
  image_url: string | null;
  achievement_metrics: { label: string } | { label: string }[] | null;
}

/**
 * Everything currently running or recently finished, with this member's own
 * progress filled in.
 *
 * The progress calls are issued together rather than in sequence: a member with
 * four open challenges should not wait four round trips to see a screen.
 */
export async function listChallenges(memberId: string): Promise<Challenge[]> {
  // Local, not UTC: `ends_on` is a calendar date, and before 8am Manila the
  // UTC date is yesterday — so a challenge that finished last night was still
  // being offered for the first eight hours of the day.
  const today = todayKey();

  const [{ data, error }, joined] = await Promise.all([
    supabase
      .from('challenges')
      .select('id, title, description, metric_key, target, starts_on, ends_on, reward_points, image_url, achievement_metrics(label)')
      .eq('is_active', true)
      .gte('ends_on', today)
      .order('ends_on'),
    supabase
      .from('challenge_participants')
      .select('challenge_id, completed_on')
      .eq('member_id', memberId),
  ]);
  if (error) throw error;
  if (joined.error) throw joined.error;

  const mine = new Map(
    (joined.data ?? []).map((j) => [j.challenge_id as string, j.completed_on as string | null])
  );

  const list = ((data ?? []) as Row[]).map((r) => {
    const m = r.achievement_metrics;
    const label = Array.isArray(m) ? m[0]?.label : m?.label;
    return {
      id: r.id,
      title: r.title,
      description: r.description,
      metricKey: r.metric_key,
      metricLabel: label ?? r.metric_key,
      target: r.target,
      startsOn: r.starts_on,
      endsOn: r.ends_on,
      rewardPoints: r.reward_points,
      progress: null as number | null,
      joined: mine.has(r.id),
      completedOn: mine.get(r.id) ?? null,
      imageUrl: r.image_url ?? null,
    };
  });

  // A single failed progress call leaves that one bar unknown rather than
  // failing the whole screen. Wrapped in an async function rather than chained:
  // `.rpc()` returns a thenable builder, not a Promise, so it has no `.catch`.
  const progress = await Promise.all(
    list.map(async (c) => {
      try {
        const res = await supabase.rpc('challenge_progress', {
          p_challenge: c.id,
          p_member: memberId,
        });
        return res.error ? null : Number(res.data ?? 0);
      } catch {
        return null;
      }
    })
  );
  list.forEach((c, i) => { c.progress = progress[i]; });
  return list;
}

export async function joinChallenge(challengeId: string, memberId: string): Promise<void> {
  const { error } = await supabase
    .from('challenge_participants')
    .insert({ challenge_id: challengeId, member_id: memberId });
  if (error) throw error;
}

/** Only possible while `completed_on` is null — 0052's delete policy enforces it. */
export async function leaveChallenge(challengeId: string, memberId: string): Promise<void> {
  const { error } = await supabase
    .from('challenge_participants')
    .delete()
    .eq('challenge_id', challengeId)
    .eq('member_id', memberId);
  if (error) throw error;
}
