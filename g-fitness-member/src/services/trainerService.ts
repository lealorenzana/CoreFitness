import { supabase } from '../lib/supabaseClient';
import { getTrainer, type TrainerWithProfile } from '../lib/api/trainers';
import { listTrainerClasses } from '../lib/api/classes';
import { listTrainerBookings } from '../lib/api/bookings';
import {
  listGoals, listMeasurements, listWorkoutLogs,
  type FitnessGoalRow, type BodyMeasurementRow, type WorkoutLogRow,
} from '../lib/api/progress';
import { getSharePrefs, SHARE_ALL, type SharePrefs } from '../lib/api/sharePrefs';
import { getProgression, type Progression } from '../lib/api/achievements';
import type { BookingStatus, ClassRow } from '../types/db';

/**
 * The seam between the trainer screens and real data — the member app's
 * counterpart to the admin's dashboardService.
 *
 * Same honesty rule applies: where an entity isn't migrated yet, these return
 * **zero or an empty list, never a plausible invention**. Before this existed
 * every trainer screen rendered `TRAINER = { name: 'Cyrelle Joy Duhac', … }`,
 * so whoever logged in was greeted as Cyrelle and shown her numbers.
 *
 * What is genuinely real today: the trainer's own identity, the classes they
 * teach (`classes.trainer_id`), and the bookings against those classes. What
 * has no source at all yet, and so is deliberately absent rather than faked:
 *
 *   - ratings and lifetime "sessions completed" — no table
 *   - trainer↔member assignment — no table. `membersAssigned` below counts
 *     distinct members who hold an approved booking for one of this trainer's
 *     classes, which is the closest real answer available.
 *   - attendance rate per trainer — needs attendance tied to a class, which
 *     the booking model will add.
 *
 * These fill in when the classes/personal-training booking model lands.
 */

export interface TrainerOverview {
  trainer: TrainerWithProfile;
  todayClasses: ClassRow[];
  pendingBookings: number;
  membersAssigned: number;
  sessionsThisWeek: number;
  membersTrainedThisWeek: number;
  /**
   * Booking activity, newest first.
   *
   * Carries the `status` rather than a pre-baked sentence. It used to hand over
   * `text: "Booking cancelled — test2"`, which meant the screen could not tell
   * an approval from a cancellation and drew every row with the same icon in
   * the same colour — the one thing a trainer scans this list for.
   */
  recentActivity: {
    id: string;
    status: BookingStatus;
    className: string;
    at: string;
  }[];
}

/**
 * What a trainer may see about one member (migrations 0028 + 0032).
 *
 * `shared` is the member's own choice, and it is enforced by RLS — a category
 * switched off returns no rows to *any* trainer, not just this screen. It is
 * reported alongside the data so the UI can say "not shared" instead of
 * drawing an empty panel, which would tell the trainer the member has no goals
 * when in fact they have several and kept them private.
 */
export interface MemberDetailForTrainer {
  progression: Progression | null;
  shared: SharePrefs;
  goals: FitnessGoalRow[];
  latestMeasurement: BodyMeasurementRow | null;
  recentWorkouts: WorkoutLogRow[];
}

export async function getMemberDetailForTrainer(memberId: string): Promise<MemberDetailForTrainer> {
  const shared = await getSharePrefs(memberId).catch(() => SHARE_ALL);

  // Each read is independent and allowed to fail on its own. A trainer looking
  // at a member must not get a blank screen because one optional panel errored.
  const [progression, goals, measurements, workouts] = await Promise.all([
    getProgression(memberId).catch(() => null),
    shared.shareGoals ? listGoals(memberId).catch(() => []) : Promise.resolve([]),
    shared.shareMeasurements ? listMeasurements(memberId).catch(() => []) : Promise.resolve([]),
    shared.shareWorkouts ? listWorkoutLogs(memberId).catch(() => []) : Promise.resolve([]),
  ]);

  return {
    progression,
    shared,
    // Newest first, and only what a coach can act on in a modal.
    goals: goals.filter((g) => g.achieved_on == null).slice(0, 4),
    // listMeasurements is oldest-first so the charts read left to right.
    latestMeasurement: measurements.length ? measurements[measurements.length - 1] : null,
    recentWorkouts: workouts.slice(0, 5),
  };
}

/** Local calendar date as YYYY-MM-DD — never toISOString(), which shifts to UTC. */
function toDateString(d: Date): string {
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

/** The signed-in trainer's id, or null if nobody is signed in. */
export async function getCurrentTrainerId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export async function getTrainerOverview(trainerId: string): Promise<TrainerOverview | null> {
  const trainer = await getTrainer(trainerId);
  if (!trainer) return null;

  const [classes, bookings] = await Promise.all([
    listTrainerClasses(trainerId).catch(() => []),
    listTrainerBookings(trainerId).catch(() => []),
  ]);

  const today = toDateString(new Date());
  const weekAgo = toDateString(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));

  const todayClasses = classes.filter(
    (c) => c.scheduled_at != null && toDateString(new Date(c.scheduled_at)) === today
  );

  const sessionsThisWeek = classes.filter((c) => {
    if (!c.scheduled_at) return false;
    const day = toDateString(new Date(c.scheduled_at));
    return day >= weekAgo && day <= today;
  }).length;

  const approved = bookings.filter((b) => b.status === 'approved');
  const membersAssigned = new Set(approved.map((b) => b.member_id)).size;

  const trainedThisWeek = new Set(
    approved
      .filter((b) => b.classes?.scheduled_at && toDateString(new Date(b.classes.scheduled_at)) >= weekAgo)
      .map((b) => b.member_id)
  );

  return {
    trainer,
    todayClasses,
    pendingBookings: bookings.filter((b) => b.status === 'pending').length,
    membersAssigned,
    sessionsThisWeek,
    membersTrainedThisWeek: trainedThisWeek.size,
    // Real booking requests, newest first — replaces the invented "Aaron Diwa
    // completed Strength Basics" activity feed.
    recentActivity: bookings.slice(0, 5).map((b) => ({
      id: b.id,
      status: b.status,
      className: b.classes?.name ?? 'Class',
      at: b.requested_at,
    })),
  };
}
