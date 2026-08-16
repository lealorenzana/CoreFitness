import type { ClassTemplateRow } from '../lib/api/classTemplates';
import type { TrainerAvailabilityRow } from '../lib/api/trainerAvailability';
import { listClasses } from '../lib/api/classes';
import { listClassAvailability } from '../lib/api/directory';
import type { ClassRow } from '../types/db';

/**
 * Timetable clash detection and the plan-vs-reality view.
 *
 * The timetable page could add a class but never told you when the plan was
 * impossible: nothing stopped one trainer being scheduled to teach two classes
 * at the same hour, or two classes being put in the same room at once. Both
 * generate real `classes` rows that members can then book.
 */

export type ConflictKind = 'trainer' | 'location' | 'hours';

export interface Conflict {
  kind: ConflictKind;
  /** The two template ids involved, sorted so a pair is reported once. */
  a: string;
  b: string;
  message: string;
}

/** 'HH:MM:SS' → minutes past midnight. */
function minutes(hhmmss: string): number {
  const [h, m] = hhmmss.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function timeLabel(hhmmss: string): string {
  const [h, m] = hhmmss.split(':').map(Number);
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m ?? 0).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/**
 * Every clash on the weekly plan.
 *
 * Retired templates are ignored — they generate nothing, so they cannot clash
 * with anything. Location matching is case- and space-insensitive, because
 * "Studio A" and "studio a" are one room.
 */
export function findConflicts(templates: ClassTemplateRow[]): Conflict[] {
  const active = templates.filter((t) => t.active);
  const found: Conflict[] = [];

  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i];
      const b = active[j];
      if (a.day_of_week !== b.day_of_week) continue;

      const aStart = minutes(a.start_time);
      const bStart = minutes(b.start_time);
      if (!overlaps(aStart, aStart + a.duration_minutes, bStart, bStart + b.duration_minutes)) continue;

      if (a.trainer_id && a.trainer_id === b.trainer_id) {
        found.push({
          kind: 'trainer',
          a: a.id, b: b.id,
          message: `Same trainer is on "${a.name}" (${timeLabel(a.start_time)}) and "${b.name}" (${timeLabel(b.start_time)}) at the same time.`,
        });
      }

      const roomA = a.location?.trim().toLowerCase();
      const roomB = b.location?.trim().toLowerCase();
      if (roomA && roomA === roomB) {
        found.push({
          kind: 'location',
          a: a.id, b: b.id,
          message: `"${a.name}" and "${b.name}" are both in ${a.location} at the same time.`,
        });
      }
    }
  }
  return found;
}

/**
 * Classes scheduled outside the gym's own opening hours.
 *
 * This is what makes `gym_settings.opening_time` / `closing_time` mean anything.
 * Settings has collected both since 0013 and **nothing read either of them** —
 * the gym could set 6am–9pm and still put a class at 4am with no complaint.
 *
 * Returns [] when either bound is unset, rather than assuming a default day: a
 * gym that hasn't told us its hours has not thereby agreed to 9-to-5.
 */
export function findOutOfHours(
  templates: ClassTemplateRow[],
  openingTime: string | null,
  closingTime: string | null
): Conflict[] {
  if (!openingTime || !closingTime) return [];
  const open = minutes(openingTime);
  const close = minutes(closingTime);
  if (close <= open) return [];

  return templates
    .filter((t) => t.active)
    .filter((t) => {
      const start = minutes(t.start_time);
      return start < open || start + t.duration_minutes > close;
    })
    .map((t) => ({
      kind: 'hours' as const,
      a: t.id,
      b: t.id,
      message: `"${t.name}" starts ${timeLabel(t.start_time)}, outside the gym's hours (${timeLabel(openingTime)}–${timeLabel(closingTime)}).`,
    }));
}

/** Ids of every template caught in at least one clash, for flagging in the grid. */
export function conflictedIds(conflicts: Conflict[]): Set<string> {
  const set = new Set<string>();
  for (const c of conflicts) { set.add(c.a); set.add(c.b); }
  return set;
}

/**
 * A trainer's hours are one window per row, and nothing stopped two rows for the
 * same day overlapping — which would offer the same PT slot twice.
 */
export function hoursOverlap(
  existing: TrainerAvailabilityRow[],
  trainerId: string,
  dayOfWeek: number,
  start: string,
  end: string
): TrainerAvailabilityRow | null {
  const s = minutes(start);
  const e = minutes(end);
  return (
    existing.find(
      (a) =>
        a.trainer_id === trainerId &&
        a.day_of_week === dayOfWeek &&
        overlaps(s, e, minutes(a.start_time), minutes(a.end_time))
    ) ?? null
  );
}

export interface UpcomingSession {
  id: string;
  name: string;
  trainerId: string | null;
  startsAt: string;
  durationMinutes: number;
  location: string | null;
  capacity: number;
  /** Real signups from `class_availability` (0016), never a guess. */
  booked: number;
}

/**
 * The dated sessions the timetable has actually produced, with real headcounts.
 *
 * The page showed the recurring *plan* and nothing else, so there was no way to
 * see whether Saturday's class was full — that lived only in the member app.
 * Counts come from the `class_availability` view; a class missing from it is
 * reported as 0 booked rather than omitted, because the session still runs.
 */
export async function loadUpcomingSessions(daysAhead = 14): Promise<UpcomingSession[]> {
  const [classes, availability] = await Promise.all([
    listClasses().catch(() => [] as ClassRow[]),
    listClassAvailability().catch(() => []),
  ]);

  const bookedById = new Map<string, number>();
  for (const a of availability) bookedById.set(a.class_id, a.booked_count);

  const now = Date.now();
  const until = now + daysAhead * 86_400_000;

  return classes
    .filter((c) => {
      if (!c.scheduled_at) return false;
      const t = new Date(c.scheduled_at).getTime();
      return t >= now && t <= until;
    })
    .map((c) => ({
      id: c.id,
      name: c.name,
      trainerId: c.trainer_id,
      startsAt: c.scheduled_at!,
      durationMinutes: c.duration_minutes,
      location: c.location,
      capacity: c.capacity,
      booked: bookedById.get(c.id) ?? 0,
    }))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}
