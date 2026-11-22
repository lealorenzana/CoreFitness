import type { PlatformGym } from '../lib/platform';

/** Where a gym stands, as a dot and a word (2026-11-22): the card, the quick view and the gym's page say it the same way. */
export function gymStatus(gym: PlatformGym): { label: string; tone: 'ok' | 'warn' | 'quiet' } {
  if (gym.lock_reason) {
    return {
      tone: gym.lock_reason === 'archived' ? 'quiet' : 'warn',
      label: gym.lock_reason === 'suspended' ? 'Suspended'
        : gym.lock_reason === 'archived' ? 'Archived'
        : gym.lock_reason === 'cancelled' ? 'Left Core Fitness'
        : gym.lock_reason === 'trial_ended' ? 'Trial ended, paused' : 'Overdue, read-only',
    };
  }
  return gym.owners === 0 || !gym.onboarded ? { tone: 'quiet', label: 'Setting up' } : { tone: 'ok', label: 'Live' };
}

/** `short` on a card, where the gym's name needs the room: one word, the whole phrase in its tooltip. */
const SHORT: Record<string, string> = { 'Overdue, read-only': 'Read-only', 'Trial ended, paused': 'Paused', 'Left Core Fitness': 'Left' };

export default function GymStatus({ gym, short }: { gym: PlatformGym; short?: boolean }) {
  const s = gymStatus(gym);
  return <span className={`gx-status ${s.tone}`} title={short ? s.label : undefined}><i aria-hidden="true" />{short ? SHORT[s.label] ?? s.label : s.label}</span>;
}
