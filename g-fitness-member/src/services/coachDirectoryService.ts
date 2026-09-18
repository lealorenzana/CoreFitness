import { supabase } from '../lib/supabaseClient';
import { listPublicTrainers, trainerName, type BusySlot, type PublicTrainer } from '../lib/api/directory';
import { getRatingSummaries, type TrainerRatingSummary } from '../lib/api/trainerRatings';
import { listClasses } from '../lib/api/classes';
import { listAllAvailability, computeOpenSlots } from '../lib/api/trainerAvailability';
import { listMemberPtSessions } from '../lib/api/ptSessions';
import { listMemberBookings } from '../lib/api/bookings';
export { GOALS, goalMatches, goalScore, type Goal } from '../lib/coachGoals';

/**
 * The Coaches screen, assembled (reworked 2026-09-19).
 *
 * Everything here is read, not stored:
 *   next free   the first open 1-on-1 slot in 14 days — the same
 *               `computeOpenSlots` the booking screen uses, fed every PT
 *               session *and* class the coach has, so it never offers a time
 *               the booking screen would not
 *   yours       coaches you have had a 1-on-1 with, or a class they taught
 *   matches     your goal against the coach's own words — specialization, focus
 *               areas, certifications, bio. A keyword match, and the screen
 *               shows which words matched, so it never pretends to be more.
 */

export interface CoachCard {
  trainer: PublicTrainer;
  name: string;
  rating: TrainerRatingSummary | null;
  upcomingClasses: number;
  /** ISO start of the first open 1-on-1 slot, null when none in 14 days. */
  nextFree: string | null;
  /** False when their hours could not be read — not the same as "no time". */
  hoursKnown: boolean;
  yours: boolean;
  /** Last date you trained with them, for "Last session Sep 3". */
  lastWithYou: string | null;
}

async function listAllBusy(): Promise<BusySlot[]> {
  const { data, error } = await supabase.from('trainer_busy_slots').select('*');
  if (error) throw error;
  return data ?? [];
}

export async function loadCoachDirectory(memberId: string | null): Promise<CoachCard[]> {
  const [trainers, ratings, classes, availability, busy, pts, bookings] = await Promise.all([
    listPublicTrainers(),
    getRatingSummaries().catch(() => new Map<string, TrainerRatingSummary>()),
    listClasses().catch(() => []),
    listAllAvailability().catch(() => null),
    listAllBusy().catch(() => null),
    memberId ? listMemberPtSessions(memberId).catch(() => []) : Promise.resolve([]),
    memberId ? listMemberBookings(memberId).catch(() => []) : Promise.resolve([]),
  ]);

  const now = Date.now();
  // When you last trained with each coach: a 1-on-1 that was not turned down,
  // or a class of theirs you were in.
  const lastWith = new Map<string, string>();
  const note = (id: string | null | undefined, at: string | null | undefined) => {
    if (!id || !at || new Date(at).getTime() > now) return;
    if (!lastWith.has(id) || lastWith.get(id)! < at) lastWith.set(id, at);
  };
  for (const s of pts) if (s.status === 'approved') note(s.trainer_id, s.starts_at);
  for (const b of bookings) if (b.status === 'approved') note(b.classes?.trainer_id, b.classes?.scheduled_at);

  return trainers.map((t): CoachCard => {
    const theirClasses = classes.filter((c) => c.trainer_id === t.id && c.scheduled_at);
    let nextFree: string | null = null;
    if (availability && busy) {
      const slots = computeOpenSlots(
        availability.filter((a) => a.trainer_id === t.id),
        [
          ...busy.filter((b) => b.trainer_id === t.id).map((b) => ({ startsAt: b.starts_at, durationMinutes: b.duration_minutes })),
          ...theirClasses.map((c) => ({ startsAt: c.scheduled_at as string, durationMinutes: c.duration_minutes })),
        ],
        14,
      );
      nextFree = slots.map((s) => s.startsAt).sort()[0] ?? null;
    }
    return {
      trainer: t,
      name: trainerName(t),
      rating: ratings.get(t.id) ?? null,
      upcomingClasses: theirClasses.filter((c) => new Date(c.scheduled_at as string).getTime() > now).length,
      nextFree,
      hoursKnown: availability != null && busy != null,
      yours: lastWith.has(t.id),
      lastWithYou: lastWith.get(t.id) ?? null,
    };
  });
}

/** "Today 4:00 PM", "Tomorrow 9:00 AM", "Tue 9:00 AM", "Sep 30 9:00 AM". */
export function slotLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const day0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dayD = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((dayD - day0) / 86_400_000);
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const day = diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow'
    : diff < 7 ? d.toLocaleDateString('en-US', { weekday: 'short' })
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${day} ${time}`;
}
