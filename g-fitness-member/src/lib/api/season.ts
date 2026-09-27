import { supabase } from '../supabaseClient';

/**
 * Personal records, the monthly season and the opt-in boards (0123).
 *
 * Everything here is read or asked for, never decided: the database detects a
 * PR (a trigger on workout_sets), totals the season from the points ledger,
 * and refuses a claim below its tier. The screen shows what it is told.
 *
 * The boards show only members who opted in (`show_on_boards`, off by default).
 * A member's own rank is theirs whether or not they are on the board.
 */

export interface Season { start: string; end: string; score: number; rank: number | null; ranked: number }
export interface Tier { id: string; name: string; pointsNeeded: number; rewardName: string | null }
export interface BoardRow { firstName: string; lastInitial: string; score: number; isMe: boolean }
export interface WallRow { firstName: string; lastInitial: string; exerciseName: string; kind: 'weight' | 'duration'; value: number; achievedAt: string }
export interface Record_ { id: string; exerciseName: string; kind: 'weight' | 'duration'; value: number; previous: number; achievedAt: string }

const clean = (m: string) => m.replace(/^.*?: /, '');

/** Null before 0123 is pasted — the page then says so rather than showing zeros. */
export async function mySeason(): Promise<Season | null> {
  const { data, error } = await supabase.rpc('my_season');
  if (error || !Array.isArray(data) || !data[0]) return null;
  const r = data[0] as { season_start: string; season_end: string; score: number; rank: number | null; members_ranked: number };
  return { start: r.season_start, end: r.season_end, score: Number(r.score), rank: r.rank, ranked: r.members_ranked };
}

export async function seasonTiers(): Promise<Tier[]> {
  const { data, error } = await supabase.from('season_tiers')
    .select('id, name, points_needed, rewards (name)').order('points_needed');
  if (error) return [];
  return ((data ?? []) as unknown as { id: string; name: string; points_needed: number; rewards: { name: string } | null }[])
    .map((t) => ({ id: t.id, name: t.name, pointsNeeded: t.points_needed, rewardName: t.rewards?.name ?? null }));
}

/** Tier ids claimed this season, with whether the desk has handed them over. */
export async function myClaims(seasonStart: string): Promise<Map<string, boolean>> {
  const { data, error } = await supabase.from('season_claims')
    .select('tier_id, handed_over_at').eq('season_start', seasonStart);
  if (error) return new Map();
  return new Map(((data ?? []) as { tier_id: string; handed_over_at: string | null }[])
    .map((c) => [c.tier_id, c.handed_over_at != null]));
}

export async function claimTier(tierId: string): Promise<void> {
  const { error } = await supabase.rpc('claim_season_reward', { p_tier: tierId });
  if (error) throw new Error(clean(error.message));
}

export async function seasonBoard(): Promise<BoardRow[]> {
  const { data, error } = await supabase.rpc('season_board');
  if (error) return [];
  return ((data ?? []) as { first_name: string; last_initial: string; score: number; is_me: boolean }[])
    .map((b) => ({ firstName: b.first_name, lastInitial: b.last_initial, score: Number(b.score), isMe: b.is_me }));
}

export async function prWall(): Promise<WallRow[]> {
  const { data, error } = await supabase.rpc('pr_wall');
  if (error) return [];
  return ((data ?? []) as { first_name: string; last_initial: string; exercise_name: string; kind: 'weight' | 'duration';
    value: number; achieved_at: string }[]).map((w) => ({
    firstName: w.first_name, lastInitial: w.last_initial, exerciseName: w.exercise_name, kind: w.kind,
    value: Number(w.value), achievedAt: w.achieved_at,
  }));
}

export async function personalRecords(memberId: string): Promise<Record_[] | null> {
  const { data, error } = await supabase.rpc('member_personal_records', { p_member: memberId });
  if (error) return null;
  return ((data ?? []) as { id: string; exercise_name: string; kind: 'weight' | 'duration'; value: number;
    previous: number; achieved_at: string }[]).map((r) => ({
    id: r.id, exerciseName: r.exercise_name, kind: r.kind, value: Number(r.value), previous: Number(r.previous),
    achievedAt: r.achieved_at,
  })).sort((a, b) => b.achievedAt.localeCompare(a.achievedAt));
}

/** Whether a set just logged came back as a record — the player's celebration. */
export async function setWasRecord(setId: string): Promise<boolean> {
  const { data, error } = await supabase.from('personal_records').select('id').eq('set_id', setId).limit(1);
  return !error && (data ?? []).length > 0;
}

export async function getShowOnBoards(memberId: string): Promise<boolean | null> {
  const { data, error } = await supabase.from('member_profiles').select('show_on_boards')
    .eq('profile_id', memberId).maybeSingle();
  if (error || !data) return null;
  return !!(data as { show_on_boards: boolean }).show_on_boards;
}

export async function setShowOnBoards(on: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_show_on_boards', { p_on: on });
  if (error) throw new Error(clean(error.message));
}

export const recordValue = (kind: 'weight' | 'duration', v: number) =>
  kind === 'weight' ? `${Number.isInteger(v) ? v : v.toFixed(1)} kg` : `${Math.round(v)} s`;
