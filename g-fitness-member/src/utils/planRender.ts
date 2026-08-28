import type { PlanSpec } from './planBuilder';

/**
 * Turning a PlanSpec into words.
 *
 * This is the seam. `buildPlan()` decides the training; this file decides how it
 * reads. Keeping them apart is what makes a hybrid possible later without
 * rewriting the programme logic: swap this module for one that asks a model to
 * reword the same spec, and the sets, reps and exercises are still the ones the
 * rules produced.
 *
 * ## The line a reworder must not cross
 *
 * `renderPlan` covers the **advice** — why this split, how to progress, how to
 * eat around training, when to ask a coach. Those are sentences, and a model
 * could say them more warmly.
 *
 * The **exercise table is not rendered here**, on purpose. Sets, reps and
 * movement names go to the screen straight from the spec. A model that can
 * reword "4 x 5-6 Back squat" is a model that can turn it into "5 x 4-6", and
 * then the number the member trains to is one nothing verified. Facts render
 * themselves; only the prose is up for rewording.
 */

export interface PlanSection {
  title: string;
  lines: string[];
}

export interface RenderedPlan {
  headline: string;
  intro: string;
  sections: PlanSection[];
}

const FOCUS_WORD: Record<string, string> = {
  bulking: 'building size',
  cutting: 'leaning down',
  maintaining: 'holding steady',
};

const EXPERIENCE_WORD: Record<string, string> = {
  beginner: 'starting out',
  intermediate: 'training regularly',
  advanced: 'experienced',
};

export function renderPlan(spec: PlanSpec): RenderedPlan {
  const { inputs } = spec;
  const focus = FOCUS_WORD[inputs.focus] ?? inputs.focus;
  const level = EXPERIENCE_WORD[inputs.experience] ?? inputs.experience;

  return {
    headline: `${spec.splitName} · ${inputs.daysPerWeek} days a week`,
    intro:
      `Built for someone ${level} and ${focus}, training ${inputs.daysPerWeek} times a week ` +
      `for about ${inputs.sessionMinutes} minutes. ${spec.rationale}`,
    sections: [
      { title: 'Conditioning', lines: spec.conditioning },
      { title: 'Getting stronger over time', lines: spec.progression },
      // Named "Eating around training", not "Diet plan". It is general practice,
      // and the heading should not promise a prescription the content does not
      // contain — see planBuilder.ts for where that line is drawn.
      { title: 'Eating around training', lines: spec.nutrition },
      { title: 'Worth asking a coach', lines: spec.seeACoach },
    ].filter((s) => s.lines.length > 0),
  };
}
