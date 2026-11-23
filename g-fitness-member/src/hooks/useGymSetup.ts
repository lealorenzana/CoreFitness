import { useEffect, useMemo, useState } from 'react';
import { getGymSettings } from '../lib/api/settings';
import { moduleOn, type FeatureKey } from '../lib/gymApp';
import { toGymSetup, type GymSetup } from '../data/memberAssistant';
import { useGymApp } from './useGymApp';
import { useBookingModes } from './useBookingModes';

/** How this gym runs, for the assistant's answers: its settings, its switches and its booking modes. */
export function useGymSetup(): GymSetup | null {
  const app = useGymApp();
  const modes = useBookingModes();
  const [row, setRow] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    let alive = true;
    getGymSettings().then((r) => { if (alive) setRow(r as unknown as Record<string, unknown> | null); }).catch(() => undefined);
    return () => { alive = false; };
  }, []);
  return useMemo(() => toGymSetup(row, (k) => moduleOn(app, k as FeatureKey), modes), [row, app, modes]);
}
