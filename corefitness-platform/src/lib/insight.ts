import { supabase } from './supabaseClient';

/**
 * 0140: capacity over time, the searchable activity log, what each gym uses,
 * and the fenced gym export. Every function here is platform-only in SQL; a
 * gym owner calling one gets nothing (or, for the export, a refusal).
 */

const call = async <T>(fn: string, args?: Record<string, unknown>): Promise<T> => {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  return data as T;
};
/** bigint columns arrive as strings; the screens do arithmetic on them. */
const nums = <T,>(rows: T[], keys: (keyof T)[]): T[] => (rows ?? []).map((r) => {
  const o = { ...r } as Record<string, unknown>;
  for (const k of keys) o[k as string] = o[k as string] === null ? null : Number(o[k as string]);
  return o as T;
});

export interface CapacityDay { day: string; db_bytes: number; storage_bytes: number; storage_objects: number; mau: number }
export interface CapacityDetail { kind: 'table' | 'bucket' | 'file'; key: string; label: string; used: number; n: number | null }
export interface GymFootprint { gym_id: string; name: string; rows: number; files: number; file_bytes: number }
export interface LoggedEvent {
  id: number; gym_id: string | null; gym_name: string | null; action: string; summary: string;
  detail: Record<string, unknown> | null; actor_name: string | null; created_at: string; total: number;
}
export interface GymUse { gym_id: string; feature: string; n: number }
export interface GymExport { gym: string; gym_id: string; exported_at: string; tables: Record<string, Record<string, unknown>[]> }

/** Once a Manila day, on opening Capacity. Never throws — a missing 0140 just means no trend. */
export const snapshotCapacity = () => supabase.rpc('snapshot_capacity').then(() => undefined, () => undefined);
export const capacityHistory = async (days = 90) =>
  nums(await call<CapacityDay[]>('platform_capacity_history', { p_days: days }), ['db_bytes', 'storage_bytes', 'storage_objects', 'mau']);
export const capacityDetails = async () => nums(await call<CapacityDetail[]>('platform_capacity_details'), ['used', 'n']);
export const gymFootprint = async () => nums(await call<GymFootprint[]>('platform_gym_footprint'), ['rows', 'files', 'file_bytes']);

export interface EventFilter { q?: string; gym?: string | null; action?: string | null; from?: string | null; to?: string | null; limit?: number; offset?: number }
export const searchEvents = async (f: EventFilter) =>
  nums(await call<LoggedEvent[]>('platform_events_search', {
    p_q: f.q?.trim() || null, p_gym: f.gym || null, p_action: f.action || null, p_from: f.from || null, p_to: f.to || null,
    p_limit: f.limit ?? 50, p_offset: f.offset ?? 0 }), ['total']);
export const eventActions = async () => nums(await call<{ action: string; n: number }[]>('platform_event_actions'), ['n']);

export const gymUsage = async (days = 30) => nums(await call<GymUse[]>('platform_gym_usage', { p_days: days }), ['n']);

/**
 * The AI coach per gym (0147): messages, tokens, and an estimated spend at the
 * coach model's list price, in US dollars. Counts only — nothing per member,
 * never a word of any conversation.
 */
export interface GymAiUse { gym_id: string; messages: number; tokens_in: number; tokens_out: number; est_cost_usd: number }
export const aiUsage = async (days = 30) =>
  nums(await call<GymAiUse[]>('platform_ai_usage', { p_days: days }), ['messages', 'tokens_in', 'tokens_out', 'est_cost_usd']);
/** `$1,234.56`, or `<$0.01` for a real but sub-cent figure. */
export const usd = (v: number) => (v > 0 && v < 0.01 ? '<$0.01'
  : '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
/** PostgREST's "not in the schema cache" and Postgres's "undefined function" — a migration not yet pasted. */
export const isMissingFunction = (e: unknown) => ['PGRST202', '42883'].includes((e as { code?: string })?.code ?? '');

/** Null when export is open for this gym; otherwise the database's sentence saying why not. */
export const exportAllowed = (gym: string) => call<string | null>('gym_export_allowed', { p_gym: gym });
export const exportGym = (gym: string) => call<GymExport>('platform_export_gym', { p_gym: gym });

/** The features platform_gym_usage() counts, in the order the screens show them. */
export const USAGE_FEATURES: { key: string; label: string; tip: string }[] = [
  { key: 'checkins', label: 'Check-ins', tip: 'Visits recorded at the desk or the kiosk' },
  { key: 'classes', label: 'Classes', tip: 'Class spots booked by members or the desk' },
  { key: 'pt', label: '1-on-1', tip: 'Personal training sessions booked' },
  { key: 'workouts', label: 'Workouts', tip: 'Workouts members logged in the app' },
  { key: 'programs', label: 'Programs', tip: "Members who started one of the gym's programs" },
  { key: 'rooms', label: 'Rooms', tip: 'Coaching room posts by trainers' },
  { key: 'chat', label: 'Chat', tip: 'Messages between members and their coaches — counted, never read' },
  { key: 'shop', label: 'Shop', tip: 'Sales rung up at the counter' },
  { key: 'rewards', label: 'Rewards', tip: "Points spent on the gym's rewards" },
  { key: 'squads', label: 'Squads', tip: 'Squads members formed' },
  { key: 'referrals', label: 'Referrals', tip: 'Friends referred by members' },
  { key: 'photos', label: 'Photos', tip: 'Progress photos members took — counted, never seen' },
  { key: 'payments', label: 'Payments', tip: 'Member payments the desk recorded' },
  { key: 'coach', label: 'AI coach', tip: 'Messages members sent the AI coach — counted, never read' },
];
