import { supabase } from '../supabaseClient';
import type { ProfileStatus } from '../../types/db';

/**
 * Why an account was suspended, archived or reinstated (migration 0069).
 *
 * `profiles.status` records *that* it happened. This table records why, who
 * decided, and what it was before — the parts the desk actually needs three
 * weeks later, and the parts a column on `profiles` would have overwritten on
 * the next change.
 *
 * Append-only by design: there is **no INSERT policy for any role**, and the
 * only writer is `set_account_status()`, which refuses a blank reason. Correct
 * a mistake by recording the opposite event, exactly as attendance undo works.
 */
export interface AccountStatusEvent {
  id: string;
  profile_id: string;
  status: ProfileStatus;
  previous_status: ProfileStatus | null;
  /** NULL is normal — reinstating needs no justification, and rows backfilled
   *  by 0069 say in words that the original reason is not known. */
  reason: string | null;
  recorded_by: string | null;
  created_at: string;
}

/**
 * Sets an account's status and records why, in one transaction.
 *
 * Replaces a bare `update({ status })`, which could not carry a reason and —
 * having no `.select()` — reported success when RLS declined the write.
 *
 * The RPC raises on a blank reason for `suspended` and `archived`. Callers
 * should still collect one in the dialog: an error after the click is a worse
 * way to learn the rule than a disabled button before it.
 */
export async function setAccountStatus(
  profileId: string,
  status: ProfileStatus,
  reason?: string,
): Promise<void> {
  const { error } = await supabase.rpc('set_account_status', {
    p_profile: profileId,
    p_status: status,
    p_reason: reason?.trim() || null,
  });
  // An RPC that raises comes back as an error, so there is no zero-row case to
  // guard here — unlike the UPDATE this replaced.
  if (error) throw error;
}

/** Newest first. Empty means nothing has ever changed on this account. */
export async function listAccountStatusEvents(profileId: string): Promise<AccountStatusEvent[]> {
  const { data, error } = await supabase
    .from('account_status_events')
    .select('*')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as AccountStatusEvent[];
}

/**
 * The most recent reason an account is locked out, or NULL.
 *
 * NULL genuinely means "no reason on file" — an account suspended before 0069,
 * or one that is not suspended at all. The screen must say that rather than
 * inventing a plausible reason, which is the whole failure this table exists
 * to prevent.
 */
export async function currentLockoutReason(profileId: string): Promise<string | null> {
  const events = await listAccountStatusEvents(profileId).catch(() => []);
  const latest = events[0];
  if (!latest || (latest.status !== 'suspended' && latest.status !== 'archived')) return null;
  return latest.reason;
}
