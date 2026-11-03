import { useEffect, useState } from 'react';
import { getGymContext, type GymContext } from '../lib/gymContext';
import { applyAccent } from '../lib/gymTheme';
import { applyPremiumTheme } from '../lib/premiumThemes';
import { loadColorMode } from '../lib/colorMode';
import { supabase } from '../lib/supabaseClient';

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
      // This account's light/dark choice (0234) — before the gym's colours, which follow the mode.
      await loadColorMode();
      const c = await getGymContext();
      if (!active || !c) return;
      setCtx(c);
      // Both roles (0112): a gym that chose Rose used to get a red app with
      // amber buttons, which reads as the setting not having worked.
      applyAccent(c.accent, c.accentAction);
      // Its premium theme (0233), when it bought one: the ground, surfaces and gradients. Before 0233, nothing.
      const { data } = await supabase.rpc('my_gym_premium_theme');
      if (active) applyPremiumTheme(typeof data === 'string' ? data : null);
    })();
    return () => { active = false; };
  }, []);

  return ctx;
}
