import { useEffect, useState } from 'react';
import { getGymSettings } from '../lib/api/settings';

/**
 * The gym's name, logo and tagline — read once, shared by the whole shell.
 *
 * The sidebar hardcoded "CORE FITNESS", "ADMIN PANEL" and a logo file, and the
 * header hardcoded the name and location a second time. `gym_settings.gym_name`
 * had existed since 0013 and neither of them looked at it, so a gym that
 * renamed itself in Settings watched nothing happen anywhere.
 *
 * ## Why a module-level cache and not a context
 *
 * Two components need this and both mount once, at the top of the tree. A
 * context provider would be more ceremony for the same result, and a plain
 * fetch in each would run the same query twice on every page load. The cache is
 * module-scoped, so it also survives navigation without a refetch.
 *
 * ## Why the defaults live here and not in SQL
 *
 * NULL means "the gym has not chosen", and the answer to that is the bundled
 * artwork — a file this app ships. Defaulting the column to a path would put a
 * frontend asset path in the database, where nothing can check it still exists.
 */

export interface Branding {
  name: string;
  /** For the collapsed rail and anywhere the full name will not fit. */
  shortName: string;
  /** NULL hides the line entirely rather than printing an empty one. */
  tagline: string | null;
  logoUrl: string;
  address: string | null;
}

/** What every install looks like until an admin changes it. */
export const DEFAULT_BRANDING: Branding = {
  name: 'Core Fitness',
  shortName: 'CF',
  tagline: 'ADMIN PANEL',
  logoUrl: '/core-fitness-logo.png',
  address: null,
};

let cache: Branding | null = null;
/** Notified when Settings saves, so the shell updates without a reload. */
const listeners = new Set<(b: Branding) => void>();

/**
 * Initials from the gym's name, for the collapsed rail.
 *
 * "Core Fitness" -> "CF". A single word keeps its first two letters rather than
 * one, because a lone "C" in a 40px square reads as a bullet.
 */
function deriveShortName(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return DEFAULT_BRANDING.shortName;
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return words.slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

function toBranding(row: {
  gym_name?: string | null; short_name?: string | null;
  tagline?: string | null; logo_url?: string | null; address?: string | null;
} | null): Branding {
  const name = row?.gym_name?.trim() || DEFAULT_BRANDING.name;
  return {
    name,
    shortName: row?.short_name?.trim() || deriveShortName(name),
    // An explicitly blank tagline is a choice — "no second line" — and must not
    // fall back to "ADMIN PANEL". Only a missing row uses the default.
    tagline: row ? (row.tagline?.trim() || null) : DEFAULT_BRANDING.tagline,
    logoUrl: row?.logo_url?.trim() || DEFAULT_BRANDING.logoUrl,
    address: row?.address?.trim() || null,
  };
}

/** Called by Settings after a successful save, so the shell repaints at once. */
export function publishBranding(row: Parameters<typeof toBranding>[0]): void {
  cache = toBranding(row);
  for (const fn of listeners) fn(cache);
}

export function useBranding(): Branding {
  const [branding, setBranding] = useState<Branding>(cache ?? DEFAULT_BRANDING);

  useEffect(() => {
    listeners.add(setBranding);
    // Already fetched by the other consumer this page load — do not ask again.
    // No setState here: the lazy initialiser above already read the cache, and
    // calling it synchronously in an effect is the `set-state-in-effect`
    // cascade this codebase keeps shipping. Subscribing is enough — a later
    // save reaches this component through `publishBranding`.
    if (cache) return () => { listeners.delete(setBranding); };
    let alive = true;
    (async () => {
      // Falls back rather than throwing: a settings row that will not load must
      // not take the sidebar down with it. The gym gets its default branding
      // and every link still works.
      const row = await getGymSettings().catch(() => null);
      if (!alive) return;
      cache = toBranding(row as Parameters<typeof toBranding>[0]);
      setBranding(cache);
    })();
    return () => { alive = false; listeners.delete(setBranding); };
  }, []);

  return branding;
}
