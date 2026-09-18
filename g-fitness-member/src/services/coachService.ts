import { listFeedbackForMember, markFeedback, type TrainerFeedbackRow } from '../lib/api/trainerFeedback';
import { listPublicTrainers, trainerName, type PublicTrainer } from '../lib/api/directory';
import { canRate, getMyRating, currentPeriod, periodLabel } from '../lib/api/trainerRatings';
import { progressService } from './progressService';
import { notificationService } from './notificationService';

/**
 * The Coach tab, assembled (reworked 2026-09-18, with 0088).
 *
 * **The source was wrong.** The tab read `notifications` of type
 * `recommendation`, but since 0072 a coach's note is a `trainer_feedback` row —
 * a note, a separate "what to do next", the coach — and the member is alerted
 * by a trigger with type `system`. So every note written with the current
 * trainer app reached the bell and never this tab. The record is now the
 * source; notes from before 0072, which exist only as notifications, are still
 * shown, marked as older.
 */

export interface CoachNote {
  id: string;
  /** `record` is a trainer_feedback row; `legacy` a pre-0072 notification. */
  source: 'record' | 'legacy';
  trainerId: string | null;
  coachName: string;
  photoUrl: string | null;
  sentAt: string;
  note: string;
  /** What to do next — the part that becomes a step to tick. */
  recommendation: string | null;
  seen: boolean;
  done: boolean;
}

export interface CoachSummary {
  id: string;
  name: string;
  photoUrl: string | null;
  specialization: string | null;
  noteCount: number;
  lastNoteAt: string | null;
  /** "Evaluate for September 2026" — only when the database says they may. */
  evaluatePrompt: string | null;
}

export interface CoachFeed {
  notes: CoachNote[];
  coaches: CoachSummary[];
}

export async function loadCoachFeed(memberId: string): Promise<CoachFeed> {
  const [records, legacy, trainers] = await Promise.all([
    listFeedbackForMember(memberId).catch(() => [] as TrainerFeedbackRow[]),
    progressService.getTrainerFeedback(memberId).catch(() => []),
    listPublicTrainers().catch(() => [] as PublicTrainer[]),
  ]);
  const byId = new Map(trainers.map((t) => [t.id, t]));

  const notes: CoachNote[] = [
    ...records.map((r): CoachNote => {
      const t = byId.get(r.trainer_id);
      return {
        id: r.id, source: 'record', trainerId: r.trainer_id,
        coachName: t ? trainerName(t) : 'Your coach', photoUrl: t?.photo_url ?? null,
        sentAt: r.created_at, note: r.note, recommendation: r.recommendation,
        seen: r.seen_at != null, done: r.done_at != null,
      };
    }),
    // The trigger's own alert for a record is `system`, so it never matches
    // these types — no note appears twice.
    ...legacy.map((l): CoachNote => {
      const t = l.trainerId ? byId.get(l.trainerId) : undefined;
      return {
        id: l.id, source: 'legacy', trainerId: l.trainerId ?? null,
        coachName: l.trainerName ?? (t ? trainerName(t) : 'Your coach'), photoUrl: t?.photo_url ?? null,
        sentAt: l.sentAt, note: l.content, recommendation: null, seen: l.read, done: false,
      };
    }),
  ].sort((a, b) => b.sentAt.localeCompare(a.sentAt));

  // The coaches who have written, most recent first, each with a rating nudge
  // when this month's evaluation is open to this member and not yet given.
  const ids = [...new Set(notes.map((n) => n.trainerId).filter((x): x is string => !!x))];
  const period = currentPeriod();
  const coaches = await Promise.all(ids.map(async (id): Promise<CoachSummary> => {
    const t = byId.get(id);
    const mine = notes.filter((n) => n.trainerId === id);
    const [allowed, rated] = await Promise.all([
      canRate(id),
      getMyRating(memberId, id, period).catch(() => null),
    ]);
    return {
      id,
      name: t ? trainerName(t) : mine[0]?.coachName ?? 'Coach',
      photoUrl: t?.photo_url ?? null,
      specialization: t?.specialization ?? null,
      noteCount: mine.length,
      lastNoteAt: mine[0]?.sentAt ?? null,
      evaluatePrompt: allowed && !rated ? `Evaluate for ${periodLabel(period)}` : null,
    };
  }));

  return { notes, coaches };
}

/** Opening a note: a record is marked seen (0088), a legacy note read in the bell. */
export async function markNoteSeen(memberId: string, n: CoachNote): Promise<void> {
  if (n.source === 'record') await markFeedback(n.id);
  else await notificationService.markAsRead(memberId, n.id);
}

export async function setStepDone(n: CoachNote, done: boolean): Promise<void> {
  await markFeedback(n.id, done);
}
