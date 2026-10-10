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

/** A gym in the finder (0182): how it is joined and where it is. */
export interface FinderGym extends PublicGym {
  join_policy: 'open' | 'code' | 'closed';
  latitude: number | null;
  longitude: number | null;
  address: string | null;
}

/**
 * Every active gym for "Find your gym" (0182's `gym_finder`), so each row can
 * say what to do. Before 0182 it falls back to the listed gyms (all "open").
 */
export async function gymFinder(search?: string): Promise<FinderGym[]> {
  const { data, error } = await supabase.rpc('gym_finder', { p_search: search?.trim() || null });
  if (error) {
    const listed = await listGyms(search);
    return listed.map((g) => ({ ...g, join_policy: 'open', latitude: null, longitude: null, address: null }));
  }
  return ((data ?? []) as (PublicGym & { join_policy: string; latitude: number | string | null; longitude: number | string | null; address: string | null })[])
    .map((g) => ({
      ...g,
      join_policy: (['open', 'code', 'closed'].includes(g.join_policy) ? g.join_policy : 'open') as FinderGym['join_policy'],
      latitude: g.latitude == null ? null : Number(g.latitude),
      longitude: g.longitude == null ? null : Number(g.longitude),
    }));
}

/** A gym OpenStreetMap knows that is not on Core Fitness (0182). */
export interface OsmGym { osm_id: string; name: string | null; latitude: number; longitude: number; address: string | null }

/**
 * OpenStreetMap's gyms around a point, through the osm-gyms Edge Function,
 * which caches them by tile. Empty when the function is not deployed or
 * OpenStreetMap is busy — the finder still lists Core Fitness gyms.
 */
export async function osmGymsNear(lat: number, lng: number): Promise<OsmGym[]> {
  try {
    const { data, error } = await supabase.functions.invoke('osm-gyms', { body: { lat, lng } });
    if (error || !data?.gyms) return [];
    return (data.gyms as OsmGym[]).map((g) => ({ ...g, latitude: Number(g.latitude), longitude: Number(g.longitude) }));
  } catch {
    return [];
  }
}

export async function suggestGym(g: OsmGym, note?: string): Promise<void> {
  const { error } = await supabase.rpc('suggest_gym', {
    p_osm_id: g.osm_id, p_name: g.name ?? 'A gym', p_lat: g.latitude, p_lng: g.longitude, p_note: note ?? null,
  });
  if (error) throw new Error(error.message);
}

/** Straight-line distance in km — for sorting a list, not for directions. */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Directions in the phone's own maps app. */
export function directionsUrl(g: { latitude: number | null; longitude: number | null; name: string; address?: string | null }): string {
  return g.latitude != null && g.longitude != null
    ? `https://www.google.com/maps/dir/?api=1&destination=${g.latitude},${g.longitude}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([g.name, g.address].filter(Boolean).join(', '))}`;
}
