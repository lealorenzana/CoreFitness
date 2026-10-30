import { supabase } from '../supabaseClient';

/**
 * The owner or desk's reason for something that undoes or changes money (0219,
 * `record_reason()`): written to the activity log beside the action, so the
 * Activity page shows who did it, when — and why.
 *
 * The reason is a record, not a gate: the action has already happened when this
 * runs. Before 0219 is pasted the function does not exist; that one case is let
 * go quietly rather than showing an error over an action that succeeded.
 */
export async function recordReason(input: {
  action: string;
  subjectType: string;
  subjectId: string | null;
  memberId?: string | null;
  summary: string;
  reason: string;
}): Promise<void> {
  const { error } = await supabase.rpc('record_reason', {
    p_action: input.action, p_subject_type: input.subjectType, p_subject_id: input.subjectId,
    p_member: input.memberId ?? null, p_summary: input.summary, p_reason: input.reason.trim(),
  });
  if (error && error.code !== 'PGRST202') throw new Error(error.message);
}

/** 3 to 300 characters, the same rule `record_reason()` checks. */
export function reasonProblem(reason: string): string | null {
  const n = reason.trim().length;
  if (n < 3) return 'Say why, in a few words.';
  if (n > 300) return 'Keep it under 300 characters.';
  return null;
}

/** ConfirmDialog's `reason` field for the actions that ask why (the same words everywhere). */
export const REASON_FIELD = {
  label: 'Reason',
  placeholder: 'A few words',
  required: true,
  hint: 'Kept in Activity with your name and the time.',
} as const;
