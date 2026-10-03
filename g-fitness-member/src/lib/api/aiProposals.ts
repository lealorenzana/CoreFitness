import { supabase } from '../supabaseClient';
import { listExercises } from './workoutSets';
import { listRoutines } from './routines';

/**
 * The coach's proposals (0145).
 *
 * The coach can only propose: a routine, a weekly plan, a goal or a meal guide waits as a row
 * until the member taps Apply, and an applied change can be undone. Every rule —
 * whose it is, whether it is still waiting, whether a newer change is in the way —
 * is the database's, and its refusals are plain sentences meant to be shown as-is.
 */

export type ProposalKind = 'routine.create' | 'routine.replace' | 'schedule.set' | 'goal.create' | 'meals.set';
export type ProposalStatus = 'pending' | 'applied' | 'discarded' | 'undone';

export interface Proposal {
  id: string;
  kind: string;
  summary: string;
  payload: unknown;
  status: ProposalStatus;
  created_at: string;
  decided_at: string | null;
}

export interface RoutinePayload {
  name: string;
  notes?: string;
  routine_id?: string;
  exercises: {
    exercise_id?: string; custom_name?: string; target_sets: number; target_reps?: number;
    target_weight_kg?: number; target_seconds?: number; rest_seconds: number;
  }[];
}
export interface SchedulePayload { days: { day_of_week: number; routine_id?: string; remind_at?: string }[] }
export interface GoalPayload {
  title: string; metric: string; start_value?: number; target_value?: number; target_date?: string;
}

/** A meal guide (0146): sections of everyday meal ideas, portions by hand size, never numbers. */
export interface MealSection { title: string; items: string[] }
export interface MealsPayload { sections: MealSection[] }

/** Keeps only well-formed sections — a malformed row reads as no guide, never a guessed one. */
export function mealSections(v: unknown): MealSection[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((s): s is MealSection => !!s && typeof s === 'object' && typeof (s as MealSection).title === 'string'
      && Array.isArray((s as MealSection).items))
    .map((s) => ({ title: s.title, items: s.items.filter((i): i is string => typeof i === 'string') }));
}

/** The member's applied meal guide, or null when they have none (0146 `my_meal_guide`). */
export async function myMealGuide(): Promise<MealSection[] | null> {
  const { data, error } = await supabase.rpc('my_meal_guide');
  if (error) throw new Error(error.message);
  const sections = mealSections(data);
  return sections.length ? sections : null;
}

/**
 * One trainee's meal guide, for their trainer (0146 `trainee_meal_guide`): null
 * unless the caller trains them and they share their goals with trainers. The
 * desk and the owner always get null — the rule is the database's, not this screen's.
 */
export async function traineeMealGuide(memberId: string): Promise<MealSection[] | null> {
  const { data, error } = await supabase.rpc('trainee_meal_guide', { p_member: memberId });
  if (error) throw new Error(error.message);
  const sections = mealSections(data);
  return sections.length ? sections : null;
}

/** Every waiting proposal, and the last 30 days of decided ones, newest first. */
export async function listProposals(): Promise<Proposal[]> {
  const { data, error } = await supabase.rpc('my_ai_proposals');
  if (error) throw new Error(error.message);
  return ((data ?? []) as Proposal[])
    .map((p) => ({ ...p, decided_at: p.decided_at ?? null }))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function applyProposal(id: string): Promise<{ kind: string; routine_id?: string }> {
  const { data, error } = await supabase.rpc('apply_ai_proposal', { p_id: id });
  if (error) throw new Error(error.message);
  return (data ?? {}) as { kind: string; routine_id?: string };
}

export async function undoProposal(id: string): Promise<void> {
  const { error } = await supabase.rpc('undo_ai_proposal', { p_id: id });
  if (error) throw new Error(error.message);
}

export async function discardProposal(id: string): Promise<void> {
  const { error } = await supabase.rpc('discard_ai_proposal', { p_id: id });
  if (error) throw new Error(error.message);
}

/** What a card needs to name things: exercise and routine ids → names. */
export interface ProposalNames { exercises: Map<string, string>; routines: Map<string, string> }

export const NO_NAMES: ProposalNames = { exercises: new Map(), routines: new Map() };

/**
 * Names for the ids a proposal carries. Either read failing leaves its map empty,
 * so a card says "an exercise" or "a routine" — never a guessed name.
 */
export async function loadProposalNames(memberId: string | null): Promise<ProposalNames> {
  const [ex, rs] = await Promise.all([
    listExercises().catch(() => []),
    memberId ? listRoutines(memberId).catch(() => []) : Promise.resolve([]),
  ]);
  return {
    exercises: new Map(ex.map((e) => [e.id, e.name])),
    routines: new Map(rs.map((r) => [r.id, r.name])),
  };
}
