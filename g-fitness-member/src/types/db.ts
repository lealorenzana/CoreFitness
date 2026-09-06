// Row shapes for the Supabase schema (supabase/migrations/0001_schema.sql).
// Kept byte-identical between g-fitness-admin and g-fitness-member — there is no
// shared workspace to import a common package from. snake_case to match the
// Postgres column names exactly; src/lib/api/*.ts maps these to the app's
// existing camelCase UI types as each page is migrated off SharedStorage.

export type UserRole = 'admin' | 'trainer' | 'member';
export type ProfileStatus = 'active' | 'pending_approval' | 'suspended' | 'archived';
export type MembershipStatus = 'active' | 'expired' | 'frozen' | 'cancelled' | 'pending';
export type PlanTier = 'free' | 'freemium' | 'premium' | 'pro';
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
   * What the member is currently training for (0044):
   * 'bulking' | 'cutting' | 'maintaining', or NULL for not stated.
   *
   * This is the fact the body map spent three rewrites refusing to guess. It
   * turns "waist down 5 cm" from a number into either progress or a warning,
   * and only the member can supply it.
   */
  training_focus: string | null;
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
   * row at sign-up; see `lib/api/parkedAnswers.ts`.
   */
  onboarding_completed_at: string | null;
  /**
   * Activities picked in onboarding (0036). Feeds class recommendations.
   * Empty means "no preference expressed" — recommend nothing on this basis,
   * rather than everything.
   */
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
  /** The one-line title under their name, e.g. "Strength & Conditioning". */
  specialization: string | null;
  bio: string | null;
  availability: string | null;
  /** 0041. NULL = not stated, and renders as nothing rather than "0 years". */
  years_experience: number | null;
  /** 0041. Postgres text[] — arrays, not newline-delimited text, so nothing has
   *  to guess whether a separator is a real newline or a literal backslash-n
   *  the way `membership_plans.description` still forces every consumer to. */
  certifications: string[] | null;
  focus_areas: string[] | null;
  achievements: string | null;
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
  /** Who decided and in what capacity (0071). NULL before a decision, and on
   *  rows decided before the column existed. 'system' is an automatic expiry. */
  decided_by?: string | null;
  decided_by_role?: 'admin' | 'staff' | 'trainer' | 'system' | null;
  decided_at?: string | null;
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
  /** Optional picture the gym attached to an announcement (0065). NULL is
   *  normal — automated receipts and reminders never carry one. */
  image_url: string | null;
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

/* ═══════════════════════════════════════════════════════════════════════════
   Subscription gating and the engagement loop (migrations 0049-0055)
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * The catalogue of gateable app areas (0049).
 *
 * Rows arrive by migration only — the table has no INSERT policy for anyone,
 * because a feature key does something only if code checks it. `label` and
 * `description` are what the member sees on a lock card, so they are read
 * rather than written in the UI.
 */
export interface FeatureRow {
  key: string;
  label: string;
  description: string;
  default_free: boolean;
  default_freemium: boolean;
  default_premium: boolean;
  sort_order: number;
}

/** One cell of the plan x feature matrix the admin edits (0049). */
export interface PlanFeatureRow {
  plan_id: string;
  feature_key: string;
  enabled: boolean;
  /** Reserved for metered features. NULL = no ceiling. Nothing reads it yet. */
  quota: number | null;
}

/**
 * The exercise catalogue (0050). Admin-owned, because free text turns
 * "Bench Press", "bench" and "Benchpress" into three lifts and silently breaks
 * every history chart. Deleting one with logged sets is refused by the
 * database; the admin deactivates instead.
 */
export interface ExerciseRow {
  id: string;
  name: string;
  muscle_group: string;
  equipment: string;
  /** Measured in time/distance rather than reps and weight — changes the form. */
  is_timed: boolean;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

/** One recorded set (0050). Hangs off `workout_logs`, which is the session. */
export interface WorkoutSetRow {
  id: string;
  log_id: string;
  /** NULL when `custom_name` is used — a custom entry is not aggregated. */
  exercise_id: string | null;
  custom_name: string | null;
  set_number: number;
  reps: number | null;
  weight_kg: number | null;
  duration_seconds: number | null;
  distance_m: number | null;
  created_at: string;
}

/** What each action is worth (0051). Admin-editable; a double-points week is an UPDATE. */
export interface PointRuleRow {
  key: string;
  label: string;
  points: number;
  is_active: boolean;
  sort_order: number;
}

/**
 * The points ledger (0051). Append-only and **written only by SECURITY DEFINER
 * code** — no INSERT policy exists for any role, admin included. A UNIQUE on
 * (member, rule, source_table, source_id) is what makes a second award
 * impossible rather than merely unlikely.
 */
export interface PointLedgerRow {
  id: string;
  member_id: string;
  rule_key: string;
  /** Copied, not joined: re-pricing a rule must not restate what was earned. */
  points: number;
  source_table: string;
  source_id: string;
  created_at: string;
}

/** A reward points can buy (0051). NULL stock = unlimited; 0 = out of stock. */
export interface RewardRow {
  id: string;
  name: string;
  description: string | null;
  cost_points: number;
  stock: number | null;
  is_active: boolean;
  created_at: string;
}

export type RedemptionStatus = 'pending' | 'approved' | 'rejected' | 'fulfilled';

/** A claim on a reward (0051). Admin decides; staff can see but not approve. */
export interface RewardRedemptionRow {
  id: string;
  member_id: string;
  reward_id: string;
  /** Frozen at request time, so re-pricing cannot alter a pending request. */
  cost_points: number;
  status: RedemptionStatus;
  requested_at: string;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
}

/**
 * A gym challenge (0052). `metric_key` references `achievement_metrics`, but
 * only the twelve flagged `challengeable` — a streak or a tenure cannot be
 * counted inside a window honestly.
 */
export interface ChallengeRow {
  id: string;
  title: string;
  description: string | null;
  metric_key: string;
  target: number;
  starts_on: string;
  ends_on: string;
  reward_points: number;
  is_active: boolean;
  created_at: string;
}

/**
 * Who joined what (0052). `completed_on` is written **only** by
 * `settle_challenges()`; the table has no UPDATE policy for any role, because
 * whoever could hand out a completion could hand out its points.
 */
export interface ChallengeParticipantRow {
  challenge_id: string;
  member_id: string;
  joined_at: string;
  completed_on: string | null;
}

export type CredentialStatus = 'pending' | 'verified' | 'rejected';

/**
 * A trainer's certificate (0054). The file lives in a **private** bucket and is
 * reached only through a short-lived signed URL — it carries a legal name and
 * usually a licence number. Readable by that trainer and admin only, never
 * staff, never members. A trainer cannot set `status`: a trigger refuses it.
 */
export interface TrainerCredentialRow {
  id: string;
  trainer_id: string;
  title: string;
  /** `credentials/<uid>/<random>.<ext>` — never a public URL. */
  file_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  status: CredentialStatus;
  uploaded_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
}

/**
 * A preset goal that tracks itself (0055).
 *
 * `measured_as` is the rule in plain language and is shown on the card — a goal
 * whose definition is hidden is one you cannot trust when it says you failed.
 */
export interface GoalTemplateRow {
  key: string;
  label: string;
  description: string;
  measured_as: string;
  metric: string;
  /** Rolling window in days. 56 = the last eight weeks. */
  period_days: number;
  target_default: number;
  is_active: boolean;
  sort_order: number;
}
