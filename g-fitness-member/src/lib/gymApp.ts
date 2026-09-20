import { supabase } from './supabaseClient';

/**
 * This gym's own app: its words, and which parts of the system it runs (0110).
 *
 * **Three different questions decide whether a member sees something, and they
 * are not the same question:**
 *
 *   1. the gym's Core Fitness plan  (0108) — the gym was never sold it
 *   2. the gym's own choice         (0110) — the gym does not do it
 *   3. the member's membership plan (0049) — the member has not paid for it
 *
 * `my_gym_app()` folds 1 and 2 together into `modules`, because a member never
 * needs to know which of the two it was and can do nothing about either. Those
 * are **hidden**: a lock that will never open advertises something that does
 * not exist.
 *
 * The third stays exactly where it was, in `plan_allows()`, and still **locks
 * and explains** — because that one a member can actually change.
 *
 * **Never gate the free workout library with this** (0019, CLAUDE.md): it
 * exists for members who cannot pay, and no `module` is attached to it.
 *
 * Read once per launch and cached in memory only — cleared on logout and on a
 * gym switch, like every other per-member cache here.
 */

export type FeatureKey =
  | 'front_desk' | 'checkin' | 'classes' | 'coaching'
  | 'engagement' | 'progress' | 'assistant' | 'push' | 'analytics';

export interface GymApp {
  gymId: string;
  gymName: string;
  slug: string;
  shortName: string | null;
  logoUrl: string | null;
  accent: string;
  /** "CORE Points", "Iron Points", or plain "Points" for a gym that never renamed them. */
  pointsName: string;
  /** The same word mid-sentence: "you earned 20 points". */
  pointsNameShort: string;
  welcomeMessage: string | null;
  modules: Partial<Record<FeatureKey, boolean>>;
}

interface Row {
  gym_id: string; gym_name: string; slug: string;
  short_name: string | null; logo_url: string | null; accent: string | null;
  points_name: string | null; points_name_short: string | null;
  welcome_message: string | null;
  modules: Partial<Record<FeatureKey, boolean>> | null;
}

/**
 * What the app shows before 0110 is pasted, and if the call ever fails.
 *
 * Every module true, because that is exactly how the app behaved before this
 * existed — a failed read must never quietly take a working feature away. The
 * points word is the neutral one: showing another gym's word for them is the
 * bug this file exists to fix, so the fallback says "Points".
 */
const FALLBACK: Omit<GymApp, 'gymId' | 'gymName' | 'slug'> = {
  shortName: null, logoUrl: null, accent: 'violet',
  pointsName: 'Points', pointsNameShort: 'points', welcomeMessage: null,
  modules: {},
};

let cached: Promise<GymApp | null> | null = null;

async function load(): Promise<GymApp | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  const { data, error } = await supabase.rpc('my_gym_app');
  if (error || !Array.isArray(data) || !data[0]) return null;

  const row = data[0] as Row;
  return {
    gymId: row.gym_id,
    gymName: row.gym_name,
    slug: row.slug,
    shortName: row.short_name,
    logoUrl: row.logo_url,
    accent: row.accent ?? 'violet',
    pointsName: row.points_name || FALLBACK.pointsName,
    pointsNameShort: row.points_name_short || FALLBACK.pointsNameShort,
    welcomeMessage: row.welcome_message,
    modules: row.modules ?? {},
  };
}

export function getGymApp(force = false): Promise<GymApp | null> {
  if (force || !cached) cached = load().catch(() => null);
  return cached;
}

export function clearGymApp(): void {
  cached = null;
}

/**
 * Does this gym run this part of the system?
 *
 * Unknown answers TRUE. A missing key, an older database, a failed read — none
 * of those are a reason to take a working feature away from a member who had it
 * yesterday. Switching something *off* is always a deliberate row (0110).
 */
export function moduleOn(app: GymApp | null, key: FeatureKey | undefined): boolean {
  if (!key) return true;
  return app?.modules?.[key] ?? true;
}

/** The gym's word for its points, ready to drop into a sentence. */
export function pointsWord(app: GymApp | null, sentence = false): string {
  if (!app) return sentence ? 'points' : 'Points';
  return sentence ? app.pointsNameShort : app.pointsName;
}
