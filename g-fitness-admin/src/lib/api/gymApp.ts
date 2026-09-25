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

/**
 * What this gym calls its people and its sessions (0114).
 *
 * Always all six keys: `gym_vocabulary()` merges whatever the gym chose over
 * the English defaults, so nothing downstream has to know which were set. A
 * gym that never touched this reads exactly as every gym did before the column
 * existed.
 */
export interface GymVocabulary {
  member: string; members: string;
  trainer: string; trainers: string;
  class: string; classes: string;
}

export type JoinPolicy = 'open' | 'code' | 'closed';

export interface GymApp {
  accent_action: string | null;
  gym_id: string;
  gym_name: string;
  slug: string;
  short_name: string | null;
  logo_url: string | null;
  accent: string;
  points_name: string;
  points_name_short: string;
  welcome_message: string | null;
  tagline: string | null;
  vocabulary: GymVocabulary;
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

/**
 * Rename the nouns (0114). Returns the full set, defaults filled in.
 *
 * Send only what changed: a key left out is left alone, and a key sent blank
 * goes back to the English word. Typing the default back in is stored as
 * nothing, so "reset" and "never set" are one row rather than two states that
 * drift apart.
 */
export async function saveGymVocabulary(
  words: Partial<GymVocabulary>
): Promise<GymVocabulary> {
  const { data, error } = await supabase.rpc('save_gym_vocabulary', { p_words: words });
  if (error) throw new Error(error.message);
  return data as GymVocabulary;
}

/**
 * Move this gym's front door — the `/join/<slug>` every poster and every
 * invitation points at (0114).
 *
 * The old link stops working the moment this returns. That is a fact about
 * links rather than a setting, so the screen says it before the button, not
 * after; the gym's own activity log says it again afterwards.
 */
export async function setGymSlug(slug: string): Promise<string> {
  const { data, error } = await supabase.rpc('set_gym_slug', { p_slug: slug });
  if (error) throw new Error(error.message);
  return data as string;
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

/**
 * The gym's two colours and its logo, written together (0112).
 *
 * `accentAction` is "what you can do next" — book, renew, save, send. NULL
 * leaves it amber, which is what every gym had before the column existed.
 *
 * `logoUrl` distinguishes three things on purpose: `undefined` leaves the logo
 * alone (so saving a colour never wipes it), a URL sets it, and '' clears it.
 */
export async function saveGymLook(look: {
  accent: string; accentAction?: string | null; logoUrl?: string | null;
}): Promise<void> {
  const { error } = await supabase.rpc('save_gym_look', {
    p_accent: look.accent,
    p_accent_action: look.accentAction ?? null,
    p_logo_url: look.logoUrl === undefined ? null : look.logoUrl,
  });
  if (error) throw new Error(error.message);
}

// ---- letting Core Fitness look, on your terms (0113) --------------------------------

export interface SupportGrant {
  id: string;
  reason: string | null;
  expires_at: string;
  /** Stamped the first time support actually looked. NULL = offered, not used. */
  first_used_at: string | null;
  hours_left: string;
  granted_by_name: string | null;
}

/** The gym's own live grant, or null when it has not offered one. */
export async function getSupportGrant(): Promise<SupportGrant | null> {
  const { data, error } = await supabase.rpc('my_support_grant');
  if (error || !Array.isArray(data)) return null;
  return (data[0] as SupportGrant) ?? null;
}

/**
 * Let Core Fitness look at this gym for a while.
 *
 * Read-only for the whole window, and not by convention: `gym_writable()` is
 * false inside a support session, and all fifty-odd gym tables gate their
 * writes on it (0099). Revocable at any moment, and every visit is written
 * into this gym's own activity log.
 */
export async function grantSupportAccess(hours: number, reason: string | null): Promise<void> {
  const { error } = await supabase.rpc('grant_support_access', {
    p_hours: hours, p_reason: reason,
  });
  if (error) throw new Error(error.message);
}

export async function revokeSupportAccess(): Promise<void> {
  const { error } = await supabase.rpc('revoke_support_access');
  if (error) throw new Error(error.message);
}
