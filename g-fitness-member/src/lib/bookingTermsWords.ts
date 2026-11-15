import { minutesWords, type BookingRules } from './api/bookingRules';

/**
 * Terms §5, cancelling, repeats and no-shows (0260): the signed-in member's gym's own rules, read from
 * `gym_booking_rules()` — never typed in. A reader with no session (or before 0260) is told each gym sets its own.
 * The clause text is the Terms page's; these build its sentences from the numbers, and a change of wording here is
 * a change of the Terms, so its date in lib/legalVersions.ts moves with it.
 */

export function cancelTermsLine(r: BookingRules | null): string {
  if (!r) return 'Each gym sets how close to the start you may still cancel in the app, and what a late cancel means. The app shows your gym’s rule before you confirm a cancel.';
  const w = [r.classCancelMinutes, r.ptCancelMinutes, r.slotCancelMinutes];
  if (w.every((m) => m === 0)) {
    return 'At your gym there is no cut-off: you can cancel a class, a session or a time slot yourself until it starts, and nothing is forfeited. Please tell your coach, so the place goes to somebody else.';
  }
  const parts = [`classes up to ${minutesWords(r.classCancelMinutes)}${r.classCancelMinutes ? ' before' : ''}`,
    `1-on-1 sessions up to ${minutesWords(r.ptCancelMinutes)}${r.ptCancelMinutes ? ' before' : ''}`,
    `time slots up to ${minutesWords(r.slotCancelMinutes)}${r.slotCancelMinutes ? ' before' : ''}`];
  const after = r.lateMode === 'block'
    ? 'Closer to the start than that, you cannot cancel in the app — ask the front desk.'
    : r.lateMode === 'mark'
      ? 'Closer than that, the cancel still goes through and your place opens for someone else, but it is recorded as a late cancel and counts like a no-show under the rules below.'
      : 'Closer than that, the cancel still goes through and your place opens for someone else; it is recorded as a late cancel, with no other effect.';
  return `At your gym you can cancel ${parts.join(', ')}. ${after} A cancel by your coach or the front desk is never late.`;
}

export function repeatTermsLine(r: BookingRules | null): string | null {
  if (!r) return 'Where your gym allows it, a booking can repeat every week. Each week is still booked on its own, under the same rules, and a week that cannot be booked is shown with the reason.';
  if (!r.repeatsOn) return null;
  const who = r.repeatWho.map((x) => (x === 'member' ? 'you' : x === 'coach' ? 'your coach' : 'the front desk'));
  const whoWords = who.length === 1 ? who[0] : `${who.slice(0, -1).join(', ')} or ${who[who.length - 1]}`;
  const how = r.repeatKind === 'weeks' ? `for up to ${r.repeatMaxWeeks} weeks` : 'every week until it is stopped';
  return `At your gym, ${whoWords} can set a booking to repeat ${how}. Each week is booked on its own, under the same rules as any booking, and a week that cannot be booked is shown with the reason. Stopping a repeat keeps the weeks already booked.`;
}

export function noshowTermsLine(r: BookingRules | null): string {
  if (!r) return 'Each gym decides whether it tracks no-shows and what follows one. Signed in, this page shows your gym’s own rule. A no-show never takes away points.';
  if (!r.noshowsOn || r.noshowMode === 'off') return 'Your gym does not track no-shows.';
  const how = r.noshowMode === 'hand' ? 'Your coach or the front desk marks whether you came.'
    : r.noshowMode === 'auto' ? `You count as there when you check in from ${r.noshowWindowMinutes} minutes before it starts until it ends; otherwise it is a no-show.`
    : `For classes and time slots you count as there when you check in from ${r.noshowWindowMinutes} minutes before until it ends; for a 1-on-1, your coach says whether you came — silence is never a no-show.`;
  const effects: string[] = [];
  if (r.noshowTell) effects.push('you and your coach are told');
  effects.push(r.noshowCountsUsed ? 'it counts against your plan’s classes or sessions, the same as one you attended' : 'it does not count against your plan’s classes or sessions');
  if (r.noshowPause) effects.push(`after ${r.noshowPauseCount} ${r.lateMode === 'mark' ? 'no-shows or late cancels' : 'no-shows'} in ${r.noshowPauseWithinDays} days you cannot book in the app for ${r.noshowPauseDays} days — the front desk can still book for you and can lift it early`);
  return `${how} After a no-show, ${effects.join('; ')}. A coaching package is monthly, so nothing is used up from it. A no-show never takes away points. If you were there, your coach or the front desk can undo it, and whatever it caused is undone with it.`;
}

/** The glance card for §5 — a restatement, never a new rule. */
export function cancelGlance(r: BookingRules | null): { label: string; detail: string } {
  if (!r) return { label: 'Cancelling', detail: 'Your gym’s cut-off is shown before you confirm.' };
  const none = [r.classCancelMinutes, r.ptCancelMinutes, r.slotCancelMinutes].every((m) => m === 0);
  if (none) return { label: 'Cancel bookings freely', detail: 'No cut-off at your gym, and nothing is forfeited.' };
  return { label: 'Cancel in time', detail: r.lateMode === 'block' ? 'After your gym’s cut-off, ask the front desk.' : 'After your gym’s cut-off it counts as a late cancel.' };
}
