import { useCallback, useEffect, useState } from 'react';
import AchievementUnlockOverlay from './AchievementUnlockOverlay';
import { type AchievementDef } from '../../data/achievements';
import {
  achievementByKey, listUnlocks, loadCatalogue, markSeen, syncAchievements,
} from '../../lib/api/achievements';
import { getCurrentMemberId } from '../../services/bookingService';

/**
 * Re-grades the signed-in user once per session and celebrates anything new.
 *
 * Mounted in both shells, so an unlock can surface wherever the user happens to
 * be. It works for trainers as well as members without being told which: the
 * catalogue lookup spans both sets, and `sync_my_achievements()` grades by the
 * caller's own `profiles.role`.
 *
 * The queue is fed from `seen = false` rather than from the sync's return
 * value. The sync only reports rows it *inserted*, so a badge earned in a
 * session the user closed before tapping through would otherwise be recorded
 * and never shown.
 *
 * **Seen is recorded on show, not on dismiss.** Tying it to the tap made
 * replay the default failure mode: any closed app, dropped connection or
 * swallowed error left the row unseen and the celebration came back on every
 * launch and every login, which is exactly what happened.
 */

/**
 * A long-standing member syncing for the first time can qualify for a dozen at
 * once. Twelve full-screen celebrations in a row is a chore, not a reward — so
 * the first few are shown and the remainder are marked seen and left to be
 * found in the gallery, which lists every one of them anyway.
 */
const MAX_CELEBRATIONS = 3;

export default function AchievementWatcher() {
  const [queue, setQueue] = useState<AchievementDef[]>([]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const uid = await getCurrentMemberId();
        if (!uid || cancelled) return;

        // The catalogue is a table since 0038, so it has to be in memory before
        // `achievementByKey` can name anything. Fetched in parallel with the
        // sync — they do not depend on each other.
        await Promise.all([syncAchievements(), loadCatalogue()]);
        const unlocks = await listUnlocks(uid);
        if (cancelled) return;

        const unseen = unlocks.filter((u) => !u.seen);
        if (unseen.length === 0) return;

        // Oldest first, so a cascade reads in the order it was earned.
        const defs = unseen
          .slice()
          .reverse()
          .map((u) => achievementByKey(u.achievement_key))
          // Undefined when the database is a migration ahead of this build.
          // Skipped rather than shown as a blank card.
          .filter((d): d is AchievementDef => d != null);

        setQueue(defs.slice(0, MAX_CELEBRATIONS));

        // Marked seen **here**, the moment they are shown — not when the member
        // taps through them.
        //
        // Tying it to dismissal made replay the default failure: close the app
        // mid-celebration, lose connection for a second, navigate away, or hit
        // any error inside the swallowed `.catch()`, and the badge stayed
        // unseen and came back on every launch and every login. The column is
        // called `seen`, and by this line they have been seen.
        //
        // Errors are logged rather than swallowed, because "the celebration
        // repeats forever" is exactly what a silent failure here looks like.
        markSeen(unseen.map((u) => u.achievement_key)).catch((err) => {
          console.error('Could not mark achievements as seen:', err);
        });
      } catch {
        // Never surfaced. A badge that failed to sync is not something to
        // interrupt someone's workout with, and every real number on screen is
        // unaffected.
      }
    })();

    return () => { cancelled = true; };
  }, []);

  // Purely advances the queue. Marking seen happens on show (above), so a
  // member who never taps through is not condemned to the same celebration on
  // every launch. A state updater must be pure anyway — the network call that
  // used to live in here was a side effect inside `setQueue`.
  const dismiss = useCallback(() => {
    setQueue((q) => q.slice(1));
  }, []);

  return (
    <AchievementUnlockOverlay
      def={queue[0] ?? null}
      remaining={Math.max(0, queue.length - 1)}
      onDismiss={dismiss}
    />
  );
}
