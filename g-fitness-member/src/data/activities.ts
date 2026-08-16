/**
 * The activity catalogue behind the onboarding interests step.
 *
 * It used to be ten hardcoded chips written straight into `Onboarding.tsx`,
 * saved to `localStorage['fitness_preferences']` and read by nothing at all.
 *
 * Two things changed. The list is now a **graph**: picking Yoga surfaces
 * Pilates, Stretching, Mobility and Breathwork, picking one of those surfaces
 * more, and so on — so somebody who knows one word for what they like can find
 * the rest without scrolling a wall of sixty chips. And the answers are stored
 * on the member's row (0036), where `recommendedClasses` reads them.
 *
 * `keywords` is what makes the answers do something. Class names are free text
 * typed by the gym ("Morning Muay Thai", "Yoga Flow"), so matching is a
 * lowercase substring test against these — deliberately simple and
 * deliberately visible, rather than a taxonomy the gym would have to maintain
 * in two places. A missed match costs a recommendation, never a wrong booking.
 */

export type ActivityGroup =
  | 'Strength'
  | 'Cardio'
  | 'Classes & studio'
  | 'Combat sports'
  | 'Mind & body'
  | 'Sports & outdoor'
  | 'Recovery';

export interface Activity {
  id: string;
  label: string;
  group: ActivityGroup;
  /** Lowercase fragments matched against a class name or type. */
  keywords: string[];
  /** Surfaced when this one is picked. The cascade. */
  related: string[];
}

export const ACTIVITIES: Activity[] = [
  // ── Strength ──────────────────────────────────────────────────────────────
  { id: 'free-weights', label: 'Free Weights', group: 'Strength', keywords: ['weight', 'dumbbell', 'barbell'],
    related: ['powerlifting', 'bodybuilding', 'machines', 'core'] },
  { id: 'powerlifting', label: 'Powerlifting', group: 'Strength', keywords: ['powerlift', 'squat', 'deadlift', 'bench'],
    related: ['free-weights', 'olympic-lifting', 'strongman', 'strength-class'] },
  { id: 'olympic-lifting', label: 'Olympic Lifting', group: 'Strength', keywords: ['olympic', 'clean', 'snatch'],
    related: ['powerlifting', 'crossfit', 'mobility', 'functional'] },
  { id: 'bodybuilding', label: 'Bodybuilding', group: 'Strength', keywords: ['bodybuild', 'hypertroph', 'physique'],
    related: ['free-weights', 'machines', 'nutrition', 'core'] },
  { id: 'machines', label: 'Resistance Machines', group: 'Strength', keywords: ['machine', 'resistance'],
    related: ['free-weights', 'bodybuilding', 'circuit'] },
  { id: 'kettlebells', label: 'Kettlebells', group: 'Strength', keywords: ['kettlebell'],
    related: ['functional', 'hiit', 'circuit', 'core'] },
  { id: 'calisthenics', label: 'Calisthenics', group: 'Strength', keywords: ['calisthenic', 'bodyweight', 'pull-up'],
    related: ['core', 'mobility', 'functional', 'balance'] },
  { id: 'core', label: 'Core & Abs', group: 'Strength', keywords: ['core', 'abs', 'plank'],
    related: ['pilates', 'calisthenics', 'balance', 'stretching'] },
  { id: 'functional', label: 'Functional Training', group: 'Strength', keywords: ['functional'],
    related: ['kettlebells', 'crossfit', 'trx', 'mobility'] },
  { id: 'strongman', label: 'Strongman', group: 'Strength', keywords: ['strongman', 'farmer', 'tire'],
    related: ['powerlifting', 'functional', 'crossfit'] },
  { id: 'strength-class', label: 'Strength Class', group: 'Strength', keywords: ['strength'],
    related: ['free-weights', 'circuit', 'bootcamp'] },

  // ── Cardio ────────────────────────────────────────────────────────────────
  { id: 'treadmill', label: 'Treadmill', group: 'Cardio', keywords: ['treadmill', 'cardio'],
    related: ['running', 'hiit', 'stairmaster', 'elliptical', 'jump-rope'] },
  { id: 'running', label: 'Running', group: 'Cardio', keywords: ['run', 'jog'],
    related: ['treadmill', 'endurance-class', 'stretching', 'hiking'] },
  { id: 'cycling', label: 'Stationary Cycling', group: 'Cardio', keywords: ['cycl', 'bike', 'spin'],
    related: ['spinning', 'cycling-outdoor', 'endurance-class'] },
  { id: 'rowing', label: 'Rowing', group: 'Cardio', keywords: ['rowing', 'row machine', 'erg'],
    related: ['hiit', 'circuit', 'endurance-class'] },
  { id: 'elliptical', label: 'Elliptical', group: 'Cardio', keywords: ['elliptical', 'cross-trainer'],
    related: ['treadmill', 'cycling', 'injury-rehab'] },
  { id: 'stairmaster', label: 'Stair Climber', group: 'Cardio', keywords: ['stair', 'climb'],
    related: ['treadmill', 'hiit', 'hiking'] },
  { id: 'jump-rope', label: 'Jump Rope', group: 'Cardio', keywords: ['jump rope', 'skipping'],
    related: ['boxing', 'hiit', 'circuit'] },
  { id: 'hiit', label: 'HIIT', group: 'Cardio', keywords: ['hiit', 'interval', 'tabata'],
    related: ['circuit', 'bootcamp', 'crossfit', 'jump-rope'] },
  { id: 'circuit', label: 'Circuit Training', group: 'Cardio', keywords: ['circuit'],
    related: ['hiit', 'bootcamp', 'kettlebells', 'functional'] },
  { id: 'endurance-class', label: 'Endurance', group: 'Cardio', keywords: ['endurance', 'stamina'],
    related: ['running', 'cycling', 'rowing'] },

  // ── Classes & studio ──────────────────────────────────────────────────────
  { id: 'zumba', label: 'Zumba', group: 'Classes & studio', keywords: ['zumba'],
    related: ['dance', 'aerobics', 'step', 'cardio-dance'] },
  { id: 'dance', label: 'Dance Fitness', group: 'Classes & studio', keywords: ['dance'],
    related: ['zumba', 'cardio-dance', 'aerobics', 'barre'] },
  { id: 'cardio-dance', label: 'Cardio Dance', group: 'Classes & studio', keywords: ['cardio dance'],
    related: ['zumba', 'dance', 'aerobics'] },
  { id: 'aerobics', label: 'Aerobics', group: 'Classes & studio', keywords: ['aerobic'],
    related: ['step', 'zumba', 'dance'] },
  { id: 'step', label: 'Step Class', group: 'Classes & studio', keywords: ['step'],
    related: ['aerobics', 'zumba', 'circuit'] },
  { id: 'spinning', label: 'Spin Class', group: 'Classes & studio', keywords: ['spin'],
    related: ['cycling', 'hiit', 'endurance-class'] },
  { id: 'bootcamp', label: 'Bootcamp', group: 'Classes & studio', keywords: ['bootcamp', 'boot camp'],
    related: ['hiit', 'circuit', 'crossfit', 'strength-class'] },
  { id: 'crossfit', label: 'CrossFit', group: 'Classes & studio', keywords: ['crossfit', 'wod'],
    related: ['olympic-lifting', 'functional', 'hiit', 'strongman'] },
  { id: 'trx', label: 'Suspension (TRX)', group: 'Classes & studio', keywords: ['trx', 'suspension'],
    related: ['functional', 'calisthenics', 'core'] },
  { id: 'barre', label: 'Barre', group: 'Classes & studio', keywords: ['barre'],
    related: ['pilates', 'dance', 'balance', 'stretching'] },

  // ── Combat sports ─────────────────────────────────────────────────────────
  { id: 'boxing', label: 'Boxing', group: 'Combat sports', keywords: ['boxing', 'box'],
    related: ['kickboxing', 'muay-thai', 'jump-rope', 'mma'] },
  { id: 'kickboxing', label: 'Kickboxing', group: 'Combat sports', keywords: ['kickbox'],
    related: ['boxing', 'muay-thai', 'mma', 'hiit'] },
  { id: 'muay-thai', label: 'Muay Thai', group: 'Combat sports', keywords: ['muay', 'thai'],
    related: ['kickboxing', 'boxing', 'mma', 'mobility'] },
  { id: 'mma', label: 'MMA', group: 'Combat sports', keywords: ['mma', 'mixed martial'],
    related: ['bjj', 'muay-thai', 'self-defence', 'boxing', 'functional'] },
  { id: 'bjj', label: 'Brazilian Jiu-Jitsu', group: 'Combat sports', keywords: ['jiu', 'bjj', 'grappl'],
    related: ['mma', 'mobility', 'calisthenics'] },
  { id: 'arnis', label: 'Arnis / Eskrima', group: 'Combat sports', keywords: ['arnis', 'eskrima', 'kali'],
    related: ['taekwondo', 'boxing', 'balance'] },
  { id: 'taekwondo', label: 'Taekwondo', group: 'Combat sports', keywords: ['taekwondo', 'karate'],
    related: ['arnis', 'kickboxing', 'stretching'] },
  { id: 'self-defence', label: 'Self-Defence', group: 'Combat sports', keywords: ['self defen', 'self-defen'],
    related: ['boxing', 'bjj', 'arnis'] },

  // ── Mind & body ───────────────────────────────────────────────────────────
  { id: 'yoga', label: 'Yoga', group: 'Mind & body', keywords: ['yoga', 'vinyasa', 'hatha'],
    related: ['pilates', 'stretching', 'mobility', 'meditation', 'barre'] },
  { id: 'pilates', label: 'Pilates', group: 'Mind & body', keywords: ['pilates'],
    related: ['yoga', 'core', 'barre', 'balance'] },
  { id: 'stretching', label: 'Stretching', group: 'Mind & body', keywords: ['stretch', 'flexib'],
    related: ['mobility', 'yoga', 'foam-rolling', 'injury-rehab'] },
  { id: 'mobility', label: 'Mobility Work', group: 'Mind & body', keywords: ['mobility'],
    related: ['stretching', 'yoga', 'foam-rolling', 'balance'] },
  { id: 'meditation', label: 'Breathwork & Meditation', group: 'Mind & body', keywords: ['meditat', 'breath', 'mindful'],
    related: ['yoga', 'sleep', 'tai-chi'] },
  { id: 'tai-chi', label: 'Tai Chi', group: 'Mind & body', keywords: ['tai chi', 'qigong'],
    related: ['meditation', 'balance', 'mobility'] },
  { id: 'balance', label: 'Balance & Stability', group: 'Mind & body', keywords: ['balance', 'stability'],
    related: ['core', 'pilates', 'mobility', 'tai-chi'] },

  // ── Sports & outdoor ──────────────────────────────────────────────────────
  { id: 'basketball', label: 'Basketball', group: 'Sports & outdoor', keywords: ['basketball'],
    related: ['volleyball', 'agility', 'functional'] },
  { id: 'volleyball', label: 'Volleyball', group: 'Sports & outdoor', keywords: ['volleyball'],
    related: ['basketball', 'badminton', 'agility', 'balance'] },
  { id: 'badminton', label: 'Badminton', group: 'Sports & outdoor', keywords: ['badminton'],
    related: ['table-tennis', 'agility', 'volleyball'] },
  { id: 'table-tennis', label: 'Table Tennis', group: 'Sports & outdoor', keywords: ['table tennis', 'ping'],
    related: ['badminton', 'agility'] },
  { id: 'football', label: 'Football', group: 'Sports & outdoor', keywords: ['football', 'soccer', 'futsal'],
    related: ['running', 'agility', 'endurance-class'] },
  { id: 'swimming', label: 'Swimming', group: 'Sports & outdoor', keywords: ['swim', 'aqua'],
    related: ['endurance-class', 'injury-rehab', 'stretching'] },
  { id: 'hiking', label: 'Hiking', group: 'Sports & outdoor', keywords: ['hik', 'trek'],
    related: ['stairmaster', 'running', 'endurance-class'] },
  { id: 'cycling-outdoor', label: 'Outdoor Cycling', group: 'Sports & outdoor', keywords: ['outdoor cycl', 'road bike'],
    related: ['cycling', 'spinning', 'endurance-class'] },
  { id: 'agility', label: 'Agility & Speed', group: 'Sports & outdoor', keywords: ['agility', 'speed', 'plyo'],
    related: ['hiit', 'football', 'jump-rope', 'functional'] },

  // ── Recovery ──────────────────────────────────────────────────────────────
  { id: 'foam-rolling', label: 'Foam Rolling', group: 'Recovery', keywords: ['foam', 'myofascial'],
    related: ['stretching', 'mobility', 'massage'] },
  { id: 'massage', label: 'Sports Massage', group: 'Recovery', keywords: ['massage'],
    related: ['foam-rolling', 'injury-rehab', 'sleep'] },
  { id: 'injury-rehab', label: 'Injury Rehab', group: 'Recovery', keywords: ['rehab', 'recovery', 'physio'],
    related: ['mobility', 'swimming', 'stretching', 'massage'] },
  { id: 'nutrition', label: 'Nutrition Coaching', group: 'Recovery', keywords: ['nutrition', 'diet', 'meal'],
    related: ['bodybuilding', 'sleep', 'weight-management'] },
  { id: 'weight-management', label: 'Weight Management', group: 'Recovery', keywords: ['weight loss', 'slim'],
    related: ['nutrition', 'hiit', 'circuit', 'running'] },
  { id: 'sleep', label: 'Sleep & Recovery', group: 'Recovery', keywords: ['sleep', 'recovery'],
    related: ['meditation', 'massage', 'nutrition'] },
];

export const ACTIVITY_BY_ID = new Map(ACTIVITIES.map((a) => [a.id, a]));

/**
 * The first screenful, before anything is picked.
 *
 * Deliberately one or two per group rather than "the ten most popular" — the
 * point of the opening set is to show the *shape* of the catalogue, so whatever
 * you came in caring about has a visible neighbour to click.
 */
export const STARTER_IDS = [
  'free-weights', 'hiit', 'yoga', 'boxing', 'zumba', 'basketball',
  'crossfit', 'swimming', 'stretching', 'cycling', 'core', 'weight-management',
];

/** Related ids for a pick, minus anything already on screen. Order is kept. */
export function suggestionsFor(id: string, alreadyShown: Iterable<string>): string[] {
  const shown = new Set(alreadyShown);
  const activity = ACTIVITY_BY_ID.get(id);
  if (!activity) return [];
  return activity.related.filter((r) => !shown.has(r) && ACTIVITY_BY_ID.has(r));
}

export function activitiesByGroup(): [ActivityGroup, Activity[]][] {
  const groups = new Map<ActivityGroup, Activity[]>();
  for (const a of ACTIVITIES) {
    const list = groups.get(a.group) ?? [];
    list.push(a);
    groups.set(a.group, list);
  }
  return [...groups.entries()];
}

/**
 * Does this class look like something the member said they were interested in?
 *
 * Substring matching on a free-text class name. **No interests means false, not
 * true** — "they told us nothing" is not the same as "they like everything",
 * and treating it as the latter would badge every class on the schedule as
 * recommended, which tells the member exactly nothing.
 */
export function matchesInterests(text: string | null | undefined, interests: string[]): boolean {
  if (!text || interests.length === 0) return false;
  const haystack = text.toLowerCase();
  return interests.some((id) => {
    const activity = ACTIVITY_BY_ID.get(id);
    if (!activity) return false;
    if (haystack.includes(activity.label.toLowerCase())) return true;
    return activity.keywords.some((k) => haystack.includes(k));
  });
}
