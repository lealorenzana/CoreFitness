import { listBookings, type BookingWithDetails } from '../lib/api/bookings';
import { listPtSessions, type PtSessionRow } from '../lib/api/ptSessions';
import { listMembers } from '../lib/api/members';
import { listTrainers } from '../lib/api/trainers';
import { listMemberships, membershipIsUsable, type MembershipWithPlan } from '../lib/api/memberships';
import type { BookingStatus } from '../types/db';

/**
 * The approval queue, with the checks the desk was doing in its head.
 *
 * Approving was previously a bare status write. Nothing stopped the desk
 * approving a 21st member into a 20-person class, approving a session for
 * somebody whose membership expired last month, or approving a PT slot on a
 * plan that doesn't include personal training. All three are recoverable, but
 * only if someone notices — and none of them were visible on screen.
 *
 * These are **warnings, not blocks**. The front desk overrides them for real
 * reasons (a member paying cash on the spot, a coach agreeing to squeeze one
 * more in), and a system that silently refuses is worse than one that says what
 * it thinks and lets a human decide.
 */

export type WarningKind = 'capacity' | 'membership' | 'entitlement' | 'past';

export interface BookingWarning {
  kind: WarningKind;
  message: string;
}

export interface QueueRow {
  kind: 'class' | 'pt';
  id: string;
  memberId: string;
  memberName: string;
  trainerId: string | null;
  trainerName: string | null;
  title: string;
  /** ISO start, or null for a class with no date set. */
  when: string | null;
  status: BookingStatus;
  requestedAt: string;
  notes: string | null;
  /** Approved seats vs capacity, class bookings only. */
  seats: { taken: number; capacity: number } | null;
  warnings: BookingWarning[];
  /**
   * Who accepted or declined this, and in what capacity (migration 0071).
   *
   * 'trainer' is the interesting value: since 0071 a trainer decides their own
   * classes and sessions, so a screen that said "approved" without saying by
   * whom would imply the desk did it. 'system' is an automatic expiry — nobody
   * decided, the start time simply passed.
   *
   * NULL means undecided, or decided before 0071 added the column. Those are
   * different things and neither is "the desk did it", so the screen says
   * nothing rather than guessing.
   */
  decidedByRole: 'admin' | 'staff' | 'trainer' | 'system' | null;
  decidedByName: string | null;
}

export interface QueueData {
  rows: QueueRow[];
  /** memberId → display name, for anything the page still needs to label. */
  names: Record<string, string>;
}

function fullName(p: { first_name: string; last_name: string }): string {
  return `${p.first_name} ${p.last_name}`.trim();
}

/**
 * Loads both queues and annotates every row.
 *
 * The capacity count uses **approved** bookings only. `class_availability`
 * counts `pending` + `approved`, which is the right number for a member
 * deciding whether to ask, and the wrong one here — a class with 30 pending
 * requests and no approvals is empty, and blocking the first approval because
 * of the other 29 requests would be nonsense.
 */
export async function loadBookingQueue(): Promise<QueueData> {
  const [classBookings, ptSessions, members, trainers, memberships] = await Promise.all([
    listBookings().catch(() => [] as BookingWithDetails[]),
    listPtSessions().catch(() => [] as PtSessionRow[]),
    listMembers().catch(() => []),
    listTrainers().catch(() => []),
    listMemberships().catch(() => [] as MembershipWithPlan[]),
  ]);

  const names: Record<string, string> = {};
  for (const m of members) names[m.profile.id] = fullName(m.profile);
  for (const t of trainers) names[t.profile.id] = fullName(t.profile);

  // Newest membership per member — a renewal creates a new row, and the old one
  // must not be what we judge them on.
  const currentMembership = new Map<string, MembershipWithPlan>();
  for (const m of memberships) {
    const seen = currentMembership.get(m.member_id);
    if (!seen || m.created_at > seen.created_at) currentMembership.set(m.member_id, m);
  }

  const approvedPerClass = new Map<string, number>();
  for (const b of classBookings) {
    if (b.status === 'approved') {
      approvedPerClass.set(b.class_id, (approvedPerClass.get(b.class_id) ?? 0) + 1);
    }
  }

  const now = Date.now();

  const membershipWarnings = (memberId: string, kind: 'class' | 'pt'): BookingWarning[] => {
    const ms = currentMembership.get(memberId);
    const out: BookingWarning[] = [];

    if (!ms) {
      out.push({ kind: 'membership', message: 'No membership on file.' });
      return out;
    }
    if (!membershipIsUsable(ms.status, ms.expiry_date, ms.never_expires)) {
      out.push({
        kind: 'membership',
        message: `Membership is ${ms.status}${ms.expiry_date ? ` (expired ${ms.expiry_date})` : ''}.`,
      });
    }
    // Entitlements are configured per plan (0017) — the tier is a label, not a
    // hidden rulebook, so this reads the flags rather than inferring from tier.
    const plan = ms.membership_plans;
    if (plan) {
      if (kind === 'class' && plan.can_book_classes === false) {
        out.push({ kind: 'entitlement', message: `${plan.name} does not include class bookings.` });
      }
      if (kind === 'pt' && plan.can_book_pt === false) {
        out.push({ kind: 'entitlement', message: `${plan.name} does not include personal training.` });
      }
    }
    return out;
  };

  const rows: QueueRow[] = [
    ...classBookings.map((b): QueueRow => {
      const capacity = b.classes?.capacity ?? 0;
      const taken = approvedPerClass.get(b.class_id) ?? 0;
      const when = b.classes?.scheduled_at ?? null;
      const warnings: BookingWarning[] = [];

      if (b.status === 'pending') {
        if (capacity > 0 && taken >= capacity) {
          warnings.push({ kind: 'capacity', message: `Class is full — ${taken} of ${capacity} seats already approved.` });
        }
        if (when && new Date(when).getTime() < now) {
          warnings.push({ kind: 'past', message: 'This class has already happened.' });
        }
        warnings.push(...membershipWarnings(b.member_id, 'class'));
      }

      return {
        kind: 'class',
        id: b.id,
        memberId: b.member_id,
        memberName: names[b.member_id] ?? 'Unknown member',
        trainerId: b.classes?.trainer_id ?? null,
        trainerName: b.classes?.trainer_id ? names[b.classes.trainer_id] ?? null : null,
        title: b.classes?.name ?? 'Class',
        when,
        status: b.status,
        requestedAt: b.requested_at,
        notes: null,
        seats: capacity > 0 ? { taken, capacity } : null,
        warnings,
        decidedByRole: b.decided_by_role ?? null,
        decidedByName: b.decided_by ? names[b.decided_by] ?? null : null,
      };
    }),
    ...ptSessions.map((s): QueueRow => {
      const warnings: BookingWarning[] = [];
      if (s.status === 'pending') {
        if (new Date(s.starts_at).getTime() < now) {
          warnings.push({ kind: 'past', message: 'This slot has already passed.' });
        }
        warnings.push(...membershipWarnings(s.member_id, 'pt'));
      }
      return {
        kind: 'pt',
        id: s.id,
        memberId: s.member_id,
        memberName: names[s.member_id] ?? 'Unknown member',
        trainerId: s.trainer_id,
        trainerName: names[s.trainer_id] ?? null,
        title: 'Personal Training',
        when: s.starts_at,
        status: s.status,
        requestedAt: s.requested_at,
        notes: s.notes,
        seats: null,
        warnings,
        decidedByRole: s.decided_by_role ?? null,
        decidedByName: s.decided_by ? names[s.decided_by] ?? null : null,
      };
    }),
  ].sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));

  return { rows, names };
}
