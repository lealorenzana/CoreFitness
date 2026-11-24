import { supabase } from '../supabaseClient';

/**
 * The gym-wide goal (0124): one shared target; everyone who contributed is paid
 * when it is reached. All of it is decided in SQL; this module asks and reads.
 * The sweep runs when a screen loads (pg_cron is optional here).
 */

export interface GymGoal {
  id: string; title: string; metric: 'training_days' | 'workouts_logged' | 'checkins'; target: number;
  startsOn: string; endsOn: string; rewardPoints: number; reached: boolean; progress: number;
  contributors: number; mine: number;
}

/** Pays a goal now reached. Never throws: a failed sweep is retried next open. */
export async function settleGymGoals(): Promise<void> {
  await supabase.rpc('settle_gym_goals').then(() => undefined, () => undefined);
}

export async function currentGymGoal(): Promise<GymGoal | null> {
  const { data, error } = await supabase.rpc('current_gym_goal');
  if (error || !Array.isArray(data) || !data[0]) return null;
  const g = data[0] as { id: string; title: string; metric: GymGoal['metric']; target: number; starts_on: string;
    ends_on: string; reward_points: number; reached: boolean; progress: number; contributors: number; mine: number };
  return {
    id: g.id, title: g.title, metric: g.metric, target: g.target, startsOn: g.starts_on, endsOn: g.ends_on,
    rewardPoints: g.reward_points, reached: g.reached, progress: Number(g.progress),
    contributors: Number(g.contributors), mine: Number(g.mine),
  };
}

export const GOAL_UNIT: Record<GymGoal['metric'], string> = {
  training_days: 'training days', workouts_logged: 'workouts', checkins: 'check-ins',
};
