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
}

export async function listGyms(search?: string): Promise<PublicGym[]> {
  const { data, error } = await supabase.rpc('list_gyms', { p_search: search?.trim() || null });
  if (error) throw new Error(error.message);
  return (data ?? []) as PublicGym[];
}

export async function gymBySlug(slug: string): Promise<PublicGym | null> {
  const all = await listGyms(slug);
  return all.find((g) => g.slug === slug) ?? null;
}

/** Ask a gym to let you in. Their front desk approves it, as for a sign-up (0078). */
export async function requestToJoin(gymId: string): Promise<void> {
  const { error } = await supabase.rpc('request_to_join', { p_gym: gymId });
  if (error) throw new Error(error.message);
}
