import { useEffect, useState } from 'react';
import { getGymContext, type GymContext } from '../lib/gymContext';
import { applyAccent } from '../lib/gymTheme';

/**
 * The gym whose app this is: its colour on the screen, and whether it is
 * read-only right now.
 *
 * Mounted by both shells, so every screen inside them is already in the gym's
 * accent by first paint of the second frame. Before 0104 (or with no gym) the
 * context is null and nothing is applied — Core Fitness violet, as today.
 */
export function useGymBrand(): GymContext | null {
  const [ctx, setCtx] = useState<GymContext | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const c = await getGymContext();
      if (!active || !c) return;
      setCtx(c);
      // Both roles (0112): a gym that chose Rose used to get a red app with
      // amber buttons, which reads as the setting not having worked.
      applyAccent(c.accent, c.accentAction);
    })();
    return () => { active = false; };
  }, []);

  return ctx;
}
