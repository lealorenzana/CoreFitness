import { useEffect, useState } from 'react';
import { getMyProfile } from '../lib/api/profiles';
import { readCache, writeCache } from '../lib/pageCache';

export interface MyIdentity {
  firstName: string;
  fullName: string;
  /** `profiles.photo_url`, or null — the avatar then falls back to initials. */
  photoUrl: string | null;
}

const KEY = 'member:identity';

/**
 * The signed-in member's name and photo, for the header avatar.
 *
 * Cached in the memory-only page cache (cleared by `logout()`), so switching tabs
 * never flashes initials over a photo — and re-read on every mount, so a photo
 * changed on Edit Profile shows as soon as the member comes back to a tab (the
 * header unmounts on pushed screens and mounts again on return).
 *
 * A failed read keeps whatever was cached; with nothing cached it stays null and
 * the header draws no name, never a placeholder one.
 */
export function useMyIdentity(): MyIdentity | null {
  const [me, setMe] = useState<MyIdentity | null>(() => readCache<MyIdentity>(KEY) ?? null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const p = await getMyProfile();
        if (!p || cancelled) return;
        setMe(writeCache<MyIdentity>(KEY, {
          firstName: p.first_name,
          fullName: `${p.first_name} ${p.last_name}`.trim(),
          photoUrl: p.photo_url ?? null,
        }));
      } catch {
        // Keep the cached identity; the next mount tries again.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return me;
}
