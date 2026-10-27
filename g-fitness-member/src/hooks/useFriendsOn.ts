import { useEffect, useState } from 'react';
import { friendsOn } from '../lib/api/friends';
import { cachedFriendsOn, rememberFriendsOn } from '../lib/friendsGate';

/**
 * Is Friends switched on at this gym (0217, the owner's switch, off by
 * default)? Null while asking. Read once per session — the answer is cleared
 * with the member caches, so another gym or account asks again.
 */
export function useFriendsOn(): boolean | null {
  const [on, setOn] = useState<boolean | null>(() => cachedFriendsOn());
  useEffect(() => {
    if (on !== null) return;
    let alive = true;
    void (async () => {
      const v = await friendsOn().catch(() => false);
      rememberFriendsOn(v);
      if (alive) setOn(v);
    })();
    return () => { alive = false; };
  }, [on]);
  return on;
}
