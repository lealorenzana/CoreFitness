// Row shapes for the Supabase schema (supabase/migrations/0001_schema.sql).
// Kept byte-identical between g-fitness-admin and g-fitness-member — there is no
// shared workspace to import a common package from. snake_case to match the
// Postgres column names exactly; src/lib/api/*.ts maps these to the app's
// existing camelCase UI types as each page is migrated off SharedStorage.

export type UserRole = 'admin' | 'trainer' | 'member';
export type ProfileStatus = 'active' | 'pending_approval' | 'suspended' | 'archived';
export type MembershipStatus = 'active' | 'expired' | 'frozen' | 'cancelled' | 'pending';
export type PlanTier = 'free' | 'freemium' | 'premium';
export type BookingStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export type PaymentStatus = 'completed' | 'pending' | 'failed';
export type CheckinMethod = 'qr' | 'manual';
export type ClassLevel = 'beginner' | 'intermediate' | 'advanced' | 'all_levels';

export interface ProfileRow {
  id: string;
  role: UserRole;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  photo_url: string | null;
  status: ProfileStatus;
  created_at: string;
}

export interface MemberProfileRow {
  profile_id: string;
  gym_id: string | null;
  address: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_relationship: string | null;
  qr_code: string | null;
  experience_level: string | null;
  /**
   * A birth date, never a stored age (0031). An `age` column is correct for one
   * year and then quietly lies; `age_years()` derives it on read.
   */
  date_of_birth: string | null;
  /** 'male' | 'female' | 'prefer_not_to_say', or null for pre-0031 members. */
  gender: string | null;
  /**
   * When onboarding was finished or skipped (0033). NULL = not yet.
   *
   * Replaced a `localStorage` flag — but until 0036 the write still could not
   * land, because this row was created at *approval* and onboarding runs before
   * that, so the UPDATE matched zero rows and reported success. 0036 creates the
   * row at sign-up.
   */
  onboarding_completed_at: string | null;
  /** Activities picked in onboarding (0036). Feeds class recommendations. */
  interests: string[];
  created_at: string;
}

/** A member's weekly training plan — one row per chosen weekday (0030). */
export interface GymPlanRow {
  id: string;
  member_id: string;
  /** 0 = Sunday, matching `extract(dow …)`. */
  day_of_week: number;
  /** Local wall-clock 'HH:MM:SS'. */
  remind_at: string;
  active: boolean;
  /** Set by `send_due_gym_reminders()`; makes the nudge once-a-day. */
  last_reminded_on: string | null;
  created_at: string;
}

export interface TrainerProfileRow {
  profile_id: string;
  specialization: string | null;
  bio: string | null;
  availability: string | null;
}

export interface MembershipPlanRow {
  id: string;
  name: string;
  tier: PlanTier;
  price: number;
  /** Days a payment buys. NULL = the plan does not expire (0024) — the free
   *  tier, which used to store 3650 days and render as a decade-long countdown. */
  duration_days: number | null;
  description: string | null;
  is_active: boolean;
  /** What this plan includes (0017). Configured per plan by the admin, not
   *  inferred from `tier` — the tier is a label, not a hidden rulebook. */
  can_book_classes: boolean;
  can_book_pt: boolean;
  /** NULL means unlimited. The boolean above carries the on/off switch. */
  class_bookings_per_week: number | null;
  pt_sessions_per_month: number | null;
  created_at: string;
}

export interface MembershipRow {
  id: string;
  member_id: string;
  plan_id: string;
  status: MembershipStatus;
  start_date: string | null;
  expiry_date: string | null;
  /**
   * Lifetime membership (0024). Distinguishes `expiry_date === null` meaning
   * "never runs out" from `expiry_date === null` meaning "not activated yet",
   * which is what a pending registration looks like.
   */
  never_expires: boolean;
  /** Date the freeze began (0017). Needed to credit the days back on unfreeze. */
  frozen_at: string | null;
  /** Freezes used this period (0018). Resets on renewal — a renewal is a new row. */
  freeze_count: number;
  created_at: string;
  updated_at: string;
}

export interface PaymentRow {
  id: string;
  member_id: string;
  membership_id: string | null;
  amount: number;
  method: string;
  status: PaymentStatus;
  due_date: string | null;
  invoice_number: string | null;
  notes: string | null;
  recorded_by: string | null;
  /** Business date the cash was received (0008). Revenue is computed from this. */
  paid_on: string;
  /** Audit timestamp: when the row was written. Never the same question as paid_on. */
  created_at: string;
}

export interface ClassRow {
  id: string;
  name: string;
  trainer_id: string | null;
  level: ClassLevel;
  capacity: number;
  location: string | null;
  class_type: string | null;
  scheduled_at: string | null;
  duration_minutes: number;
  created_at: string;
}

export interface BookingRow {
  id: string;
  member_id: string;
  class_id: string;
  status: BookingStatus;
  requested_at: string;
  approved_at: string | null;
  rejected_at: string | null;
  approved_by: string | null;
}

export interface AttendanceRow {
  id: string;
  member_id: string;
  gym_id: string | null;
  check_in_time: string;
  method: CheckinMethod;
  recorded_by: string | null;
  /** What the member trained (0018). NULL on check-ins recorded before the
   *  field existed — never back-filled with a guess. */
  activity: string | null;
}

export interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  action_url: string | null;
  metadata: Record<string, unknown> | null;
  read: boolean;
  /**
   * Inbox state (0029). Both hide the row from the bell, and they are not the
   * same thing: `cleared_at` is "out of my way" and the row stays in the inbox
   * list; `archived_at` is "dealt with" and moves it to Archived. Deleting is
   * still a real DELETE and only happens from the full-list multi-select.
   */
  archived_at: string | null;
  cleared_at: string | null;
  created_at: string;
}

export interface PendingRegistrationRow {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  requested_plan_id: string | null;
  auth_user_id: string | null;
  /**
   * Collected at sign-up and parked here until approval (0031). A
   * self-registering member has no `member_profiles` row yet — the trigger
   * writes `profiles` + this queue entry, and approval is what creates the
   * member row and copies these across.
   */
  date_of_birth: string | null;
  gender: string | null;
  address: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_relationship: string | null;
  created_at: string;
}
