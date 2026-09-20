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
  plan: 'trial' | 'standard' | 'premium';
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
  build: string | null;
  created_at: string;
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
export const listCrashes = (days = 14) => call<CrashReport[]>('platform_crash_reports', { p_days: days });

export const createGym = (name: string, slug: string, applicationId?: string) =>
  call<string>('create_gym', { p_name: name, p_slug: slug, p_application: applicationId ?? null });
export const rejectApplication = (id: string, reason: string) =>
  call<void>('reject_application', { p_id: id, p_reason: reason });
export const setGymStatus = (gym: string, status: 'active' | 'suspended', reason: string) =>
  call<void>('set_gym_status', { p_gym: gym, p_status: status, p_reason: reason });
export const setGymPlan = (gym: string, plan: string, paidUntil: string | null) =>
  call<void>('set_gym_plan', { p_gym: gym, p_plan: plan, p_paid_until: paidUntil });

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
  const { data, error } = await supabase.functions.invoke('approve-gym', {
    body: { gymId, ...owner },
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
