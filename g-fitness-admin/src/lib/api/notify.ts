import { supabase } from '../supabaseClient';
import { addNotification } from './notifications';

/**
 * Tell a member something happened: write the record, then try to push it.
 *
 * Two channels, deliberately unequal.
 *
 * The `notifications` row is the **record** — the history of what happened to
 * this person's membership — and it is awaited. If it fails, the caller hears
 * about it. The push is the **alert**: best effort, never awaited by the
 * caller's critical path, and never allowed to throw. A member's booking must
 * not fail to approve because their phone uninstalled the app last week.
 *
 * That asymmetry is why the Edge Function does not write the row itself. Coupling
 * them would mean a member with push switched off silently loses the history
 * too, and the bell would disagree with what actually happened.
 *
 * Category muting lives server-side in send-push, not here — the client must
 * not be trusted to decide whether someone opted out.
 */

export type NotifyType = 'booking' | 'payment' | 'membership' | 'event' | 'system';

export interface NotifyInput {
  userId: string;
  type: NotifyType;
  title: string;
  message: string;
  /** Where tapping the notification should land, e.g. '/member/booking-history'. */
  actionUrl?: string;
  /**
   * Makes this notification un-repeatable.
   *
   * A partial unique index on `(user_id, metadata->>'dedupe')` (migration 0053)
   * rejects a second row with the same key, so a double-clicked Confirm button
   * cannot send a member two receipts for one payment. Checking "have I sent
   * this already" in JS instead would race itself — the reason 0053 used an
   * index rather than a `not exists`.
   *
   * Use a key derived from the *thing*, not the moment: `payment:<id>:paid`.
   */
  dedupe?: string;
}

/** Fire-and-forget push. Swallows everything — see the note above. */
export function pushOnly(input: NotifyInput): void {
  void supabase.functions
    .invoke('send-push', {
      body: {
        userId: input.userId,
        title: input.title,
        body: input.message,
        type: input.type,
        url: input.actionUrl ?? '/member/home',
      },
    })
    .catch(() => {
      /* Push is a courtesy. A dead endpoint, an unconfigured VAPID key, or an
         offline device must never surface as a failure of the thing the member
         actually did. send-push prunes dead subscriptions on its own. */
    });
}

/** Write the notification row (awaited), then push (not awaited). */
export async function notifyUser(input: NotifyInput): Promise<void> {
  try {
    await addNotification({
      user_id: input.userId,
      type: input.type,
      title: input.title,
      message: input.message,
      action_url: input.actionUrl ?? null,
      metadata: input.dedupe ? { dedupe: input.dedupe } : null,
    });
  } catch (err) {
    // 23505 on a deduped notification is the index doing its job: this exact
    // message has already been sent. That is success, not failure — the member
    // has the record, which is all the caller wanted. Anything else rethrows.
    const code = (err as { code?: string } | null)?.code;
    if (input.dedupe && code === '23505') return;
    throw err;
  }
  pushOnly(input);
}

/**
 * Same, for many recipients — used by the broadcast composer, which has already
 * written its own rows in one batch insert.
 *
 * Sent one at a time on purpose. The free tier gives a small number of
 * concurrent Edge Function invocations, and firing 200 at once gets most of them
 * throttled; a member who misses the push still has the row.
 */
export async function pushToMany(userIds: string[], input: Omit<NotifyInput, 'userId'>): Promise<void> {
  for (const userId of userIds) {
    pushOnly({ ...input, userId });
  }
}
