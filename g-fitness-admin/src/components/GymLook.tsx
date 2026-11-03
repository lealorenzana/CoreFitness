import { useEffect } from 'react';
import { loadGymLook } from '../lib/gymLook';
import { loadColorMode } from '../lib/colorMode';

/** Puts the gym's look on the owner's app (lib/gymLook.ts), after the account's light/dark choice (0234). */
export default function GymLook() {
  useEffect(() => {
    let alive = true;
    // The account's light/dark choice first (0234), then the gym's look in matching shades.
    void loadColorMode().then(() => loadGymLook(() => alive));
    return () => { alive = false; };
  }, []);
  return null;
}
