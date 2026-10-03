import type { CSSProperties } from 'react';
import { Eyebrow } from './ui/noc';
import type { MealSection } from '../lib/api/aiProposals';
import { useT } from '../lib/i18n';

/**
 * A meal guide from the coach (0146), read-only: each section's title, its meal
 * ideas as rows on the page (never a card per row), and the fixed line under it.
 * The same rows for the member's Meals tab and the trainer's member sheet.
 *
 * The meal ideas are the member's applied guide, shown as written — the database
 * already refused any calorie, gram, macro or percentage figure. The fixed line
 * is the app's, never stored, so every guide ends with it whoever reads it.
 */

const MEAL_GUIDANCE_LINE =
  'This is general guidance, not a diet plan. For anything medical — diabetes, pregnancy, allergies, an eating disorder — see a doctor or a registered nutritionist-dietitian.';

export function MealGuidanceNote({ style }: { style?: CSSProperties }) {
  const t = useT();
  return (
    <p data-meal-note style={{ fontSize: 12, lineHeight: 1.55, color: 'var(--color-text-muted)', ...style }}>
      {t(MEAL_GUIDANCE_LINE)}
    </p>
  );
}

export default function MealGuide({ sections }: { sections: MealSection[] }) {
  return (
    <div className="flex flex-col" style={{ gap: 18 }} data-meal-guide>
      {sections.map((s, si) => (
        <section key={si} aria-label={s.title}>
          <Eyebrow mark>{s.title}</Eyebrow>
          <div style={{ marginTop: 4 }}>
            {s.items.map((item, i) => (
              <div key={i}>
                <p data-meal-item style={{ padding: '11px 0', fontSize: 14, lineHeight: 1.5, color: 'var(--color-text-primary)' }}>{item}</p>
                {i < s.items.length - 1 && <div className="hair" />}
              </div>
            ))}
          </div>
        </section>
      ))}
      <MealGuidanceNote />
    </div>
  );
}
