import { supabase } from '../supabaseClient';

/**
 * A trainer's bookable working hours (migration 0015).
 *
 * Replaces the comma-joined weekday string on `trainer_profiles.availability`,
 * which had no times and so could never generate a bookable slot. That column
 * still exists for display on screens that haven't moved over yet.
 */
export interface TrainerAvailabilityRow {
  id: string;
  trainer_id: string;
  /** 0 = Sunday … 6 = Saturday. */
  day_of_week: number;
  /** 'HH:MM:SS' */
  start_time: string;
  end_time: string;
  slot_minutes: number;
  created_at: string;
}

export interface OpenSlot {
  trainerId: string;
  /** ISO timestamp for the slot start. */
  startsAt: string;
  durationMinutes: number;
}

export async function listTrainerAvailability(trainerId: string): Promise<TrainerAvailabilityRow[]> {
  const { data, error } = await supabase
    .from('trainer_availability')
    .select('*')
    .eq('trainer_id', trainerId)
    .order('day_of_week', { ascending: true })
    .order('start_time', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function listAllAvailability(): Promise<TrainerAvailabilityRow[]> {
  const { data, error } = await supabase
    .from('trainer_availability')
    .select('*')
    .order('day_of_week', { ascending: true })
    .order('start_time', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function addAvailability(
  input: Omit<TrainerAvailabilityRow, 'id' | 'created_at'>
): Promise<TrainerAvailabilityRow> {
  const { data, error } = await supabase.from('trainer_availability').insert(input).select().single();
  if (error) throw error;
  return data;
}

export async function deleteAvailability(id: string): Promise<void> {
  const { error } = await supabase.from('trainer_availability').delete().eq('id', id);
  if (error) throw error;
}

function parseTime(hhmmss: string): { h: number; m: number } {
  const [h, m] = hhmmss.split(':').map(Number);
  return { h: h || 0, m: m || 0 };
}

/**
 * Expands availability windows into concrete bookable slots, minus anything the
 * trainer is already committed to.
 *
 * Computed client-side rather than stored: a slots table would need generating,
 * expiring and re-generating every time a trainer edits their hours, and would
 * drift out of sync with cancellations. Deriving them keeps one source of truth.
 *
 * `busy` should carry every commitment for the trainer in the window — PT
 * sessions *and* the classes they teach. Passing only one of the two is how you
 * end up double-booking a coach against their own group class.
 */
export function computeOpenSlots(
  availability: TrainerAvailabilityRow[],
  busy: { startsAt: string; durationMinutes: number }[],
  daysAhead = 14,
  now = new Date()
): OpenSlot[] {
  const slots: OpenSlot[] = [];
  const busyRanges = busy.map((b) => {
    const start = new Date(b.startsAt).getTime();
    return { start, end: start + b.durationMinutes * 60_000 };
  });

  for (let dayOffset = 0; dayOffset <= daysAhead; dayOffset++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset);
    const dow = day.getDay();

    for (const window of availability.filter((a) => a.day_of_week === dow)) {
      const from = parseTime(window.start_time);
      const to = parseTime(window.end_time);
      const windowStart = new Date(day);
      windowStart.setHours(from.h, from.m, 0, 0);
      const windowEnd = new Date(day);
      windowEnd.setHours(to.h, to.m, 0, 0);

      const step = window.slot_minutes * 60_000;
      for (let t = windowStart.getTime(); t + step <= windowEnd.getTime(); t += step) {
        // Never offer a slot in the past — a member tapping it would fail on
        // insert and look like a bug rather than a stale screen.
        if (t <= now.getTime()) continue;

        const overlaps = busyRanges.some((b) => t < b.end && t + step > b.start);
        if (overlaps) continue;

        slots.push({
          trainerId: window.trainer_id,
          startsAt: new Date(t).toISOString(),
          durationMinutes: window.slot_minutes,
        });
      }
    }
  }

  return slots.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}
