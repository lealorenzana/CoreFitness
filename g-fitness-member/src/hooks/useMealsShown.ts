import { useEffect, useState } from 'react';
import { myMealGuide } from '../lib/api/aiProposals';
import { coachOffered } from '../lib/api/aiCoach';
import { moduleOn } from '../lib/gymApp';
import { useGymApp } from './useGymApp';

/**
 * Should Progress → Meals be offered at all (the tab, and its More-sheet link)?
 *
 * Only when it can hold something: the member has a meal guide (0146
 * `my_meal_guide`), or the coach that writes one is theirs — the gym runs the
 * assistant and the chat would show the coach (`coachOffered`, the same test
 * MealsTab's empty state uses). Otherwise a Meals entry would open on a screen
 * with nothing to do, so it is not drawn. False until known, and false when a
 * read fails (a database without 0146 has no guide to show).
 *
 * `when` lets a sheet ask only while it is open. Nothing is cached here, so
 * nothing outlives the member who signed in.
 */
export function useMealsShown(when = true): boolean {
  const assistantOn = moduleOn(useGymApp(), 'assistant');
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!when) return;
    let alive = true;
    void (async () => {
      const [hasGuide, offered] = await Promise.all([
        myMealGuide().then((g) => g !== null).catch(() => false),
        assistantOn ? coachOffered() : Promise.resolve(false),
      ]);
      if (alive) setShown(hasGuide || offered);
    })();
    return () => { alive = false; };
  }, [when, assistantOn]);

  return shown;
}
