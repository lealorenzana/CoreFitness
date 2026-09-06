/**
 * The one thing every state-changing write in this codebase has to do.
 *
 * ## The bug this exists to stop
 *
 * PostgREST returns **no error** for an UPDATE or DELETE that matched zero
 * rows. RLS does not reject a write it disallows — it simply narrows the set of
 * rows the statement can see, and a statement that matches nothing succeeds.
 *
 * So `const { error } = await supabase.from(t).update(x).eq('id', id)` reports
 * success when the row was invisible, already changed, or forbidden. The user
 * sees a green toast over an unchanged database.
 *
 * This has been found and fixed one call site at a time, repeatedly:
 *
 *   * 0033 — onboarding answers written to a row that did not exist yet
 *   * 0035 — admin "Undo check-in"
 *   * the trainer photo that reported "Photo updated" and left `photo_url` NULL
 *   * `cancelOwnBooking`, which released no seat and said it had
 *
 * An audit across both apps found 111 writes, of which 91 had no guard.
 *
 * ## How to use it
 *
 * Add `.select('id')` to the chain — which turns it into `UPDATE … RETURNING`,
 * so a zero-row result becomes observable — then pass the rows here:
 *
 * ```ts
 * const { data, error } = await supabase
 *   .from('memberships').update(updates).eq('id', id).select('id');
 * if (error) throw error;
 * assertWrote(data, 'That membership could not be updated.');
 * ```
 *
 * ## Write the message for whoever reads it
 *
 * A zero-row write is almost never a bug the user can act on by retrying, so
 * "Something went wrong" wastes the one sentence available. Say what did not
 * happen and what the likely cause is: someone else changed it first, or this
 * account may not be allowed to.
 *
 * ## When NOT to use it
 *
 * Not every write. Marking a notification read, clearing a push subscription on
 * sign-out, and similar best-effort writes are allowed to match nothing — the
 * row may have been deleted from another device, and interrupting the user over
 * it would be worse than the silence. Those sites are deliberately unguarded
 * and `docs/DATA_ACCESS.md` lists which and why.
 *
 * The test is: **would the user be misled by being told this worked?** If yes,
 * guard it.
 */
export function assertWrote(rows: unknown[] | null | undefined, failure: string): void {
  if (!rows || rows.length === 0) throw new Error(failure);
}

/**
 * Same, for a write expected to return exactly one row via `.single()`.
 *
 * `.single()` already raises PGRST116 when nothing matched, so this is about
 * the *message*: that error reads "JSON object requested, multiple (or no) rows
 * returned", which is not a sentence to put in front of a receptionist.
 */
export function assertRow<T>(row: T | null | undefined, failure: string): T {
  if (row == null) throw new Error(failure);
  return row;
}
