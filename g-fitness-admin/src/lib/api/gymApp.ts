import { supabase } from '../supabaseClient';

/**
 * What this gym's own app looks like, says and does (0110).
 *
 * Three separate decisions live behind these calls, and the screen must keep
 * them separate because the honest sentence differs:
 *
 *   'not_sold'  the gym's Core Fitness plan does not include it. Only the
 *               platform can change that, so no switch is offered.
 *   'off'       the gym has switched it off. Their switch, their choice.
 *   'on'        the gym runs it.
 *
 * A member's own membership plan is a fourth, separate thing (0049) and is not
 * touched here: that one locks and explains, because a member can upgrade.
 *
 * Before 0110 is pasted every call here fails; callers render nothing and the
 * app behaves as it did. Same pattern as every other unpasted migration.
 */

export type ModuleState = 'on' | 'off' | 'not_sold';

export interface GymModule {
  feature_key: string;
  label: string;
  description: string;
  state: ModuleState;
  enabled: boolean;
  sort_order: number;
}

export interface GymWords {
  points_name: string;
  points_name_short: string;
  welcome_message: string | null;
}

export type JoinPolicy = 'open' | 'code' | 'closed';

export interface GymApp {
  gym_id: string;
  gym_name: string;
  slug: string;
  short_name: string | null;
  logo_url: string | null;
  accent: string;
  points_name: string;
  points_name_short: string;
  welcome_message: string | null;
  join_policy: JoinPolicy;
  /** Only the gym's own desk sees this; it is null for a member. */
  join_code: string | null;
  /** feature_key → whether this gym runs it. */
  modules: Record<string, boolean>;
}

export async function getGymApp(): Promise<GymApp | null> {
  const { data, error } = await supabase.rpc('my_gym_app');
  if (error || !Array.isArray(data)) return null;
  return (data[0] as GymApp) ?? null;
}

export async function getGymModules(): Promise<GymModule[]> {
  const { data, error } = await supabase.rpc('my_gym_modules');
  if (error || !Array.isArray(data)) return [];
  return data as GymModule[];
}

export async function setGymModule(feature: string, enabled: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_gym_module', { p_feature: feature, p_enabled: enabled });
  if (error) throw new Error(error.message);
}

export async function saveGymWords(w: {
  points_name: string; points_name_short: string | null; welcome_message: string | null;
}): Promise<void> {
  const { error } = await supabase.rpc('save_gym_words', {
    p_points_name: w.points_name,
    p_points_short: w.points_name_short,
    p_welcome: w.welcome_message,
  });
  if (error) throw new Error(error.message);
}

/** Returns the join code, which is regenerated when `newCode` is true. */
export async function setJoinPolicy(policy: JoinPolicy, newCode = false): Promise<string | null> {
  const { data, error } = await supabase.rpc('set_join_policy', {
    p_policy: policy, p_new_code: newCode,
  });
  if (error) throw new Error(error.message);
  return (data as string) ?? null;
}

/**
 * Where the owner got to in setup (0111). The data itself is already saved step
 * by step, so this is only the bookmark — it stops moving once the gym is open.
 */
export async function setOnboardingStep(step: string): Promise<void> {
  const { error } = await supabase.rpc('set_onboarding_step', { p_step: step });
  // Deliberately swallowed: a bookmark that fails to save is not a reason to
  // stop someone setting their gym up. They land a step earlier next time.
  if (error && !/schema cache|does not exist/i.test(error.message)) {
    console.warn('Could not save the setup bookmark:', error.message);
  }
}
