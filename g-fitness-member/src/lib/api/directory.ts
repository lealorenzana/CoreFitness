import { supabase } from '../supabaseClient';

/**
 * The three read-only views from migration 0016.
 *
 * These exist because a member needs facts that the table policies correctly
 * refuse them: a trainer's name (lives in `profiles`), how full a class is
 * (needs everyone's `bookings`), and when a trainer is already committed (needs
 * everyone's `pt_sessions`). Each view carries the needed columns and nothing
 * identifying — see the migration for the reasoning.
 *
 * Read-only by construction. Writes still go through the real tables and the
 * real policies.
 */

export interface PublicTrainer {
  id: string;
  first_name: string;
  last_name: string;
  photo_url: string | null;
  specialization: string | null;
  bio: string | null;
  availability: string | null;
  /** Background, added to the view in 0041. Every field is the trainer's own
   *  statement about themselves and every one is optional — a coach who has
   *  filled nothing in renders exactly as they did before, not as a page of
   *  empty headings. */
  years_experience: number | null;
  certifications: string[] | null;
  focus_areas: string[] | null;
  achievements: string | null;
}

export interface ClassAvailability {
  class_id: string;
  capacity: number;
  booked_count: number;
}

export interface BusySlot {
  trainer_id: string;
  starts_at: string;
  duration_minutes: number;
}

export async function listPublicTrainers(): Promise<PublicTrainer[]> {
  const { data, error } = await supabase
    .from('public_trainers')
    .select('*')
    .order('first_name', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function listClassAvailability(): Promise<ClassAvailability[]> {
  const { data, error } = await supabase.from('class_availability').select('*');
  if (error) throw error;
  return data ?? [];
}

/** Every commitment already on a trainer's book. Feeds computeOpenSlots(). */
export async function listTrainerBusySlots(trainerId: string): Promise<BusySlot[]> {
  const { data, error } = await supabase
    .from('trainer_busy_slots')
    .select('*')
    .eq('trainer_id', trainerId);
  if (error) throw error;
  return data ?? [];
}

export function trainerName(t: Pick<PublicTrainer, 'first_name' | 'last_name'>): string {
  return `${t.first_name} ${t.last_name}`.trim();
}
