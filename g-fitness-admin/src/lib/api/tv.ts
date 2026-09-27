import { supabase } from '../supabaseClient';
import { getGymApp, type GymApp } from './gymApp';
import { listRecentBroadcasts } from './notifications';

/**
 * Everything the lobby TV shows, read in one pass (/tv).
 *
 * Every panel reads what the members' own screens read — the same definer
 * functions (pr_wall, season_board, squad_board, current_gym_goal), so the
 * TV cannot show more than a member could: the record wall and the season
 * board list only members who opted in (0123), squads show names only (0124),
 * and check-ins are a **count**, never names.
 *
 * Each panel is null when it cannot be read or does not apply (before its
 * migration, or nothing running), and the TV skips it — a lobby screen with an
 * error message on it is worse than one fewer slide.
 */

export interface TvData {
  app: GymApp | null;
  checkinsToday: number | null;
  goal: { title: string; metric: string; target: number; progress: number; contributors: number; reached: boolean; rewardPoints: number } | null;
  wall: { name: string; exercise: string; value: string }[];
  season: { name: string; score: number }[];
  squads: { name: string; members: number; days: number; target: number; reached: boolean }[];
  classes: { name: string; at: string; booked: number; capacity: number }[];
  announcement: { title: string; message: string; sentAt: string } | null;
}

const manilaToday = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
const safe = async <T,>(p: PromiseLike<T>, fallback: T): Promise<T> => {
  try { return await p; } catch { return fallback; }
};
const rpcRows = async <T,>(fn: string): Promise<T[]> => {
  const { data, error } = await supabase.rpc(fn);
  return error || !Array.isArray(data) ? [] : (data as T[]);
};

export async function loadTv(): Promise<TvData> {
  // Pay anything now due (squad weeks, the gym goal) — the TV is open all day,
  // which makes it the most reliable sweep there is when pg_cron is not set up.
  await Promise.all([
    supabase.rpc('settle_squads').then(() => undefined, () => undefined),
    supabase.rpc('settle_gym_goals').then(() => undefined, () => undefined),
  ]);

  const day = manilaToday();
  const start = `${day}T00:00:00+08:00`;
  const end = `${day}T23:59:59+08:00`;

  const [app, checkins, goalRows, wallRows, seasonRows, squadRows, classRows, broadcasts] = await Promise.all([
    safe(getGymApp(), null),
    safe(supabase.from('attendance').select('id', { count: 'exact', head: true }).gte('check_in_time', start).lte('check_in_time', end)
      .then((r) => (r.error ? null : r.count ?? 0)), null),
    safe(rpcRows<{ title: string; metric: string; target: number; progress: number; contributors: number; reached: boolean; reward_points: number }>('current_gym_goal'), []),
    safe(rpcRows<{ first_name: string; last_initial: string; exercise_name: string; kind: string; value: number }>('pr_wall'), []),
    safe(rpcRows<{ first_name: string; last_initial: string; score: number }>('season_board'), []),
    safe(rpcRows<{ squad_name: string; members: number; days: number; weekly_target: number; reached: boolean }>('squad_board'), []),
    safe(supabase.from('classes').select('id, name, scheduled_at, capacity').gte('scheduled_at', new Date().toISOString())
      .lte('scheduled_at', end).order('scheduled_at').limit(6)
      .then((r) => (r.error ? [] : (r.data ?? []) as { id: string; name: string; scheduled_at: string; capacity: number }[])), []),
    safe(listRecentBroadcasts(20), []),
  ]);

  // Spots left, from the same view the booking screens use.
  let booked = new Map<string, number>();
  if (classRows.length) {
    const { data } = await supabase.from('class_availability').select('class_id, booked_count')
      .in('class_id', classRows.map((c) => c.id));
    booked = new Map(((data ?? []) as { class_id: string; booked_count: number }[]).map((b) => [b.class_id, b.booked_count]));
  }

  const g = goalRows[0];
  // Only a real announcement: sent by the composer (one of its types) to more
  // than one person. listRecentBroadcasts groups *every* notification, and the
  // gym's automatic ones are personal — "New personal record", a referral, a
  // program assigned — each to one member. On a lobby screen they would read
  // somebody's private message to the room.
  const b = broadcasts.find((x) => x.recipients >= 2 && ['info', 'event', 'system', 'achievement'].includes(x.type));
  const fmtValue = (kind: string, v: number) => (kind === 'weight' ? `${Number(v)} kg` : `${Math.round(Number(v))} s`);
  return {
    app,
    checkinsToday: checkins,
    goal: g ? { title: g.title, metric: g.metric, target: g.target, progress: Number(g.progress),
      contributors: Number(g.contributors), reached: g.reached, rewardPoints: g.reward_points } : null,
    wall: wallRows.slice(0, 8).map((w) => ({ name: `${w.first_name} ${w.last_initial}.`, exercise: w.exercise_name, value: fmtValue(w.kind, w.value) })),
    season: seasonRows.slice(0, 8).map((s) => ({ name: `${s.first_name} ${s.last_initial}.`, score: Number(s.score) })),
    squads: squadRows.slice(0, 8).map((s) => ({ name: s.squad_name, members: s.members, days: Number(s.days), target: s.weekly_target, reached: s.reached })),
    classes: classRows.map((c) => ({ name: c.name, at: c.scheduled_at, booked: booked.get(c.id) ?? 0, capacity: c.capacity })),
    announcement: b ? { title: b.title, message: b.message, sentAt: b.sentAt } : null,
  };
}
