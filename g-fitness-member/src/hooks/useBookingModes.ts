import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export type BookingMode = 'instant' | 'coach' | 'desk' | 'coach_desk' | 'off';
export interface BookingModes { classMode: BookingMode; ptMode: BookingMode }

/**
 * The gym's booking switches (0180's my_booking_modes(); set by the owner, or by their gym style, 0256).
 * 'off' means the gym books that kind at the front desk — the database refuses a member's own booking — so the
 * app must not offer it: no Book buttons, and the pages say where to book instead (a rule enforced only in SQL
 * ambushes the member, CLAUDE.md). Null until read, and when it cannot be read: then nothing is hidden and the
 * database's own refusal still explains itself.
 */
let cached: BookingModes | null = null;
let inFlight: Promise<BookingModes | null> | null = null;
const listeners = new Set<(m: BookingModes | null) => void>();

async function read(): Promise<BookingModes | null> {
  const { data, error } = await supabase.rpc('my_booking_modes');
  const row = (Array.isArray(data) ? data[0] : data) as { class_mode?: BookingMode; pt_mode?: BookingMode } | null;
  if (error || !row?.class_mode || !row.pt_mode) return null;
  return { classMode: row.class_mode, ptMode: row.pt_mode };
}

export function useBookingModes(): BookingModes | null {
  const [modes, setModes] = useState<BookingModes | null>(cached);
  useEffect(() => {
    listeners.add(setModes);
    if (!cached) {
      inFlight ??= read().then((m) => { cached = m; inFlight = null; listeners.forEach((fn) => fn(m)); return m; });
    }
    return () => { listeners.delete(setModes); };
  }, []);
  return modes;
}

/** Cleared with the other per-member memory (lib/memberCaches.ts). */
export function clearBookingModes(): void { cached = null; inFlight = null; }
