import { supabase } from './supabaseClient';
import { clearMemberCaches } from './memberCaches';

/**
 * "Who am I, and where" — the gym this person is signed in to, their role and
 * status *there*, and its brand (0104's my_gym_context). Every gate reads this,
 * never the legacy profiles.role/status: one person can be a member at one gym
 * and a coach at another (docs/TENANCY.md).
 *
 * Before 0104 is pasted the function does not exist; the app then behaves as
 * it did before tenancy, from profiles, and says so (`legacy`). That is the
 * pattern every unpasted migration here follows, not a fallback identity: the
 * legacy columns are exactly right while there is one gym.
 *
 * Memory only, cleared in logout() and on a gym switch (CLAUDE.md: per-member
 * caches never live in localStorage).
 */
export type GymRole = 'admin' | 'staff' | 'trainer' | 'member';
export type GymStatus = 'active' | 'pending_approval' | 'suspended' | 'archived';

export interface GymContext {
  gymId: string | null;
  gymName: string | null;
  slug: string | null;
  role: GymRole | null;
  status: GymStatus | null;
  /** Set when the gym is read-only: 'suspended' or 'overdue'. */
  lockReason: 'suspended' | 'overdue' | null;
  shortName: string | null;
  logoUrl: string | null;
  accent: string;
  /** The gym's colour for "what you can do next" (0112). NULL keeps amber. */
  accentAction: string | null;
  /** Gyms this person belongs to (not archived). */
  gymCount: number;
  /** True when read from profiles because 0104 is not live yet. */
  legacy: boolean;
}

export interface MyGym {
  gym_id: string;
  name: string;
  slug: string;
  role: GymRole;
  status: GymStatus;
  /** 0116. Absent on a database without it, which renders a monogram. */
  short_name?: string | null;
  logo_url?: string | null;
  accent?: string | null;
}

let cached: Promise<GymContext | null> | null = null;

interface ContextRow {
  gym_id: string; gym_name: string; slug: string; role: GymRole; status: GymStatus;
  lock_reason: 'suspended' | 'overdue' | null; short_name: string | null; logo_url: string | null;
  accent: string | null; accent_action?: string | null; gym_count: number;
}

async function load(): Promise<GymContext | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  const { data, error } = await supabase.rpc('my_gym_context');
  if (!error && Array.isArray(data)) {
    const row = (data as ContextRow[])[0];
    if (!row) return null;   // signed in, but no gym: not a member anywhere
    return {
      gymId: row.gym_id, gymName: row.gym_name, slug: row.slug, role: row.role, status: row.status,
      lockReason: row.lock_reason, shortName: row.short_name, logoUrl: row.logo_url,
      accent: row.accent ?? 'violet', accentAction: row.accent_action ?? null, gymCount: row.gym_count ?? 1, legacy: false,
    };
  }

  // 0104 not pasted yet (or a fixture that predates it): today's single gym.
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, status')
    .eq('id', session.user.id)
    .maybeSingle();
  if (!profile) return null;
  return {
    gymId: null, gymName: null, slug: null,
    role: profile.role as GymRole, status: profile.status as GymStatus,
    lockReason: null, shortName: null, logoUrl: null, accent: 'violet', accentAction: null, gymCount: 1, legacy: true,
  };
}

/**
 * The gym to file a row under, or null before 0104. Writing it explicitly lets
 * an upsert name the per-gym key (0098) instead of the old per-person one.
 */
export async function currentGymId(): Promise<string | null> {
  return (await getGymContext())?.gymId ?? null;
}

/** The current gym context, read once per launch (or after a switch). */
export function getGymContext(force = false): Promise<GymContext | null> {
  if (force || !cached) cached = load().catch(() => null);
  return cached;
}

export function clearGymContext(): void {
  cached = null;
}

/** Every gym this person belongs to, for the picker. Empty before 0097/0104. */
export async function myGyms(): Promise<MyGym[]> {
  const { data, error } = await supabase.rpc('my_gyms');
  if (error || !Array.isArray(data)) return [];
  return data as MyGym[];
}

/** Gyms where this person can sign in right now. */
export const usableGyms = (gyms: MyGym[]) => gyms.filter((g) => g.status === 'active');

/**
 * Make another gym the current one. The whole app reloads onto it: every
 * screen's memory cache belongs to the gym it was read in, and a reload is the
 * one way to be sure none of them survives the switch.
 */
export async function switchGym(gymId: string, landing: string): Promise<void> {
  const { error } = await supabase.rpc('set_active_gym', { p_gym: gymId });
  if (error) throw new Error(error.message);
  clearGymContext();
  // Everything else the last gym cached. The `assign` below is a real
  // navigation and tears every module down, so this is not fixing a live leak
  // — it is making sure the reload is not the only thing preventing one. The
  // day this becomes a client-side transition to lose the white flash, a stale
  // `gymApp` would put the previous gym's logo (0116) and words (0114) on the
  // next gym's screens, and that would be found by a member, not by a test.
  clearMemberCaches();
  window.location.assign(landing);
}

/** Where a role lands in this app. Admin and staff work in the admin app. */
export function homeFor(role: GymRole | null): string | null {
  if (role === 'trainer') return '/trainer/home';
  if (role === 'member') return '/member/home';
  return null;
}
