import { listTrainerBookings, updateBookingStatus, type BookingModes } from '../lib/api/bookings';
import { listTrainerPtSessions, setPtSessionStatus } from '../lib/api/ptSessions';
import type { BookingStatus } from '../types/db';

/**
 * A coach's booking requests — class bookings and 1-on-1s flattened into one
 * queue — shared by Bookings and Today (2026-10-27), so the two screens decide
 * the same way and can never disagree about what is waiting.
 */
export interface TrainerRequest {
  kind: 'class' | 'pt';
  id: string;
  memberId: string;
  title: string;
  status: BookingStatus;
  /** NULL for a class with no time on it — 0001 allows that. */
  startsAt: string | null;
  requestedAt: string;
  /** Under "coach then desk" (0180): this coach has accepted; the desk confirms. */
  coachOk: boolean;
}

/** Pending first — this is a work queue, not an archive — and within pending, the longest wait at the top. */
export async function loadTrainerRequests(trainerId: string): Promise<TrainerRequest[]> {
  const [classRows, ptRows] = await Promise.all([
    listTrainerBookings(trainerId),
    listTrainerPtSessions(trainerId).catch(() => []),
  ]);
  return [
    ...classRows.map((b): TrainerRequest => ({
      kind: 'class', id: b.id, memberId: b.member_id, title: b.classes?.name ?? 'Class', status: b.status,
      startsAt: b.classes?.scheduled_at ?? null, requestedAt: b.requested_at,
      coachOk: !!(b as { coach_ok_at?: string | null }).coach_ok_at,
    })),
    ...ptRows.map((s): TrainerRequest => ({
      kind: 'pt', id: s.id, memberId: s.member_id, title: 'Personal training', status: s.status,
      startsAt: s.starts_at, requestedAt: s.requested_at,
      coachOk: !!(s as { coach_ok_at?: string | null }).coach_ok_at,
    })),
  ].sort((a, b) => {
    if ((a.status === 'pending') !== (b.status === 'pending')) return a.status === 'pending' ? -1 : 1;
    return a.requestedAt.localeCompare(b.requestedAt);
  });
}

/** Who decides this kind at the gym (0180). */
export const modeFor = (req: TrainerRequest, modes: BookingModes) => (req.kind === 'class' ? modes.classMode : modes.ptMode);

/** Still this coach's to decide: pending, not already accepted by them, and not the desk's (0180). */
export function coachDecides(req: TrainerRequest, modes: BookingModes): boolean {
  const mode = modeFor(req, modes);
  return req.status === 'pending' && !req.coachOk && mode !== 'desk' && mode !== 'off';
}

/**
 * Accept or decline. Both calls guard against a zero-row write, so a decision
 * RLS declines — someone else's class, or one already decided — raises here
 * instead of showing a success over an unchanged row.
 */
export async function decideRequest(req: TrainerRequest, status: 'approved' | 'rejected', trainerId: string): Promise<void> {
  if (req.kind === 'class') await updateBookingStatus(req.id, status, trainerId);
  else await setPtSessionStatus(req.id, status);
}

/** The words after a decision, the same on both screens. */
export function decidedText(req: TrainerRequest, status: 'approved' | 'rejected', modes: BookingModes, name: string | undefined): string {
  if (status === 'approved' && modeFor(req, modes) === 'coach_desk') return 'Accepted — the front desk confirms it next.';
  if (status === 'approved') return `Confirmed for ${name ?? 'the member'}.`;
  return `Declined. ${name ?? 'The member'} has been told.`;
}

/** How long the member has been waiting, in words; null under an hour. */
export function waitedLabel(requestedAt: string, now = Date.now()): string | null {
  const hours = (now - new Date(requestedAt).getTime()) / 3_600_000;
  if (hours < 1) return null;
  if (hours < 24) return `waiting ${Math.floor(hours)}h`;
  const days = Math.floor(hours / 24);
  return `waiting ${days} day${days === 1 ? '' : 's'}`;
}
