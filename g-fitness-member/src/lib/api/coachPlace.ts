import { supabase } from '../supabaseClient';

/**
 * One place per coach (0174). The 1-on-1 room's timeline is read from
 * `coach_timeline(room)`: the pair's chat (0131), the coach's notes
 * (trainer_feedback), the room's posts and classwork, and every routine or
 * program the coach wrote or edited for the member — newest first. Writing
 * stays where it always was (send_message, notes, posts), so old links work.
 */
export type TimelineKind = 'message' | 'note' | 'post' | 'assignment' | 'routine' | 'program';

export interface TimelineItem {
  kind: TimelineKind;
  id: string;
  at: string;
  authorId: string | null;
  body: string;
  refId: string | null;
  extra: Record<string, unknown>;
}

/** A page of the timeline, newest first. `before` pages back. Undefined = could not load (before 0174, or refused). */
export async function coachTimeline(roomId: string, before?: string): Promise<TimelineItem[] | undefined> {
  const { data, error } = await supabase.rpc('coach_timeline', { p_room: roomId, p_before: before ?? null, p_limit: 30 });
  if (error) return undefined;
  return ((data ?? []) as { kind: TimelineKind; id: string; at: string; author_id: string | null; body: string | null; ref_id: string | null; extra: Record<string, unknown> | null }[])
    .map((r) => ({ kind: r.kind, id: r.id, at: r.at, authorId: r.author_id, body: r.body ?? '', refId: r.ref_id, extra: r.extra ?? {} }));
}

export interface CoachExercise {
  exercise_id: string | null; custom_name: string | null; target_sets: number; target_reps: number | null;
  target_weight_kg: number | null; target_seconds: number | null; rest_seconds: number;
}

/** A coach writes (routineId null) or edits a routine for their own trainee. The database checks the rest. */
export async function coachSaveRoutine(memberId: string, routineId: string | null, name: string, notes: string | null, exercises: CoachExercise[]): Promise<string> {
  const { data, error } = await supabase.rpc('coach_save_routine', {
    p_member: memberId, p_routine: routineId, p_name: name, p_notes: notes, p_exercises: exercises,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export interface RoutineVersion { id: string; createdAt: string; name: string | null }

/** Earlier versions of the member's own routine (a coach's edit keeps the one before). */
export async function routineVersions(routineId: string): Promise<RoutineVersion[]> {
  const { data, error } = await supabase.from('workout_routine_versions')
    .select('id, created_at, snapshot').eq('routine_id', routineId).order('created_at', { ascending: false }).limit(10);
  if (error) return [];
  return ((data ?? []) as { id: string; created_at: string; snapshot: { name?: string } | null }[])
    .map((v) => ({ id: v.id, createdAt: v.created_at, name: v.snapshot?.name ?? null }));
}

export async function restoreRoutineVersion(versionId: string): Promise<void> {
  const { error } = await supabase.rpc('restore_routine_version', { p_version: versionId });
  if (error) throw new Error(error.message);
}
