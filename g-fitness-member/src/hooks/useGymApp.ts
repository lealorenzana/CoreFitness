import { useEffect, useState } from 'react';
import { getGymApp, type GymApp } from '../lib/gymApp';

/**
 * This gym's words and shape, for any screen that draws them (0110).
 *
 * Starts as `null`, which every consumer must treat as "show everything and say
 * 'points'". That is not a placeholder — it is the correct answer for the one
 * frame before the read lands, for a database where 0110 is not pasted, and for
 * a read that fails. None of those are a reason to hide a feature a member had
 * yesterday.
 *
 * The underlying read is cached for the whole launch, so calling this hook on
 * ten screens is one request.
 */
export function useGymApp(): GymApp | null {
  const [app, setApp] = useState<GymApp | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const value = await getGymApp();
      if (alive) setApp(value);
    })();
    return () => { alive = false; };
  }, []);

  return app;
}
