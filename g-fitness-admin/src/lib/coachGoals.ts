/**
 * "Find your coach" (member app, Coaches) — the goals a member can pick and how
 * a coach's own profile words are matched to them.
 *
 * **This file exists in both apps and must stay identical** (diff before you
 * change one): the member app ranks coaches with it, the trainer app shows a
 * coach which goals their profile matches, and the admin's Trainers page shows
 * the same — so all three read one rule. The words were checked against the
 * seeded coaches' real text; "weight" alone matched "bodyweight", so it is
 * "weight loss".
 */

/** The profile fields a coach writes about themselves. */
export interface CoachWords {
  specialization: string | null;
  bio: string | null;
  achievements?: string | null;
  focus_areas?: string[] | null;
  certifications?: string[] | null;
}

export interface Goal {
  id: string;
  label: string;
  words: string[];
}

/** Checked against the seeded coaches' real wording — each goal finds someone. */
export const GOALS: Goal[] = [
  { id: 'fat', label: 'Lose fat', words: ['fat loss', 'weight loss', 'hiit', 'cardio', 'dance', 'zumba', 'conditioning'] },
  { id: 'muscle', label: 'Build muscle', words: ['hypertrophy', 'muscle', 'bodybuilding', 'calisthenics', 'strength'] },
  { id: 'strong', label: 'Get stronger', words: ['strength', 'powerlifting', 'squat', 'deadlift', 'technique'] },
  { id: 'move', label: 'Move better', words: ['yoga', 'mobility', 'flexibility', 'pilates', 'posture', 'functional'] },
  { id: 'sport', label: 'Sport & fight', words: ['boxing', 'muay thai', 'athlete', 'speed', 'agility', 'sports', 'self-defense'] },
  { id: 'pain', label: 'Pain or injury', words: ['rehab', 'injury', 'back pain', 'physical therapist', 'corrective', 'low impact'] },
  { id: 'start', label: 'Just starting', words: ['beginner', 'no experience', 'every level', 'daily life', 'seniors', 'low impact'] },
];

/**
 * How well a coach fits a goal: each matched word counts once, and a match in
 * their specialization — what they say they do — counts three times over one
 * that turns up in a bio or a certificate name.
 */
export function goalScore(t: CoachWords, goal: Goal): number {
  const spec = (t.specialization ?? '').toLowerCase();
  return goalMatches(t, goal).reduce((n, w) => n + (spec.includes(w) ? 3 : 1), 0);
}

/** The goal words this coach's own text contains, in the goal's order. */
export function goalMatches(t: CoachWords, goal: Goal): string[] {
  const text = [t.specialization, t.bio, t.achievements, ...(t.focus_areas ?? []), ...(t.certifications ?? [])]
    .filter(Boolean).join(' · ').toLowerCase();
  return goal.words.filter((w) => text.includes(w));
}


/** Every goal this profile would be listed under, with the words that put it there. */
export function goalsFor(t: CoachWords): { goal: Goal; words: string[] }[] {
  return GOALS.map((goal) => ({ goal, words: goalMatches(t, goal) })).filter((m) => m.words.length > 0);
}
