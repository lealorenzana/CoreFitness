import { supabase } from '../supabaseClient';

/**
 * How busy the gym is, by weekday and time band (0091 `gym_traffic`) — counts
 * only, never who. **The admin Dashboard's heatmap reads the same function**,
 * so both apps band traffic identically: 6am (<8), 9am (<11), 12pm (<14),
 * 3pm (<17), 6pm (<20), 9pm.
 */
export const BANDS = ['6am', '9am', '12pm', '3pm', '6pm', '9pm'] as const;
export type Band = (typeof BANDS)[number];

export const BAND_LABEL: Record<Band, string> = {
  '6am': 'Before 8 AM', '9am': '8–11 AM', '12pm': '11 AM–2 PM',
  '3pm': '2–5 PM', '6pm': '5–8 PM', '9pm': 'After 8 PM',
};

export interface TrafficCell { dow: number; band: Band; visits: number; weeks: number }

/** Null when it could not be read (or before 0091) — the card is then not drawn. */
export async function getGymTraffic(days = 30): Promise<TrafficCell[] | null> {
  const { data, error } = await supabase.rpc('gym_traffic', { p_days: days });
  if (error) return null;
  return ((data ?? []) as { dow: number; band: Band; visits: number; weeks: number }[]);
}
