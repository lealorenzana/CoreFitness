/**
 * Pulls a human-readable message out of anything thrown.
 *
 * Supabase rejects with a `PostgrestError` — a **plain object** `{ message,
 * details, hint, code }`, not an `Error` instance. So the common
 * `err instanceof Error ? err.message : 'Something failed'` pattern silently
 * discards every database and RLS error and shows the generic fallback instead,
 * which is exactly the message you need when a policy blocks a write.
 */
/**
 * Postgres error codes worth translating.
 *
 * A member should never read "new row violates row-level security policy for
 * table notifications (42501)". It names an internal table, tells them nothing
 * they can act on, and reads as a crash. The raw text still reaches the console
 * for whoever is debugging — it just doesn't reach the screen.
 */
const CODE_MESSAGES: Record<string, string> = {
  // RLS refused the write. Almost always a permission the account genuinely
  // lacks, or a policy that has drifted — see migration 0023.
  '42501': "You don't have permission to do that. If you think you should, ask the gym to check your account.",
  '23505': 'That already exists.',
  '23503': "That refers to something which no longer exists — try reloading.",
  'PGRST301': 'Your session has expired. Please sign in again.',
};

export function errorMessage(err: unknown, fallback = 'Something went wrong'): string {
  if (err instanceof Error) return err.message;

  if (typeof err === 'object' && err !== null) {
    const e = err as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };

    const code = typeof e.code === 'string' ? e.code : '';
    if (code && CODE_MESSAGES[code]) {
      // Keep the original where a developer will see it, not the member.
      console.error('Supabase error', code, e.message, e.details, e.hint);
      return CODE_MESSAGES[code];
    }

    const parts = [e.message, e.details, e.hint].filter(
      (p): p is string => typeof p === 'string' && p.length > 0
    );
    if (parts.length > 0) {
      return `${parts.join(' — ')}${code ? ` (${code})` : ''}`;
    }
  }

  if (typeof err === 'string' && err) return err;
  return fallback;
}
