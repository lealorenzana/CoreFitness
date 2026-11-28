import { supabase } from '../supabaseClient';

/**
 * A gym's own lists (0284): its areas (Studio, Gym floor) and its shop, reward, resource and badge categories.
 * Forms pick from them instead of typing, so a typo can no longer split a room or a filter. Writes go through the
 * definer functions only: add (owner and desk; a coach adds areas), rename (owner; every row using the old name
 * follows), retire (owner; old rows keep their name).
 */
export type ChoiceKind = 'area' | 'shop' | 'reward' | 'resource' | 'badge';
export interface GymChoice { id: string; kind: ChoiceKind; name: string; retired: boolean }

const clean = (m: string) => m.replace(/^.*?: /, '');

/** undefined = 0284 is not live yet, so a form falls back to typing. */
export async function listChoices(kind?: ChoiceKind): Promise<GymChoice[] | undefined> {
  let q = supabase.from('gym_choices').select('id, kind, name, retired_at, sort_order').order('sort_order').order('name');
  if (kind) q = q.eq('kind', kind);
  const { data, error } = await q;
  if (error) return undefined;
  return (data ?? []).map((r) => ({ id: r.id as string, kind: r.kind as ChoiceKind, name: r.name as string, retired: !!r.retired_at }));
}

export async function addChoice(kind: ChoiceKind, name: string): Promise<string> {
  const { data, error } = await supabase.rpc('gym_choice_add', { p_kind: kind, p_name: name });
  if (error) throw new Error(clean(error.message));
  return data as string;
}

/** Returns how many classes, items or badges now carry the new name. */
export async function renameChoice(id: string, name: string): Promise<number> {
  const { data, error } = await supabase.rpc('gym_choice_rename', { p_id: id, p_name: name });
  if (error) throw new Error(clean(error.message));
  return Number(data) || 0;
}

export async function retireChoice(id: string, retired: boolean): Promise<void> {
  const { error } = await supabase.rpc('gym_choice_retire', { p_id: id, p_retired: retired });
  if (error) throw new Error(clean(error.message));
}

/** The words each list goes by on screen. */
export const CHOICE_WORDS: Record<ChoiceKind, { one: string; many: string; usedBy: string }> = {
  area: { one: 'area', many: 'Areas', usedBy: 'classes, the timetable, events and equipment' },
  shop: { one: 'shop category', many: 'Shop categories', usedBy: 'shop items' },
  reward: { one: 'reward category', many: 'Reward categories', usedBy: 'rewards' },
  resource: { one: 'resource category', many: 'Resource categories', usedBy: 'workout resources' },
  badge: { one: 'badge group', many: 'Badge groups', usedBy: 'badges' },
};
