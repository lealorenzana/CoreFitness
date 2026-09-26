import { supabase } from './supabaseClient';

/**
 * Everything this app can do, in one file — and every one of these is a
 * SECURITY DEFINER function that refuses anyone outside `platform_admins`
 * (0106). There is no table read here at all: the platform sees gyms, counts
 * and its own decisions, never a gym's members (docs/TENANCY.md).
 */

export interface PlatformGym {
  id: string;
  name: string;
  slug: string;
  status: 'active' | 'suspended';
  /** A key in `platform_plans` (0108), not one of three fixed words any more. */
  plan: string;
  paid_until: string | null;
  lock_reason: 'suspended' | 'overdue' | null;
  members: number;
  staff: number;
  created_at: string;
  last_activity: string | null;
  /** Active admins. 0 means nobody can sign into this gym yet (0107). */
  owners: number;
  /** True once the owner finished first-run setup in the admin app (0107). */
  onboarded: boolean;
  /** From the plan row (0108). NULL price = the owner has not set one. */
  plan_name: string | null;
  price_monthly: string | null;
  /** Days until `paid_until`; negative is overdue, null is no date set. */
  days_left: number | null;
  max_members: number | null;
  /** Everything this gym has ever paid. */
  paid_total: string;
}

/** A tier of the service itself (0108). Prices are strings: numeric over the wire. */
export interface PlatformPlan {
  key: string;
  name: string;
  blurb: string | null;
  price_monthly: string | null;
  price_yearly: string | null;
  trial_days: number | null;
  max_members: number | null;
  max_staff: number | null;
  is_public: boolean;
  is_active: boolean;
  sort_order: number;
}

export interface PlatformFeature {
  key: string;
  label: string;
  description: string;
  sort_order: number;
}

export interface PlanFeatureCell {
  plan_key: string;
  feature_key: string;
  enabled: boolean;
}

export interface GymPayment {
  id: string;
  gym_id: string;
  amount: string;
  paid_on: string;
  covers_from: string | null;
  covers_until: string;
  method: string | null;
  reference: string | null;
  note: string | null;
  plan_key: string | null;
  created_at: string;
}

export interface RevenueMonth {
  month: string;
  gyms: number;
  payments: number;
  total: string;
}

export interface GymDue {
  id: string;
  name: string;
  plan: string;
  paid_until: string;
  days_left: number;
  lock_reason: 'suspended' | 'overdue' | null;
  members: number;
}

/** What approve-gym gives back. `password` is null when the owner already had an account. */
export interface OwnerInvited {
  id: string;
  email: string;
  gym: string;
  existing: boolean;
  password: string | null;
}

export interface Application {
  id: string;
  gym_name: string;
  owner_name: string;
  email: string;
  phone: string;
  address: string | null;
  member_estimate: number | null;
  message: string | null;
  status: 'pending' | 'approved' | 'rejected';
  reason: string | null;
  gym_id: string | null;
  created_at: string;
  /** Other applications from the same address or gym name (0111). */
  duplicates?: number;
  /** That address already owns a gym here — an existing customer, not a new one. */
  already_a_gym?: boolean;
}

export interface PlatformEvent {
  id: number;
  gym_id: string | null;
  action: string;
  summary: string;
  detail: Record<string, unknown> | null;
  created_at: string;
}

export interface CrashReport {
  id: string;
  gym_id: string | null;
  gym_name: string | null;
  app: string;
  route: string | null;
  message: string;
  /** Added in 0109; undefined against an older database. */
  stack?: string | null;
  build: string | null;
  created_at: string;
  resolved_at?: string | null;
}

const call = async <T>(fn: string, args?: Record<string, unknown>): Promise<T> => {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
};

export const listGyms = () => call<PlatformGym[]>('platform_gyms');
export const listApplications = (status?: string) =>
  call<Application[]>('platform_applications', { p_status: status ?? null });
export const listEvents = (limit = 100) => call<PlatformEvent[]>('platform_events_recent', { p_limit: limit });
/** Open reports only by default — a list that only grows stops being read (0109). */
export const listCrashes = (days = 14, includeResolved = false) =>
  call<CrashReport[]>('platform_crash_reports', { p_days: days, p_include_resolved: includeResolved });

export const createGym = (name: string, slug: string, applicationId?: string) =>
  call<string>('create_gym', { p_name: name, p_slug: slug, p_application: applicationId ?? null });
export const rejectApplication = (id: string, reason: string) =>
  call<void>('reject_application', { p_id: id, p_reason: reason });
export const setGymStatus = (gym: string, status: 'active' | 'suspended', reason: string) =>
  call<void>('set_gym_status', { p_gym: gym, p_status: status, p_reason: reason });
export const setGymPlan = (gym: string, plan: string, paidUntil: string | null) =>
  call<void>('set_gym_plan', { p_gym: gym, p_plan: plan, p_paid_until: paidUntil });

/**
 * Turn "Could not find the table 'public.platform_plan_features'" into the
 * sentence that actually helps.
 *
 * Migrations here are pasted by hand, one at a time, so an app deployed ahead
 * of its migration is a normal state rather than a fault — and PostgREST's own
 * wording ("schema cache") sends the reader looking for a cache problem that
 * does not exist. Every screen that needs a migration says which one.
 */
export function explain(err: unknown, migration: string): string {
  const message = err instanceof Error ? err.message : String(err);
  if (/schema cache|does not exist|Could not find the (table|function)/i.test(message)) {
    return `This screen needs migration ${migration}, which has not been pasted yet. `
         + `Paste supabase/migrations/${migration}_*.sql in the Supabase SQL editor, then `
         + `scripts/sql/verify/verify${migration}.sql, and reload. (${message})`;
  }
  return message;
}

// ---- what the service sells (0108) -------------------------------------------------
// These three tables are the only ones this app reads directly. They are the
// platform's own catalogue — no gym's data is in them — and RLS lets anyone
// signed in read them, because a gym's admin app shows a gym what its own plan
// includes from the same rows. Every write goes through a function that checks
// `platform_admins`, so reading is not writing.

export const listPlatformPlans = async (): Promise<PlatformPlan[]> => {
  const { data, error } = await supabase.from('platform_plans').select('*')
    .order('sort_order').order('name');
  if (error) throw new Error(error.message);
  return (data ?? []) as PlatformPlan[];
};

export const listPlatformFeatures = async (): Promise<PlatformFeature[]> => {
  const { data, error } = await supabase.from('platform_features').select('*').order('sort_order');
  if (error) throw new Error(error.message);
  return (data ?? []) as PlatformFeature[];
};

export const listPlanFeatures = async (): Promise<PlanFeatureCell[]> => {
  const { data, error } = await supabase.from('platform_plan_features').select('*');
  if (error) throw new Error(error.message);
  return (data ?? []) as PlanFeatureCell[];
};

/** Create or change a tier. A null price means "not decided", never free. */
export const savePlan = (p: {
  key: string; name: string; blurb: string | null;
  price_monthly: number | null; price_yearly: number | null; trial_days: number | null;
  max_members: number | null; max_staff: number | null;
  is_public: boolean; is_active: boolean; sort_order: number;
}) => call<string>('save_platform_plan', {
  p_key: p.key, p_name: p.name, p_blurb: p.blurb,
  p_price_monthly: p.price_monthly, p_price_yearly: p.price_yearly, p_trial_days: p.trial_days,
  p_max_members: p.max_members, p_max_staff: p.max_staff,
  p_is_public: p.is_public, p_is_active: p.is_active, p_sort: p.sort_order,
});

export const setPlanFeature = (plan: string, feature: string, enabled: boolean) =>
  call<void>('set_platform_plan_feature', { p_plan: plan, p_feature: feature, p_enabled: enabled });

/** Retires, never deletes — gyms point at these rows. Returns how many are on it. */
export const retirePlan = (key: string) => call<number>('retire_platform_plan', { p_key: key });

// ---- money -------------------------------------------------------------------------

export const recordPayment = (p: {
  gym: string; amount: number; coversUntil: string;
  paidOn?: string | null; coversFrom?: string | null;
  method?: string | null; reference?: string | null; note?: string | null;
}) => call<string>('record_gym_payment', {
  p_gym: p.gym, p_amount: p.amount, p_covers_until: p.coversUntil,
  p_paid_on: p.paidOn ?? null, p_covers_from: p.coversFrom ?? null,
  p_method: p.method ?? null, p_reference: p.reference ?? null, p_note: p.note ?? null,
});

export const listPayments = (gym?: string) =>
  call<GymPayment[]>('platform_gym_payments', { p_gym: gym ?? null });
export const listRevenue = (months = 12) => call<RevenueMonth[]>('platform_revenue', { p_months: months });
export const listDue = (withinDays = 14) => call<GymDue[]>('gyms_due', { p_within_days: withinDays });

/**
 * Give a gym its owner — the one thing in this app that is not a SQL function,
 * because creating a login needs the Auth admin key that only an Edge Function
 * may hold (supabase/functions/approve-gym).
 *
 * It answers with a temporary password when the account was created here. That
 * is the only time it ever exists in readable form, so the screen shows it once
 * and this app stores it nowhere.
 */
export async function inviteOwner(
  gymId: string,
  owner: { email: string; firstName: string; lastName: string; phone?: string },
): Promise<OwnerInvited> {
  // The token is passed by hand, not left to the client.
  //
  // supabase-js builds its Functions client with the *anon key* as the
  // Authorization header and swaps in the user's token when it sees a sign-in
  // or a refresh. A session restored from storage on page load is neither, so
  // after a reload `invoke` can still be sending the anon key — which reaches
  // the function, fails `getUser()`, and comes back as "Invalid session" while
  // every RPC on the same page works. Naming the header removes the question.
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('You are signed out. Sign in again and retry.');

  const { data, error } = await supabase.functions.invoke('approve-gym', {
    body: { gymId, ...owner },
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  // An Edge Function's own error message lives in the response body, not in
  // `error.message` — which only ever says "non-2xx status code".
  if (error) {
    const body = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new Error(body?.error ?? error.message);
  }
  return data as OwnerInvited;
}

/** "Maria Ferrer" → first and last. One box on the website's form, two columns here. */
export function splitName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/);
  if (parts.length < 2) return { firstName: parts[0] ?? '', lastName: '' };
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] };
}

/** Am I the platform owner? The one thing this app asks before showing anything. */
export async function isPlatformAdmin(): Promise<boolean> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return false;
  const { data, error } = await supabase.rpc('is_platform_admin');
  return !error && data === true;
}

/**
 * A link name from a gym's name: what `/join/<slug>` uses. Suggested, never
 * imposed — 0106 refuses anything but small letters, numbers and dashes, so a
 * suggestion that breaks the rule would be a dead end at the last step.
 */
export const slugFor = (name: string) =>
  name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

// ---- running the service (0109) ----------------------------------------------------

/** A gym's admins and staff. Never its members or coaches — see docs/TENANCY.md. */
export interface GymPerson {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  role: 'admin' | 'staff';
  status: string;
  is_owner: boolean;
}

export interface GymDetail {
  id: string; name: string; slug: string; status: string;
  plan: string; plan_name: string | null;
  paid_until: string | null; days_left: number | null;
  lock_reason: 'suspended' | 'overdue' | null;
  created_at: string; onboarded_at: string | null;
  members: number; staff: number; owners: number; trainers: number;
  classes: number; checkins_30d: number; payments_30d: number;
  paid_total: string; last_paid_on: string | null;
  address: string | null; phone: string | null; email: string | null;
}

export interface Overview {
  gyms: number; gyms_live: number; gyms_suspended: number; gyms_locked: number;
  gyms_unclaimed: number; gyms_unset_up: number;
  members: number; staff: number; trainers: number;
  checkins_30d: number; new_gyms_30d: number;
  applications_waiting: number; crashes_open: number;
  revenue_this_month: string; revenue_all_time: string;
  overdue_gyms: number;
}

export interface PlatformAdmin {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  is_me: boolean;
}

export const gymPeople = (gym: string) => call<GymPerson[]>('platform_gym_people', { p_gym: gym });
export const gymDetail = async (gym: string): Promise<GymDetail | null> => {
  const rows = await call<GymDetail[]>('platform_gym_detail', { p_gym: gym });
  return rows?.[0] ?? null;
};
export const renameGym = (gym: string, name: string, slug: string | null) =>
  call<void>('platform_rename_gym', { p_gym: gym, p_name: name, p_slug: slug });

export const resolveCrashes = (app: string, message: string) =>
  call<number>('resolve_crashes', { p_app: app, p_message: message });

export const getOverview = async (): Promise<Overview | null> => {
  const rows = await call<Overview[]>('platform_overview');
  return rows?.[0] ?? null;
};

export const listAdmins = () => call<PlatformAdmin[]>('list_platform_admins');
export const addAdmin = (email: string) => call<string>('add_platform_admin', { p_email: email });
export const removeAdmin = (user: string) => call<void>('remove_platform_admin', { p_user: user });

/**
 * Give a gym's owner or front desk a new temporary password (support's answer
 * to "I cannot get in"). Returned once, shown once, stored nowhere.
 *
 * The token is passed by hand for the same reason inviteOwner does it: a
 * session restored from storage is neither a sign-in nor a refresh, so
 * supabase-js can still be sending the anon key.
 */
export async function resetGymPassword(gymId: string, userId: string):
  Promise<{ email: string | null; isOwner: boolean; password: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('You are signed out. Sign in again and retry.');

  const { data, error } = await supabase.functions.invoke('reset-gym-password', {
    body: { gymId, userId },
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (error) {
    const body = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new Error(body?.error ?? error.message);
  }
  return data as { email: string | null; isOwner: boolean; password: string };
}

/** When the weekly backup last reported itself (0111). Null = it never has. */
export interface Backup { at: string; summary: string; days_ago: number }

export const lastBackup = async (): Promise<Backup | null> => {
  const rows = await call<Backup[]>('last_backup');
  return rows?.[0] ?? null;
};

// ---- support access a gym granted (0113) -------------------------------------------

export interface SupportGrant {
  id: string;
  gym_id: string;
  gym_name: string;
  reason: string | null;
  expires_at: string;
  first_used_at: string | null;
}

/** The gyms that have invited us in right now. Never any we let ourselves into. */
export const listSupportGrants = () => call<SupportGrant[]>('platform_support_grants');

/**
 * Look at a gym that granted access. Read-only for the whole session — the
 * database refuses every write while it is in use — and the visit is written
 * into that gym's own log, where its owner can read it.
 */
export const enterSupport = (gym: string) => call<string>('enter_support_session', { p_gym: gym });
export const leaveSupport = () => call<void>('leave_support_session');

export interface SentEmail {
  id: string; gym_id: string | null; gym_name: string | null;
  to_email: string; to_name: string | null; subject: string; kind: string;
  status: 'queued' | 'sent' | 'failed' | 'not_configured';
  error: string | null; sent_at: string | null; created_at: string;
}

/** Who was told what, and whether it arrived. Never the body — it can hold a credential. */
export const listEmails = (days = 30) => call<SentEmail[]>('platform_email_log', { p_days: days });

/**
 * Send one message. Records it first and always, then tries to deliver: with no
 * provider configured the reply says `configured: false` and the screen keeps
 * offering the copy-paste, because nothing here claims a mail went out that did not.
 */
export async function sendEmail(m: {
  to: string; toName?: string | null; subject: string; body: string;
  kind: 'owner_credentials' | 'password_reset' | 'invitation'
      | 'application_approved' | 'application_rejected' | 'test';
  gymId?: string | null;
}): Promise<{ id: string; configured: boolean; status: string; error?: string; message?: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('You are signed out. Sign in again and retry.');

  const { data, error } = await supabase.functions.invoke('send-email', {
    body: m,
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (error) {
    const body = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new Error(body?.error ?? error.message);
  }
  return data as { id: string; configured: boolean; status: string };
}

// ---- the demo data (0117) -------------------------------------------------------------

export interface DemoSummary {
  people: number; coaches: number; payments: number; attendance: number;
  classes: number; bookings: number; events: number; challenges: number; rewards: number;
}

/** What `scripts/demo-data` put into this deployment. Read-only. */
export const demoSummary = async (): Promise<DemoSummary | null> => {
  const rows = await call<DemoSummary[]>('demo_data_summary');
  return rows?.[0] ?? null;
};

/**
 * Remove everything the demo seeds created, and only that.
 *
 * **Irreversible, and there is no undo anywhere behind it** — no soft delete,
 * no archive, no backup this app can reach. The screen asks for the word to be
 * typed for that reason and not as ceremony.
 *
 * Returns the sentence the function composed, which names how many people went
 * — so the confirmation the operator reads is the database's own count rather
 * than the number this app showed them a minute ago.
 */
export const removeDemoData = () => call<string>('remove_demo_data');
