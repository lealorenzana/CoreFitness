import { supabase } from '../supabaseClient';

/** The gym's equipment (0184). */
export type EquipmentStatus = 'available' | 'repair' | 'soon';
export interface EquipmentItem {
  id: string; name: string; category: string; photoUrl: string | null; quantity: number;
  locationNote: string | null; status: EquipmentStatus; notes: string | null;
  exercises: { id: string; name: string }[];
}

export const CATEGORY_WORDS: Record<string, string> = {
  cardio: 'Cardio', machines: 'Machines', free_weights: 'Free weights', benches_racks: 'Benches and racks',
  functional: 'Functional', other: 'Other',
};
export const STATUS_WORDS: Record<EquipmentStatus, string> = { available: 'Available', repair: 'Under repair', soon: 'Coming soon' };

/** NULL on a failed read (or before 0184), so the screen can say so. */
export async function listEquipment(): Promise<EquipmentItem[] | null> {
  const { data, error } = await supabase.from('gym_equipment')
    .select('id, name, category, photo_url, quantity, location_note, status, notes, sort_order, equipment_exercises(exercise_id, exercises(id, name))')
    .order('category').order('sort_order').order('name');
  if (error) return null;
  return ((data ?? []) as unknown as {
    id: string; name: string; category: string; photo_url: string | null; quantity: number; location_note: string | null;
    status: EquipmentStatus; notes: string | null; equipment_exercises: { exercises: { id: string; name: string } | null }[] | null;
  }[]).map((r) => ({
    id: r.id, name: r.name, category: r.category, photoUrl: r.photo_url, quantity: r.quantity, locationNote: r.location_note,
    status: r.status, notes: r.notes,
    exercises: (r.equipment_exercises ?? []).flatMap((x) => (x.exercises ? [x.exercises] : [])),
  }));
}

/** The items at this gym that an exercise uses. Empty before 0184 or with none. */
export async function equipmentForExercise(exerciseId: string): Promise<{ id: string; name: string; locationNote: string | null; status: EquipmentStatus }[]> {
  const { data, error } = await supabase.from('equipment_exercises')
    .select('gym_equipment(id, name, location_note, status)').eq('exercise_id', exerciseId);
  if (error) return [];
  return ((data ?? []) as unknown as { gym_equipment: { id: string; name: string; location_note: string | null; status: EquipmentStatus } | null }[])
    .flatMap((r) => (r.gym_equipment ? [{ id: r.gym_equipment.id, name: r.gym_equipment.name, locationNote: r.gym_equipment.location_note, status: r.gym_equipment.status }] : []));
}

/** Items this member has an open report on. */
export async function myOpenReports(): Promise<Set<string>> {
  const { data, error } = await supabase.from('equipment_reports').select('equipment_id').eq('status', 'open');
  if (error) return new Set();
  return new Set(((data ?? []) as { equipment_id: string }[]).map((r) => r.equipment_id));
}

export async function reportEquipment(itemId: string, note: string): Promise<void> {
  const { error } = await supabase.rpc('report_equipment', { p_item: itemId, p_note: note });
  if (error) throw new Error(error.message);
}
