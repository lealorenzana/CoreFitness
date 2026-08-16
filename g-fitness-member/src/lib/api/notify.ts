import { supabase } from '../supabaseClient';

/**
 * Best-effort push, for the trainer app.
 *
 * The member app's copy of this is push-only: only trainers send anything from
 * here, and the `notifications` row is already written by the caller. The admin
 * app has the fuller version with `notifyUser`.
 *
 * Never throws. A push that fails must not turn "recommendation sent" into an
 * error — the member still has the row in their bell, which is the record.
 */

export type NotifyType = 'booking' | 'payment' | 'membership' | 'event' | 'system';

export function pushOnly(input: {
  userId: string;
  type: NotifyType;
  title: string;
  message: string;
  actionUrl?: string;
}): void {
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
      /* See above — deliberately silent. send-push prunes dead endpoints. */
    });
}
