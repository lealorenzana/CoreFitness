/**
 * The eight colours a gym can pick for its members' app.
 *
 * The ramps themselves live in the member app
 * (`g-fitness-member/src/lib/gymTheme.ts`), which is what draws them; this is
 * the list the owner chooses from, with one swatch each. Keep the keys
 * identical — `gym_settings.accent` is checked against them in SQL (0098), so a
 * key that exists here and nowhere else is refused on save.
 */
export const ACCENTS: { key: string; label: string; swatch: string }[] = [
  { key: 'violet', label: 'Violet', swatch: '#7C3AED' },
  { key: 'indigo', label: 'Indigo', swatch: '#4F46E5' },
  { key: 'blue', label: 'Blue', swatch: '#2563EB' },
  { key: 'teal', label: 'Teal', swatch: '#0D9488' },
  { key: 'emerald', label: 'Emerald', swatch: '#059669' },
  { key: 'rose', label: 'Rose', swatch: '#E11D48' },
  { key: 'orange', label: 'Orange', swatch: '#EA580C' },
  { key: 'slate', label: 'Slate', swatch: '#475569' },
];
