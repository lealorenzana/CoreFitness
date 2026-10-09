import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { getGymContext } from '../lib/gymContext';
import { localDateKey } from '../utils/dates';

/**
 * The gym's first day on the system — how far back a history or report date
 * picker reaches (`mode="history"`, lib/dateRules.ts). Nothing here happened
 * before it, so offering 2002 only invites an empty report.
 *
 * Module cache, cleared with the other per-gym caches in `adminCaches.ts`.
 * Undefined until read: the picker then falls back to five years back.
 */
let cached: { gymId: string; day: string } | null = null;

export function clearGymFirstDayCache(): void {
  cached = null;
}

export function useGymFirstDay(): string | undefined {
  const [day, setDay] = useState<string | undefined>(cached?.day);
  useEffect(() => {
    let live = true;
    void (async () => {
      const ctx = await getGymContext();
      if (!ctx?.gymId) return;
      if (cached?.gymId === ctx.gymId) { if (live) setDay(cached.day); return; }
      const { data } = await supabase.from('gyms').select('created_at').eq('id', ctx.gymId).maybeSingle();
      if (!data?.created_at) return;
      cached = { gymId: ctx.gymId, day: localDateKey(data.created_at as string) };
      if (live) setDay(cached.day);
    })();
    return () => { live = false; };
  }, []);
  return day;
}
