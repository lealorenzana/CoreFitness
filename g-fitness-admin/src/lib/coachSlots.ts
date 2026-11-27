import type { TrainerAvailabilityRow } from './api/trainerAvailability';
import type { PtSessionRow } from './api/ptSessions';
import { localDateKey } from '../utils/dates';

export interface CoachSlot { at: string; minutes: number; free: boolean }

/**
 * A coach's 1-on-1 slots on a day: their hours, cut into slots, minus what is already asked for or booked, and
 * nothing already past. One place for it: Book for a member and the Schedule's open slots must agree, and the
 * slot's `at` (an ISO time) is how one hands a slot to the other.
 */
export function coachSlots(avail: TrainerAvailabilityRow[], pts: PtSessionRow[], coach: string, day: string, nowMs: number): CoachSlot[] {
  const [y, m, d] = day.split('-').map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  const taken = pts.filter((p) => p.trainer_id === coach && (p.status === 'pending' || p.status === 'approved') && localDateKey(p.starts_at) === day)
    .map((p) => [new Date(p.starts_at).getTime(), new Date(p.starts_at).getTime() + p.duration_minutes * 60000]);
  const out: CoachSlot[] = [];
  for (const a of avail.filter((x) => x.trainer_id === coach && x.day_of_week === dow)) {
    const [sh, sm] = a.start_time.split(':').map(Number); const [eh, em] = a.end_time.split(':').map(Number);
    for (let t = sh * 60 + sm; t + a.slot_minutes <= eh * 60 + em; t += a.slot_minutes) {
      const start = new Date(y, m - 1, d, Math.floor(t / 60), t % 60).getTime();
      const end = start + a.slot_minutes * 60000;
      if (start <= nowMs) continue;
      out.push({ at: new Date(start).toISOString(), minutes: a.slot_minutes, free: !taken.some(([s, e]) => s < end && start < e) });
    }
  }
  return out.sort((p, r) => p.at.localeCompare(r.at));
}
