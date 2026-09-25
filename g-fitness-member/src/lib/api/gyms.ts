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

/** Ask a gym to let you in. Their front desk approves it, as for a sign-up (0078). */
export async function requestToJoin(gymId: string): Promise<void> {
  const { error } = await supabase.rpc('request_to_join', { p_gym: gymId });
  if (error) throw new Error(error.message);
}
