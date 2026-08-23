import type { MembershipPlanRow } from '../types/db';

/**
 * What a plan actually lets you do, in the words a member would use.
 *
 * The entitlement columns landed in 0017 and the database has enforced them
 * ever since — `enforce_class_booking_entitlement` and `enforce_pt_entitlement`
 * reject a booking the plan does not cover. But until now the member app read
 * those columns in exactly one place, `bookingService`, and only to grey out a
 * button. Nothing ever *told* anyone what their tier included.
 *
 * That is how a Free Access card ended up announcing "This membership does not
 * expire" as its single fact. Perfectly true, and the most misleading thing it
 * could have said: the tier that never runs out is also the tier that cannot
 * book a class or a trainer, and the card mentioned only the half that sounds
 * generous.
 *
 * ## Read from the columns, never from the tier name
 *
 * `tier` is a label for the badge. `can_book_classes`, `can_book_pt` and the
 * two quotas are the rules, and the admin edits them per plan — that is the
 * whole reason 0017 put them in columns instead of hardcoding the three tier
 * names. Deriving this text from `tier` would quietly reintroduce the hidden
 * rulebook and start lying the first time the gym changes a setting.
 */
export interface PlanAccess {
  /** Everything the plan grants, longest-lived first. */
  included: string[];
  /** Named absences. An empty list means the plan covers everything. */
  excluded: string[];
  /** True when nothing is held back — used to skip the "not included" row. */
  isFullAccess: boolean;
}

export function planAccess(plan: MembershipPlanRow | null | undefined): PlanAccess | null {
  if (!plan) return null;

  // Floor and locker access is the floor of every tier — it is what the Free
  // plan exists to provide, and no column can switch it off. Stated rather than
  // assumed, so the cheapest plan's card is never an empty box.
  const included: string[] = ['Gym floor & lockers'];
  const excluded: string[] = [];

  if (plan.can_book_classes) {
    // The two quotas are counted over different periods — classes per *week*,
    // PT per *month* — so they get their own sentences rather than sharing a
    // helper that would have to carry the period as an argument and would read
    // as interchangeable at the call site.
    const n = plan.class_bookings_per_week;
    included.push(
      n == null ? 'All group classes' : `${n} group ${n === 1 ? 'class' : 'classes'} per week`
    );
  } else {
    excluded.push('Group classes');
  }

  if (plan.can_book_pt) {
    included.push(
      plan.pt_sessions_per_month == null
        ? 'Personal training'
        : `${plan.pt_sessions_per_month} personal training ${
            plan.pt_sessions_per_month === 1 ? 'session' : 'sessions'
          } per month`
    );
  } else {
    excluded.push('Personal training');
  }

  return { included, excluded, isFullAccess: excluded.length === 0 };
}

/**
 * One line for a tight space — the membership card, a list row.
 *
 * Leads with what is missing when anything is, because that is the fact the
 * member needs and the one the screen has historically hidden. A plan with no
 * gaps says so plainly instead of listing three things nobody has to check.
 */
export function planAccessSummary(plan: MembershipPlanRow | null | undefined): string | null {
  const access = planAccess(plan);
  if (!access) return null;
  if (access.isFullAccess) return 'Full access';
  return `No ${access.excluded.map((e) => e.toLowerCase()).join(' or ')}`;
}
