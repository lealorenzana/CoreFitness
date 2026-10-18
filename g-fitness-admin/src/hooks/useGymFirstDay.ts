import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { getGymContext } from '../lib/gymContext';
import { localDateKey } from '../utils/dates';

/**
 * The gym's first day — how far back a history or report date picker reaches
 * (`mode="history"`, lib/dateRules.ts). Offering 2002 only invites an empty report.
 *
 * It is the EARLIEST of the gym's creation and its first records (first
 * check-in, first payment). It used to be the creation date alone, and a gym's
 * records can be older than its row: Gym #1 was re-created by tenancy (0097)
 * long after its history began, and a gym that brings its past along has the
 * same shape — so "Last 90 days" loaded July while the picker refused anything
 * before September (2026-10-18).
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
      const [gym, visit, pay] = await Promise.all([
        supabase.from('gyms').select('created_at').eq('id', ctx.gymId).maybeSingle(),
        supabase.from('attendance').select('check_in_time').order('check_in_time', { ascending: true }).limit(1).maybeSingle(),
        supabase.from('payments').select('paid_on').not('paid_on', 'is', null).order('paid_on', { ascending: true }).limit(1).maybeSingle(),
      ]);
      const days = [
        gym.data?.created_at ? localDateKey(gym.data.created_at as string) : null,
        visit.data?.check_in_time ? localDateKey(visit.data.check_in_time as string) : null,
        (pay.data?.paid_on as string | undefined) ?? null,
      ].filter((d): d is string => !!d);
      if (!days.length) return;
      cached = { gymId: ctx.gymId, day: days.sort()[0] };
      if (live) setDay(cached.day);
    })();
    return () => { live = false; };
  }, []);
  return day;
}
