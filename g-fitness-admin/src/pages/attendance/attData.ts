import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { todayKey } from '../../utils/dates';

/** Data helpers the three Attendance pages share (apart from parts.tsx, so that file stays components-only). */

/** Today's check-ins and walk-ins, for the tab counts. Null until read; a failed read shows no count. */
export function useAttCounts(): { today: number | null; walkIns: number | null } {
  const [c, setC] = useState<{ today: number | null; walkIns: number | null }>({ today: null, walkIns: null });
  useEffect(() => {
    let live = true;
    void (async () => {
      const start = new Date(`${todayKey()}T00:00:00+08:00`).toISOString();
      const [a, w] = await Promise.all([
        supabase.from('attendance').select('id', { count: 'exact', head: true }).gte('check_in_time', start),
        supabase.rpc('guest_visits_on', { p_day: todayKey() }),
      ]);
      if (!live) return;
      setC({
        today: a.error ? null : (a.count ?? 0),
        walkIns: w.error ? null : ((w.data ?? []) as { voided: boolean }[]).filter((v) => !v.voided).length,
      });
    })();
    return () => { live = false; };
  }, []);
  return c;
}

export const peso = (n: number) => `₱${n.toLocaleString('en-PH', { maximumFractionDigits: 2 })}`;
export const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }).toLowerCase();
