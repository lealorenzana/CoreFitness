import type { BodyRegionKey } from '../components/ui/BodyMap';

/**
 * Which exercises train the part of the body you just tapped.
 *
 * Two vocabularies exist here and neither is going away:
 *
 *  - **`BodyRegionKey`** — the nine places a tape measure goes. Chosen for
 *    measuring, so it splits `arms` from `forearms` and `thighs` from `calves`,
 *    and it has a `hips` because hips are measured.
 *  - **`exercises.muscle_group`** (0050) — chest, back, legs, shoulders, arms,
 *    core, full_body, cardio. Chosen for training, so it has a `back` nobody
 *    puts a tape around and lumps every leg movement together.
 *
 * They do not line up, and forcing them to would damage both. This maps one to
 * the other and accepts that the mapping is **coarse on purpose**:
 *
 *  - `chest` pulls in `back` as well, because the chest measurement is a single
 *    reading around the torso — `BodyMap` already tells the member it "covers
 *    your chest and your back". Showing only bench presses under a number that
 *    includes their back would contradict the app's own explanation.
 *  - `forearms` maps to `arms`: this gym's catalogue has no forearm-specific
 *    entries, and an empty list under a body part the member just tapped reads
 *    as broken.
 *  - `thighs` and `calves` both map to `legs`, which is the only grouping the
 *    exercise table has.
 *  - `neck` maps to nothing. There are no neck exercises in the catalogue and
 *    inventing a category for one tap would put an empty group in every picker.
 *    The sheet says so rather than showing an empty list.
 *
 * `full_body` and `cardio` are deliberately absent from every entry. They train
 * everything and nothing in particular, so surfacing them under a specific body
 * part would make the list longer without making it more useful.
 */
export const REGION_MUSCLE_GROUPS: Record<BodyRegionKey, string[]> = {
  neck: [],
  shoulders: ['shoulders'],
  chest: ['chest', 'back'],
  arms: ['arms'],
  forearms: ['arms'],
  core: ['core'],
  hips: ['legs', 'core'],
  thighs: ['legs'],
  calves: ['legs'],
};

/** How the sheet introduces the exercise list, per region. */
export const REGION_TRAINING_NOTE: Record<BodyRegionKey, string> = {
  neck: 'The gym has no neck-specific exercises in its catalogue.',
  shoulders: 'Presses and raises are what move this measurement.',
  chest: 'This reading goes around your whole torso, so pushing and pulling both count.',
  arms: 'Curls and extensions, plus anything you pull or press.',
  forearms: 'Grip work comes mostly from pulling — these are the arm movements the gym has.',
  core: 'Trunk work. Waist size responds more to overall training than to any one exercise.',
  hips: 'Squats, hinges and trunk work all load the hips.',
  thighs: 'Squats, presses and hinges.',
  calves: 'Raises, plus every squat and lunge you already do.',
};
