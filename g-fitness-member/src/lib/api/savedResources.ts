import { assertWrote } from './mutate';
import { supabase } from '../supabaseClient';

/**
 * Free workouts a member saved for later, and whether they did them (0090).
 * Never gated, like the library itself.
 */
export interface SavedResource {
  resourceId: string;
  savedAt: string;
  doneAt: string | null;
}

/** Null when the table is missing (before 0090) — the screen hides saving then. */
export async function listSavedResources(memberId: string): Promise<SavedResource[] | null> {
  const { data, error } = await supabase
    .from('saved_resources')
    .select('resource_id, saved_at, done_at')
    .eq('member_id', memberId)
    .order('saved_at', { ascending: false });
  if (error) return null;
  return (data ?? []).map((r) => ({ resourceId: r.resource_id, savedAt: r.saved_at, doneAt: r.done_at }));
}

export async function saveResource(memberId: string, resourceId: string): Promise<void> {
  const { error } = await supabase
    .from('saved_resources')
    .upsert({ member_id: memberId, resource_id: resourceId }, { onConflict: 'member_id,resource_id', ignoreDuplicates: true });
  if (error) throw error;
}

export async function unsaveResource(memberId: string, resourceId: string): Promise<void> {
  const { data, error } = await supabase
    .from('saved_resources').delete()
    .eq('member_id', memberId).eq('resource_id', resourceId)
    .select('resource_id');
  if (error) throw error;
  assertWrote(data, 'That was not in your saved list.');
}

export async function setResourceDone(memberId: string, resourceId: string, done: boolean): Promise<void> {
  const { data, error } = await supabase
    .from('saved_resources').update({ done_at: done ? new Date().toISOString() : null })
    .eq('member_id', memberId).eq('resource_id', resourceId)
    .select('resource_id');
  if (error) throw error;
  assertWrote(data, 'Save it first, then mark it done.');
}
