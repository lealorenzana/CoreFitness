import { supabase } from '../supabaseClient';
import { assertWrote } from './mutate';

/**
 * The gym's waiver, from the owner's side (0119).
 *
 * **Published text cannot be edited** — a trigger refuses it, for everybody,
 * the table owner included. "Lea accepted this on 14 March" means nothing if
 * "this" can change in April. So the owner edits a *draft*, and publishing it
 * makes it the next version every member signs; earlier signatures keep
 * pointing at the words they were actually shown.
 */

export interface WaiverVersion {
  id: string;
  version: number;
  title: string;
  body: string;
  publishedAt: string | null;
}

export interface WaiverSignature {
  memberId: string;
  memberName: string;
  acceptedAt: string;
  version: number;
  flagged: boolean;
  /** question key -> answer, exactly as given. */
  parQ: Record<string, boolean>;
}

/**
 * Every version, newest first. Null before 0119 is pasted — the tab then says
 * so instead of offering an editor whose Save would fail.
 */
export async function listWaiverVersions(): Promise<WaiverVersion[] | null> {
  const { data, error } = await supabase
    .from('gym_waivers')
    .select('id, version, title, body, published_at')
    .order('version', { ascending: false });
  if (error) return null;
  return (data ?? []).map((r) => ({
    id: r.id as string, version: r.version as number, title: r.title as string,
    body: r.body as string, publishedAt: (r.published_at as string | null) ?? null,
  }));
}

/** Saves the draft, creating one if there is none. */
export async function saveWaiverDraft(title: string, body: string): Promise<void> {
  const { error } = await supabase.rpc('save_gym_waiver', { p_title: title, p_body: body });
  if (error) throw new Error(error.message);
}

/** Returns the version number now in force. */
export async function publishWaiver(): Promise<number> {
  const { data, error } = await supabase.rpc('publish_gym_waiver');
  if (error) throw new Error(error.message);
  return data as number;
}

export async function listWaiverSignatures(): Promise<WaiverSignature[] | null> {
  const { data, error } = await supabase.rpc('gym_waiver_signatures');
  if (error || !Array.isArray(data)) return null;
  return (data as {
    member_id: string; member_name: string; accepted_at: string; version: number;
    flagged: boolean; par_q: Record<string, boolean> | null;
  }[]).map((r) => ({
    memberId: r.member_id, memberName: r.member_name?.trim() || 'Member',
    acceptedAt: r.accepted_at, version: r.version, flagged: r.flagged, parQ: r.par_q ?? {},
  }));
}

export async function getWaiverRequired(): Promise<boolean | null> {
  const { data, error } = await supabase.from('gym_settings').select('waiver_required').maybeSingle();
  if (error || !data) return null;
  return Boolean((data as { waiver_required?: boolean }).waiver_required);
}

/**
 * Whether booking waits for a signature. Only booking: never check-in, never
 * the free workout library, and never a booking the desk makes for somebody.
 */
export async function setWaiverRequired(required: boolean): Promise<void> {
  const { data, error } = await supabase
    .from('gym_settings')
    .update({ waiver_required: required })
    .eq('id', true)
    .select('id');
  if (error) throw error;
  assertWrote(data, 'That could not be saved — only the gym owner can change it.');
}

export async function parqQuestions(): Promise<{ key: string; question: string }[]> {
  const { data, error } = await supabase.rpc('parq_questions');
  if (error || !Array.isArray(data)) return [];
  return (data as { key: string; question: string; sort_order: number }[])
    .sort((a, b) => a.sort_order - b.sort_order);
}
