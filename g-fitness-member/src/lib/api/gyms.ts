import { supabase } from '../supabaseClient';

/**
 * The gyms on Core Fitness: the list people sign up into and join (0097/0098).
 *
 * `list_gyms()` is the one thing here anyone may call without signing in — the
 * sign-up screen needs it before an account exists. It returns active gyms and
 * public fields only.
 */
export interface PublicGym {
  id: string;
  slug: string;
  name: string;
  short_name: string | null;
  logo_url: string | null;
  accent: string | null;
  accent_action: string | null;
  /** The gym's own line about itself (0114). NULL renders nothing — never a
      stand-in sentence, which would be this app inventing a gym's pitch. */
  tagline: string | null;
}

export async function listGyms(search?: string): Promise<PublicGym[]> {
  const { data, error } = await supabase.rpc('list_gyms', { p_search: search?.trim() || null });
  if (error) throw new Error(error.message);
  return (data ?? []) as PublicGym[];
}

/**
 * The gym behind a `/join/<slug>` link.
 *
 * **Not `listGyms(slug)`.** That call returns only gyms whose joining rule is
 * 'open' (0110), so a gym that chose "only with your link or code" — the gyms
 * whose whole joining story *is* this link — was the one case it could never
 * find, and its own link showed "No gym by that name". `gym_by_slug()` exists
 * for exactly this and had never been wired to anything.
 *
 * Still refuses a gym that is not active, and still tells a stranger nothing
 * except name, logo, colours and tagline.
 */
export async function gymBySlug(slug: string): Promise<PublicGym | null> {
  const { data, error } = await supabase.rpc('gym_by_slug', { p_slug: slug.trim() });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as PublicGym[];
  return rows[0] ?? null;
}

/**
 * The text after `/join/` as somebody pasted it. A copied message used to put
 * "link, newline, Join code: ABC123" on the clipboard, and pasted into an
 * address bar that became `/join/my-gym%20Join%20code:%20ABC123` — no gym by
 * that name. The slug itself never holds a space, so everything from the first
 * one on is not part of it.
 */
export function cleanSlug(raw: string): string {
  let s = raw;
  try { s = decodeURIComponent(raw); } catch { /* already decoded */ }
  return s.trim().split(/\s+/)[0]?.replace(/[^a-zA-Z0-9-]/g, '').toLowerCase() ?? '';
}

/**
 * The gym behind a join code (0110's `gym_by_code`, never wired to a screen
 * until now). Answers for a gym that takes members "only with your link or
 * code", and never for one that signs members up only at the desk.
 */
export async function gymByCode(code: string): Promise<PublicGym | null> {
  const { data, error } = await supabase.rpc('gym_by_code', { p_code: code.trim() });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as PublicGym[];
  return rows[0] ?? null;
}

/** How a person found the gym — what 0179's joining rule is checked against. */
export type JoinVia = 'list' | 'link' | 'code';

export interface JoinRules {
  /** open = listed; code = link or code only; closed = front desk only. */
  policy: 'open' | 'code' | 'closed';
  /** Whether a sign-up is let in at once or waits for the desk. */
  approval: 'auto' | 'desk';
  minAge: number;
}

/**
 * A gym's joining rule, approval and minimum age (0179's `gym_join_rules`).
 * NULL before 0179 or for a gym not taking sign-ups — the screen then asks
 * nothing new, and the database still has the last word.
 */
export async function gymJoinRules(gymId: string): Promise<JoinRules | null> {
  const { data, error } = await supabase.rpc('gym_join_rules', { p_gym: gymId });
  if (error) return null;
  const row = (Array.isArray(data) ? data[0] : data) as { policy: string; approval: string; min_age: number } | undefined;
  if (!row) return null;
  return {
    policy: (['open', 'code', 'closed'].includes(row.policy) ? row.policy : 'open') as JoinRules['policy'],
    approval: row.approval === 'auto' ? 'auto' : 'desk',
    minAge: row.min_age ?? 16,
  };
}

/**
 * Ask a gym to let you in. The gym's rule decides (0179): 'auto' means you are
 * in now, 'desk' means the front desk approves it, as for a sign-up (0078).
 * Before 0179 only the one-argument call exists, and every join waits.
 */
export async function requestToJoin(gymId: string, via: JoinVia = 'list', code?: string | null, referral?: string | null): Promise<'auto' | 'desk'> {
  const { data, error } = await supabase.rpc('request_to_join', {
    p_gym: gymId, p_via: via, p_code: code ?? null, p_referral: referral ?? null,
  });
  if (!error) return data === 'auto' ? 'auto' : 'desk';
  if (error.code !== 'PGRST202') throw new Error(error.message);
  const old = await supabase.rpc('request_to_join', { p_gym: gymId });
  if (old.error) throw new Error(old.error.message);
  return 'desk';
}
