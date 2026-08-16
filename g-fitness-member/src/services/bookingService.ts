import { supabase } from '../lib/supabaseClient';
import { listClasses } from '../lib/api/classes';
import { listMemberBookings, createBooking, cancelOwnBooking } from '../lib/api/bookings';
import { listMemberPtSessions, requestPtSession, cancelPtSession } from '../lib/api/ptSessions';
import { listTrainerAvailability, computeOpenSlots, type OpenSlot } from '../lib/api/trainerAvailability';
import {
  listPublicTrainers,
  listClassAvailability,
  listTrainerBusySlots,
  trainerName,
  type PublicTrainer,
} from '../lib/api/directory';
import { getMemberProfile, updateMemberProfile, NO_MEMBER_ROW } from '../lib/api/members';
import { getCurrentMembership, membershipIsUsable } from '../lib/api/memberships';
import type { BookingStatus, ClassLevel } from '../types/db';

/**
 * Everything the member's booking screens need, assembled in one place.
 *
 * The member app used to fabricate all of this: five hardcoded class types, a
 * trainer list from `data/trainers.ts`, and — the one that mattered — "spots
 * left" read off a literal `[3, 5, 2, 8, 1, 6, 4]` array indexed by position.
 * Every number on the screen was decoration.
 *
 * Same honesty rule as trainerService and dashboardService: if there is no
 * source for a number, it does not appear.
 */

export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';

export interface BookableClass {
  id: string;
  name: string;
  level: ClassLevel;
  classType: string | null;
  location: string | null;
  scheduledAt: string;
  durationMinutes: number;
  trainerId: string | null;
  trainerName: string;
  capacity: number;
  booked: number;
  spotsLeft: number;
  /** Matches the member's stated experience level. Never used to block a booking. */
  recommended: boolean;
  /** The member's own booking on this class, if any — drives "Booked" vs "Book". */
  myStatus: BookingStatus | null;
}

/** A class booking and a PT session, flattened into the one thing the member sees. */
export interface MyBooking {
  kind: 'class' | 'pt';
  id: string;
  title: string;
  subtitle: string;
  startsAt: string | null;
  durationMinutes: number;
  location: string | null;
  status: BookingStatus;
  /** Whether this member is allowed to withdraw it right now. */
  cancellable: boolean;
}

/**
 * What the member's plan lets them do right now (migration 0017).
 *
 * This exists to *explain* a disabled button, not to enforce anything — the
 * triggers on `bookings` and `pt_sessions` are the boundary, and they run
 * whether the request came from this app or straight from PostgREST. Keeping
 * the two in step matters: if this says yes and the trigger says no, the member
 * gets a raw Postgres error instead of a sentence.
 */
export interface Entitlement {
  usable: boolean;
  planName: string | null;
  canBookClasses: boolean;
  canBookPt: boolean;
  classesPerWeek: number | null;
  ptPerMonth: number | null;
  classesUsedThisWeek: number;
  /** Why booking is unavailable, in words a member can act on. Null when it isn't. */
  blockedReason: string | null;
}

/** Monday-start week key for a date, in local time. Mirrors date_trunc('week') in 0017. */
function weekKey(iso: string): string {
  const d = new Date(iso);
  const day = (d.getDay() + 6) % 7; // Monday = 0
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
  return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
}

export async function getEntitlement(memberId: string): Promise<Entitlement> {
  const [membership, bookings] = await Promise.all([
    getCurrentMembership(memberId).catch(() => null),
    listMemberBookings(memberId).catch(() => []),
  ]);

  const plan = membership?.membership_plans ?? null;
  const usable =
    membership != null &&
    membershipIsUsable(membership.status, membership.expiry_date, membership.never_expires);

  const thisWeek = weekKey(new Date().toISOString());
  const classesUsedThisWeek = bookings.filter(
    (b) =>
      (b.status === 'pending' || b.status === 'approved') &&
      b.classes?.scheduled_at != null &&
      weekKey(b.classes.scheduled_at) === thisWeek
  ).length;

  let blockedReason: string | null = null;
  if (membership == null) {
    blockedReason = 'You need a membership before you can book. Sign up at the front desk.';
  } else if (membership.status === 'frozen') {
    blockedReason = 'Your membership is frozen. Ask the front desk to unfreeze it.';
  } else if (!usable) {
    blockedReason = 'Your membership has expired. Renew at the front desk to book again.';
  }

  return {
    usable,
    planName: plan?.name ?? null,
    canBookClasses: plan?.can_book_classes ?? false,
    canBookPt: plan?.can_book_pt ?? false,
    classesPerWeek: plan?.class_bookings_per_week ?? null,
    ptPerMonth: plan?.pt_sessions_per_month ?? null,
    classesUsedThisWeek,
    blockedReason,
  };
}

export async function getCurrentMemberId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

/**
 * Where an experience level waits when there is nowhere to put it yet.
 *
 * Onboarding runs immediately after sign-up, while the member is still
 * `pending_approval` and has **no `member_profiles` row** — approval creates
 * it. So the answer to "what's your experience level?" had nothing to write to
 * and was thrown away, every time, for every member.
 *
 * It is parked here instead and applied on the next read once the row exists.
 */
const PENDING_LEVEL_KEY = 'pending_experience_level';

function readPendingLevel(): ExperienceLevel | null {
  const raw = localStorage.getItem(PENDING_LEVEL_KEY);
  return raw === 'beginner' || raw === 'intermediate' || raw === 'advanced' ? raw : null;
}

export async function getExperienceLevel(memberId: string): Promise<ExperienceLevel | null> {
  const member = await getMemberProfile(memberId).catch(() => null);
  const raw = member?.member.experience_level?.toLowerCase();
  const stored =
    raw === 'beginner' || raw === 'intermediate' || raw === 'advanced' ? raw : null;

  if (stored) {
    // The database is the answer; drop anything still waiting so a stale
    // onboarding choice can never overwrite a later, deliberate one.
    localStorage.removeItem(PENDING_LEVEL_KEY);
    return stored;
  }

  // Nothing stored — if onboarding left an answer behind, this is the first
  // moment it can actually be saved.
  const pending = readPendingLevel();
  if (pending && member) {
    try {
      await updateMemberProfile(memberId, { experience_level: pending });
      localStorage.removeItem(PENDING_LEVEL_KEY);
      return pending;
    } catch {
      // Still no row (not approved yet). Keep it for next time.
    }
  }
  return null;
}

/**
 * Members set their own level (migration 0016 relaxed the tamper trigger for
 * this column). It only reorders a list and adds a badge, so there is nothing
 * to gain by lying about it — and the member is the one who knows the answer.
 *
 * If the row does not exist yet the choice is parked rather than lost, and
 * `getExperienceLevel` applies it as soon as there is somewhere to put it.
 */
export async function setExperienceLevel(memberId: string, level: ExperienceLevel): Promise<void> {
  try {
    await updateMemberProfile(memberId, { experience_level: level });
    localStorage.removeItem(PENDING_LEVEL_KEY);
  } catch (err) {
    if (err instanceof Error && err.message === NO_MEMBER_ROW) {
      localStorage.setItem(PENDING_LEVEL_KEY, level);
      return;
    }
    throw err;
  }
}

// ─── Onboarding completion (0033) ────────────────────────────────────────────
//
// This used to be `localStorage['onboarding_complete']`, which meant the flag
// lived on one browser profile: a second phone, a desktop, a private window or
// a reinstalled PWA all replayed the entire flow for someone who had finished
// it days earlier. It is a fact about the member, so it belongs on their row.

const PENDING_ONBOARDING_KEY = 'pending_onboarding_complete';

/**
 * Records that onboarding is done. Parked locally when the member has no
 * profile row yet — onboarding runs while they are still `pending_approval`,
 * the same ordering problem `setExperienceLevel` has.
 */
export async function markOnboardingComplete(memberId: string): Promise<void> {
  try {
    await updateMemberProfile(memberId, { onboarding_completed_at: new Date().toISOString() });
    localStorage.removeItem(PENDING_ONBOARDING_KEY);
  } catch (err) {
    if (err instanceof Error && err.message === NO_MEMBER_ROW) {
      localStorage.setItem(PENDING_ONBOARDING_KEY, 'true');
      return;
    }
    throw err;
  }
}

/**
 * Has this member finished onboarding, on any device?
 *
 * Fails **closed on the safe side**: if the lookup errors we say "yes", because
 * wrongly re-running onboarding for an existing member is far more annoying
 * than wrongly skipping it for a new one — and the new one can reach it again
 * from their profile.
 */
export async function isOnboardingComplete(memberId: string): Promise<boolean> {
  try {
    const member = await getMemberProfile(memberId);
    if (member?.member.onboarding_completed_at) {
      localStorage.removeItem(PENDING_ONBOARDING_KEY);
      return true;
    }
    // Finished while still pending approval: this is the first moment it can
    // actually be written.
    if (member && localStorage.getItem(PENDING_ONBOARDING_KEY) === 'true') {
      await markOnboardingComplete(memberId).catch(() => undefined);
      return true;
    }
    return false;
  } catch {
    return true;
  }
}

/**
 * A class is recommended when it is pitched at the member's level, or is open
 * to everyone. Deliberately advisory — the decision was "recommend, don't
 * restrict", so an advanced member can still take a beginner class and a
 * beginner can still try an advanced one.
 *
 * With no level set, nothing is recommended. That is the honest answer; the
 * screen prompts the member to set one instead of guessing on their behalf.
 */
function isRecommended(classLevel: ClassLevel, memberLevel: ExperienceLevel | null): boolean {
  if (!memberLevel) return false;
  return classLevel === 'all_levels' || classLevel === memberLevel;
}

/** Upcoming classes only — a timetable of sessions that already ran is history, not a booking screen. */
export async function listBookableClasses(memberId: string): Promise<BookableClass[]> {
  const [classes, availability, trainers, myBookings, level] = await Promise.all([
    listClasses().catch(() => []),
    listClassAvailability().catch(() => []),
    listPublicTrainers().catch(() => [] as PublicTrainer[]),
    listMemberBookings(memberId).catch(() => []),
    getExperienceLevel(memberId).catch(() => null),
  ]);

  const capacityById = new Map(availability.map((a) => [a.class_id, a]));
  const nameById = new Map(trainers.map((t) => [t.id, trainerName(t)]));

  // Only bookings that still hold a seat count as "mine" — a cancelled or
  // rejected one should put the Book button back.
  const mineByClass = new Map<string, BookingStatus>();
  for (const b of myBookings) {
    if (b.status === 'pending' || b.status === 'approved') mineByClass.set(b.class_id, b.status);
  }

  const now = Date.now();

  return classes
    .filter((c) => c.scheduled_at != null && new Date(c.scheduled_at).getTime() > now)
    .map((c): BookableClass => {
      const cap = capacityById.get(c.id);
      const capacity = cap?.capacity ?? c.capacity;
      const booked = cap?.booked_count ?? 0;
      return {
        id: c.id,
        name: c.name,
        level: c.level,
        classType: c.class_type,
        location: c.location,
        scheduledAt: c.scheduled_at as string,
        durationMinutes: c.duration_minutes,
        trainerId: c.trainer_id,
        trainerName: c.trainer_id ? nameById.get(c.trainer_id) ?? 'Coach TBA' : 'Coach TBA',
        capacity,
        booked,
        spotsLeft: Math.max(0, capacity - booked),
        recommended: isRecommended(c.level, level),
        myStatus: mineByClass.get(c.id) ?? null,
      };
    })
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
}

export async function bookClass(memberId: string, classId: string): Promise<void> {
  await createBooking(memberId, classId);
}

/**
 * Open personal-training slots for one trainer.
 *
 * `busy` must carry both halves of the trainer's commitments — their PT
 * sessions (from the trainer_busy_slots view) *and* the group classes they
 * teach. Passing only one is how a coach ends up double-booked against their
 * own class.
 */
export async function listOpenPtSlots(trainerId: string, daysAhead = 14): Promise<OpenSlot[]> {
  const [availability, ptBusy, classes] = await Promise.all([
    listTrainerAvailability(trainerId).catch(() => []),
    listTrainerBusySlots(trainerId).catch(() => []),
    listClasses().catch(() => []),
  ]);

  const busy = [
    ...ptBusy.map((b) => ({ startsAt: b.starts_at, durationMinutes: b.duration_minutes })),
    ...classes
      .filter((c) => c.trainer_id === trainerId && c.scheduled_at != null)
      .map((c) => ({ startsAt: c.scheduled_at as string, durationMinutes: c.duration_minutes })),
  ];

  return computeOpenSlots(availability, busy, daysAhead);
}

export async function requestPt(input: {
  memberId: string;
  trainerId: string;
  startsAt: string;
  durationMinutes: number;
  notes?: string;
}): Promise<void> {
  await requestPtSession({
    trainerId: input.trainerId,
    memberId: input.memberId,
    startsAt: input.startsAt,
    durationMinutes: input.durationMinutes,
    notes: input.notes,
  });
}

/** Both kinds of booking, newest commitment first, for the member's own list. */
export async function listMyBookings(memberId: string): Promise<MyBooking[]> {
  const [classBookings, ptSessions, trainers] = await Promise.all([
    listMemberBookings(memberId).catch(() => []),
    listMemberPtSessions(memberId).catch(() => []),
    listPublicTrainers().catch(() => [] as PublicTrainer[]),
  ]);

  const nameById = new Map(trainers.map((t) => [t.id, trainerName(t)]));

  const rows: MyBooking[] = [
    ...classBookings.map((b): MyBooking => ({
      kind: 'class',
      id: b.id,
      title: b.classes?.name ?? 'Class',
      subtitle: b.classes?.trainer_id
        ? `with ${nameById.get(b.classes.trainer_id) ?? 'your coach'}`
        : 'Group class',
      startsAt: b.classes?.scheduled_at ?? null,
      durationMinutes: b.classes?.duration_minutes ?? 60,
      location: b.classes?.location ?? null,
      status: b.status,
      cancellable: b.status === 'pending' || b.status === 'approved',
    })),
    ...ptSessions.map((s): MyBooking => ({
      kind: 'pt',
      id: s.id,
      title: 'Personal Training',
      subtitle: `with ${nameById.get(s.trainer_id) ?? 'your coach'}`,
      startsAt: s.starts_at,
      durationMinutes: s.duration_minutes,
      location: null,
      status: s.status,
      // A PT request is withdrawn (deleted) rather than cancelled, and only
      // while it's still pending — once the desk has approved it, the slot is
      // committed and cancelling is a conversation, not a button.
      cancellable: s.status === 'pending',
    })),
  ];

  return rows.sort((a, b) => (b.startsAt ?? '').localeCompare(a.startsAt ?? ''));
}

export async function cancelMyBooking(row: MyBooking): Promise<void> {
  if (row.kind === 'pt') await cancelPtSession(row.id);
  else await cancelOwnBooking(row.id);
}

/** Upcoming vs past, by the session's own time rather than its status. */
export function isUpcoming(row: MyBooking, now = Date.now()): boolean {
  if (row.status === 'rejected' || row.status === 'cancelled') return false;
  if (!row.startsAt) return true; // not scheduled yet — still ahead of the member
  return new Date(row.startsAt).getTime() + row.durationMinutes * 60_000 > now;
}
