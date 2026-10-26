import { getOpenRoutineSession, getRoutine, startRoutineSession } from './api/routines';

/**
 * Where "Start" on today's planned routine goes — shared by Today and Train so
 * the two buttons can never do different things.
 *
 * An open workout is resumed rather than a second one started; a routine that
 * has been deleted since it was planned sends the member to their plan with a
 * sentence saying why. Returns the path to open, or throws that sentence.
 */
export async function startPlannedRoutine(memberId: string, routineId: string): Promise<string> {
  const open = await getOpenRoutineSession(memberId);
  if (open) return `/member/track/session/${open.logId}`;
  const routine = await getRoutine(routineId);
  if (!routine) throw new Error('That routine is gone — pick another in your plan.');
  return `/member/track/session/${await startRoutineSession(memberId, routine)}`;
}
