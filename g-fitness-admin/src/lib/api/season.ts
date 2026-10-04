import { supabase } from '../supabaseClient';
import { assertWrote } from './mutate';

/**
 * Seasons and personal records, from the gym's side (0123).
 *
 * The owner sets the season's tiers and what each gives; the desk hands the
 * rewards over and removes a record that is obviously not real. Claiming and
 * detecting are the database's (claim_season_reward, the workout_sets trigger).
 */

export interface TierRow { id: string; name: string; pointsNeeded: number; rewardId: string | null; rewardName: string | null }
export interface ClaimRow { id: string; memberName: string; tierName: string; rewardName: string | null; claimedAt: string }
export interface MemberRecord { id: string; exerciseName: string; kind: 'weight' | 'duration'; value: number; previous: number; achievedAt: string }

const clean = (m: string) => m.replace(/^.*?: /, '');

/** Null before 0123 is pasted. */
export async function listTiers(): Promise<TierRow[] | null> {
  const { data, error } = await supabase.from('season_tiers')
    .select('id, name, points_needed, reward_id, rewards (name)').order('points_needed');
  if (error) return null;
  return ((data ?? []) as unknown as { id: string; name: string; points_needed: number; reward_id: string | null;
    rewards: { name: string } | null }[]).map((t) => ({
    id: t.id, name: t.name, pointsNeeded: t.points_needed, rewardId: t.reward_id, rewardName: t.rewards?.name ?? null,
  }));
}

export async function addTier(name: string, pointsNeeded: number, rewardId: string | null): Promise<void> {
  const { error } = await supabase.from('season_tiers')
    .insert({ name: name.trim(), points_needed: pointsNeeded, reward_id: rewardId });
  if (error) throw new Error(error.message);
}

export async function updateTier(id: string, patch: { name?: string; pointsNeeded?: number; rewardId?: string | null }): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name.trim();
  if (patch.pointsNeeded !== undefined) row.points_needed = patch.pointsNeeded;
  if (patch.rewardId !== undefined) row.reward_id = patch.rewardId;
  const { data, error } = await supabase.from('season_tiers').update(row).eq('id', id).select('id');
  if (error) throw new Error(error.message);
  assertWrote(data, 'That tier could not be changed.');
}

export interface SeasonOverview {
  seasonStart: string; seasonEnd: string; members: number; scoring: number;
  tiers: { id: string; name: string; pointsNeeded: number; reward: string | null; reached: number; claimed: number; handedOver: number }[];
  top: { memberId: string; name: string; score: number }[];
}

/** This month as the owner and desk see it (0159). Null before 0159 is pasted, or for a member. */
export async function seasonOverview(): Promise<SeasonOverview | null> {
  const { data, error } = await supabase.rpc('season_overview');
  if (error || !data) return null;
  const d = data as { season_start: string; season_end: string; members: number; scoring: number;
    tiers: { id: string; name: string; points_needed: number; reward: string | null; reached: number; claimed: number; handed_over: number }[];
    top: { member_id: string; name: string; score: number }[] };
  return {
    seasonStart: d.season_start, seasonEnd: d.season_end, members: Number(d.members), scoring: Number(d.scoring),
    tiers: d.tiers.map((t) => ({ id: t.id, name: t.name, pointsNeeded: t.points_needed, reward: t.reward,
      reached: Number(t.reached), claimed: Number(t.claimed), handedOver: Number(t.handed_over) })),
    top: d.top.map((t) => ({ memberId: t.member_id, name: t.name, score: Number(t.score) })),
  };
}

export async function deleteTier(id: string): Promise<void> {
  const { data, error } = await supabase.from('season_tiers').delete().eq('id', id).select('id');
  if (error) throw new Error(error.message);
  assertWrote(data, 'That tier could not be removed.');
}

export async function openClaims(): Promise<ClaimRow[] | null> {
  const { data, error } = await supabase.rpc('open_season_claims');
  if (error) return null;
  return ((data ?? []) as { id: string; member_name: string; tier_name: string; reward_name: string | null;
    claimed_at: string }[]).map((c) => ({
    id: c.id, memberName: c.member_name, tierName: c.tier_name, rewardName: c.reward_name, claimedAt: c.claimed_at,
  }));
}

export async function handOver(claimId: string): Promise<void> {
  const { error } = await supabase.rpc('hand_over_season_claim', { p_claim: claimId });
  if (error) throw new Error(clean(error.message));
}

export async function memberRecords(memberId: string): Promise<MemberRecord[] | null> {
  const { data, error } = await supabase.rpc('member_personal_records', { p_member: memberId });
  if (error) return null;
  return ((data ?? []) as { id: string; exercise_name: string; kind: 'weight' | 'duration'; value: number;
    previous: number; achieved_at: string }[]).map((r) => ({
    id: r.id, exerciseName: r.exercise_name, kind: r.kind, value: Number(r.value), previous: Number(r.previous),
    achievedAt: r.achieved_at,
  })).sort((a, b) => b.achievedAt.localeCompare(a.achievedAt));
}

export async function removeRecord(prId: string): Promise<void> {
  const { error } = await supabase.rpc('remove_personal_record', { p_pr: prId });
  if (error) throw new Error(clean(error.message));
}

export const recordValue = (kind: 'weight' | 'duration', v: number) =>
  kind === 'weight' ? `${Number.isInteger(v) ? v : v.toFixed(1)} kg` : `${Math.round(v)} s`;
