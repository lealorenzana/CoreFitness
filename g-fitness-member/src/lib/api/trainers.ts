import { supabase } from '../supabaseClient';
import type { ProfileRow, TrainerProfileRow } from '../../types/db';

export interface TrainerWithProfile {
  profile: ProfileRow;
  trainer: TrainerProfileRow;
}

export async function listTrainers(): Promise<TrainerWithProfile[]> {
  const { data, error } = await supabase.from('trainer_profiles').select('*, profiles!inner(*)');
  if (error) throw error;
  return (data ?? []).map((row) => {
    const { profiles, ...trainer } = row as TrainerProfileRow & { profiles: ProfileRow };
    return { profile: profiles, trainer: trainer as TrainerProfileRow };
  });
}

export async function getTrainer(id: string): Promise<TrainerWithProfile | null> {
  const { data, error } = await supabase
    .from('trainer_profiles')
    .select('*, profiles!inner(*)')
    .eq('profile_id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { profiles, ...trainer } = data as TrainerProfileRow & { profiles: ProfileRow };
  return { profile: profiles, trainer: trainer as TrainerProfileRow };
}

export async function updateTrainerProfile(
  id: string,
  updates: Partial<Omit<TrainerProfileRow, 'profile_id'>>
): Promise<void> {
  const { error } = await supabase.from('trainer_profiles').update(updates).eq('profile_id', id);
  if (error) throw error;
}

/**
 * Admin-only: creates a real Supabase Auth account + profile for a new trainer via
 * the create-trainer Edge Function, so the admin's own browser session is never
 * touched (a client-side supabase.auth.signUp would sign the admin's browser out).
 */
export async function createTrainer(input: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
  specialization?: string;
  bio?: string;
  availability?: string;
}): Promise<{ id: string; email: string }> {
  const { data, error } = await supabase.functions.invoke('create-trainer', {
    body: input,
  });
  if (error) throw error;
  return data as { id: string; email: string };
}
