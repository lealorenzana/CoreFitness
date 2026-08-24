/**
 * What the member is training for, and what that makes a change *mean*.
 *
 * The body map has refused to interpret direction since it was first written,
 * and the reasoning survived three rewrites:
 *
 *     Colour encodes magnitude, never approval. Whether +2 cm on the arms is
 *     progress depends entirely on what the member is training for, and this
 *     component cannot know.
 *
 * `training_focus` (0044) is the missing fact. With it the app can finally say
 * whether a change is the one being trained for — **in words**.
 *
 * ## It stays words, and never colour
 *
 * The temptation is to turn the map green for good and red for bad. Two reasons
 * not to:
 *
 *  - The palette has no greens or reds by design, and adding a semantic pair
 *    here would put the one place in the app that judges the member in the two
 *    colours everything else avoids.
 *  - Colour already carries *magnitude*. Overloading it with direction would
 *    mean a bright patch could mean "moved a lot" or "moved the right way", and
 *    the member has no way to tell which.
 *
 * So the ramp is untouched and the interpretation lives in a sentence the member
 * reads once, on the muscle they tapped.
 *
 * ## Nothing here is a health claim
 *
 * These sentences describe the direction of a tape measurement against a stated
 * intention. They do not say a member is healthy, unhealthy, on track, or
 * failing, and they never suggest what anyone should eat or weigh. "Some waist
 * gain is normal on a bulk" is a statement about bulking, not advice about a
 * body.
 */

export type TrainingFocus = 'bulking' | 'cutting' | 'maintaining';

export const FOCUS_LABEL: Record<TrainingFocus, string> = {
  bulking: 'Bulking',
  cutting: 'Cutting',
  maintaining: 'Maintaining',
};

export const FOCUS_BLURB: Record<TrainingFocus, string> = {
  bulking: 'Adding size. Measurements are meant to go up.',
  cutting: 'Leaning down. Waist and hips are meant to come in.',
  maintaining: 'Holding steady. Big moves either way are worth noticing.',
};

/** Only a value the database would accept counts; anything else is "not stated". */
export function asFocus(raw: unknown): TrainingFocus | null {
  const v = typeof raw === 'string' ? raw.toLowerCase() : null;
  return v === 'bulking' || v === 'cutting' || v === 'maintaining' ? v : null;
}

/**
 * Which way a site is expected to move, per phase.
 *
 * The split is between sites that carry muscle and the two that mostly track
 * body fat. It is deliberately coarse: a tape measure around the waist cannot
 * separate fat from anything else, and pretending otherwise would be inventing
 * precision the measurement does not have.
 */
export type SiteKind = 'muscle' | 'midsection';

export const SITE_KIND = {
  neck: 'muscle',
  shoulders: 'muscle',
  chest: 'muscle',
  arms: 'muscle',
  forearms: 'muscle',
  core: 'midsection',
  hips: 'midsection',
  thighs: 'muscle',
  calves: 'muscle',
} as const satisfies Record<string, SiteKind>;

/**
 * One sentence on what this change means given the phase — or null when no
 * honest claim can be made.
 *
 * Returns null for an unstated focus, for a first reading with nothing to
 * compare against, and for no change at all. In every one of those cases the
 * app falls back to reporting the number and stopping, which is what it did
 * before this existed.
 */
export function interpretChange(
  focus: TrainingFocus | null,
  kind: SiteKind,
  delta: number | null
): string | null {
  if (focus == null || delta == null || delta === 0) return null;
  const up = delta > 0;

  if (focus === 'maintaining') {
    // No direction is being trained for, so the only honest observation is that
    // something moved while the member was trying to hold steady.
    return Math.abs(delta) >= 2
      ? 'A noticeable move for a maintenance phase.'
      : 'Small movement, which is what holding steady looks like.';
  }

  if (focus === 'bulking') {
    if (kind === 'muscle') {
      return up
        ? "That's the direction you're bulking for."
        : 'The opposite of what a bulk aims for.';
    }
    return up
      ? 'Some waist gain is common on a bulk.'
      : 'Leaner around the middle while bulking.';
  }

  // Cutting.
  if (kind === 'midsection') {
    return up
      ? 'The opposite of what a cut aims for.'
      : "That's the direction you're cutting for.";
  }
  return up
    ? 'Holding — or building — muscle through a cut.'
    : 'Some of this is common on a cut.';
}
