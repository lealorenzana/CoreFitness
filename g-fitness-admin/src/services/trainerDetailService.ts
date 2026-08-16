import { getTrainer, type TrainerWithProfile } from '../lib/api/trainers';
import { listTrainerClasses } from '../lib/api/classes';
import { listTrainerBookings, type BookingWithDetails } from '../lib/api/bookings';
import { listTrainerPtSessions, type PtSessionRow } from '../lib/api/ptSessions';
import { listTrainerAvailability, type TrainerAvailabilityRow } from '../lib/api/trainerAvailability';
import { memberNameMap } from '../lib/api/profiles';
import type { ClassRow } from '../types/db';

/**
 * Everything the gym knows about one trainer, assembled from five tables.
 *
 * The Trainers page previously showed a name, a specialization, an email and a
 * comma-separated list of weekday names — nothing about what the trainer
 * actually does here. None of their classes, none of their sessions, none of
 * the members they work with.
 */

/** A member this trainer has worked with, and how. */
export interface TrainerClient {
  memberId: string;
  name: string;
  ptSessions: number;
  classBookings: number;
  /** Most recent session or booking, ISO. Null if every date is unknown. */
  lastSeen: string | null;
}

export interface TrainerDetail {
  identity: TrainerWithProfile;
  classes: ClassRow[];
  /** Bookings for the classes this trainer teaches. */
  bookings: BookingWithDetails[];
  ptSessions: PtSessionRow[];
  /**
   * The real bookable-hours rows (0015) that the member app books against —
   * NOT the free-text `trainer_profiles.availability` weekday list, which has
   * no times and cannot produce a slot.
   */
  availability: TrainerAvailabilityRow[];
  clients: TrainerClient[];
  stats: TrainerStats;
}

export interface TrainerStats {
  classesTaught: number;
  upcomingClasses: number;
  ptApproved: number;
  ptPending: number;
  ptUpcoming: number;
  bookingsPending: number;
  distinctClients: number;
  /** Bookable minutes per week, summed across their availability windows. */
  weeklyBookableMinutes: number;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function weekdayName(dow: number): string {
  return WEEKDAYS[dow] ?? `Day ${dow}`;
}

/** 'HH:MM:SS' → '7:00 AM'. Wall-clock, never shifted through a timezone. */
export function formatTimeOfDay(hhmmss: string): string {
  const [h, m] = hhmmss.split(':').map(Number);
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m ?? 0).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

function minutesBetween(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  return Math.max(0, (eh * 60 + em) - (sh * 60 + sm));
}

/**
 * Loads one trainer's full record.
 *
 * Same failure contract as the member drawer: the identity lookup may throw
 * (without it there is nobody to show), every other section fails soft to empty
 * — an empty Sessions tab truthfully means this trainer has run none.
 */
export async function loadTrainerDetail(trainerId: string): Promise<TrainerDetail> {
  const identity = await getTrainer(trainerId);
  if (!identity) {
    throw new Error('That trainer record could not be loaded.');
  }

  const [classes, bookings, ptSessions, availability, names] = await Promise.all([
    listTrainerClasses(trainerId).catch(() => []),
    listTrainerBookings(trainerId).catch(() => []),
    listTrainerPtSessions(trainerId).catch(() => []),
    listTrainerAvailability(trainerId).catch(() => []),
    memberNameMap().catch(() => ({} as Record<string, string>)),
  ]);

  const now = Date.now();

  // Who this trainer actually works with, from both directions: 1-on-1 sessions
  // and seats booked into their classes. Cancelled and rejected are excluded —
  // a member who cancelled is not someone the trainer trained.
  const byMember = new Map<string, TrainerClient>();
  const touch = (memberId: string) => {
    let entry = byMember.get(memberId);
    if (!entry) {
      entry = {
        memberId,
        // A member whose profile can't be read is shown as unknown rather than
        // dropped — the session happened either way.
        name: names[memberId] ?? 'Unknown member',
        ptSessions: 0,
        classBookings: 0,
        lastSeen: null,
      };
      byMember.set(memberId, entry);
    }
    return entry;
  };
  const seen = (entry: TrainerClient, when: string | null) => {
    if (when && (entry.lastSeen == null || when > entry.lastSeen)) entry.lastSeen = when;
  };

  for (const s of ptSessions) {
    if (s.status === 'cancelled' || s.status === 'rejected') continue;
    const entry = touch(s.member_id);
    entry.ptSessions += 1;
    seen(entry, s.starts_at);
  }
  for (const b of bookings) {
    if (b.status === 'cancelled' || b.status === 'rejected') continue;
    const entry = touch(b.member_id);
    entry.classBookings += 1;
    seen(entry, b.classes?.scheduled_at ?? b.requested_at);
  }

  const clients = [...byMember.values()].sort((a, b) => (b.lastSeen ?? '').localeCompare(a.lastSeen ?? ''));

  return {
    identity,
    classes,
    bookings,
    ptSessions,
    availability,
    clients,
    stats: {
      classesTaught: classes.length,
      upcomingClasses: classes.filter((c) => c.scheduled_at != null && new Date(c.scheduled_at).getTime() > now).length,
      ptApproved: ptSessions.filter((s) => s.status === 'approved').length,
      ptPending: ptSessions.filter((s) => s.status === 'pending').length,
      ptUpcoming: ptSessions.filter((s) => s.status === 'approved' && new Date(s.starts_at).getTime() > now).length,
      bookingsPending: bookings.filter((b) => b.status === 'pending').length,
      distinctClients: clients.length,
      weeklyBookableMinutes: availability.reduce((sum, a) => sum + minutesBetween(a.start_time, a.end_time), 0),
    },
  };
}
