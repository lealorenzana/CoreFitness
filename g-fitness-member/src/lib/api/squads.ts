import { supabase } from '../supabaseClient';

/**
 * Squads and the gym-wide goal (0124).
 *
 * A squad is two to five friends joined by a code; its week counts training
 * days (check-ins and logged workouts), and reaching its target pays everyone in
 * it once. The gym goal is one shared target; everyone who contributed is paid
 * when it is reached. All of it is decided in SQL — this module asks and reads.
 *
 * The sweeps run when these screens load (pg_cron is optional here), so a
 * squad that hit its target, or a goal that was reached, pays the next time
 * anyone in the gym opens one.
 */

export interface SquadMember { memberId: string; firstName: string; days: number; isMe: boolean }
export interface MySquad { id: string; name: string; code: string; target: number; days: number; members: SquadMember[] }
export interface SquadBoardRow { name: string; members: number; days: number; target: number; reached: boolean; isMine: boolean }
export interface GymGoal {
  id: string; title: string; metric: 'training_days' | 'workouts_logged' | 'checkins'; target: number;
  startsOn: string; endsOn: string; rewardPoints: number; reached: boolean; progress: number;
  contributors: number; mine: number;
}
export interface MemberSquad { name: string; members: number; days: number; target: number; memberDays: number }

const clean = (m: string) => m.replace(/^.*?: /, '');

/** Pays anything now due. Never throws — a failed sweep is retried next open. */
export async function settleSquadsAndGoals(): Promise<void> {
  await Promise.all([
    supabase.rpc('settle_squads').then(() => undefined, () => undefined),
    supabase.rpc('settle_gym_goals').then(() => undefined, () => undefined),
  ]);
}

/** undefined = 0124 not live; null = not in a squad. */
export async function mySquad(): Promise<MySquad | null | undefined> {
  const { data, error } = await supabase.rpc('my_squad');
  if (error) return undefined;
  const rows = (data ?? []) as { squad_id: string; squad_name: string; code: string; weekly_target: number;
    squad_days: number; member_id: string; first_name: string; days_this_week: number; is_me: boolean }[];
  if (rows.length === 0) return null;
  return {
    id: rows[0].squad_id, name: rows[0].squad_name, code: rows[0].code, target: rows[0].weekly_target,
    days: Number(rows[0].squad_days),
    members: rows.map((r) => ({ memberId: r.member_id, firstName: r.first_name, days: Number(r.days_this_week), isMe: r.is_me })),
  };
}

export async function createSquad(name: string, target: number): Promise<void> {
  const { error } = await supabase.rpc('create_squad', { p_name: name.trim(), p_target: target });
  if (error) throw new Error(/squads_name_per_gym|duplicate/i.test(error.message)
    ? 'A squad here already has that name.' : clean(error.message));
}

export async function joinSquad(code: string): Promise<void> {
  const { error } = await supabase.rpc('join_squad', { p_code: code.trim() });
  if (error) throw new Error(clean(error.message));
}

export async function leaveSquad(): Promise<void> {
  const { error } = await supabase.rpc('leave_squad');
  if (error) throw new Error(clean(error.message));
}

export async function squadBoard(): Promise<SquadBoardRow[]> {
  const { data, error } = await supabase.rpc('squad_board');
  if (error) return [];
  return ((data ?? []) as { squad_name: string; members: number; days: number; weekly_target: number;
    reached: boolean; is_mine: boolean }[]).map((r) => ({
    name: r.squad_name, members: r.members, days: Number(r.days), target: r.weekly_target,
    reached: r.reached, isMine: r.is_mine,
  }));
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

/** A member's squad for their coach (0124: own trainees only). */
export async function memberSquad(memberId: string): Promise<MemberSquad | null> {
  const { data, error } = await supabase.rpc('member_squad', { p_member: memberId });
  if (error || !Array.isArray(data) || !data[0]) return null;
  const r = data[0] as { squad_name: string; members: number; squad_days: number; weekly_target: number; member_days: number };
  return { name: r.squad_name, members: r.members, days: Number(r.squad_days), target: r.weekly_target, memberDays: Number(r.member_days) };
}

export const GOAL_UNIT: Record<GymGoal['metric'], string> = {
  training_days: 'training days', workouts_logged: 'workouts', checkins: 'check-ins',
};
