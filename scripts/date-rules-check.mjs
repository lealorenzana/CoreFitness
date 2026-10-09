/**
 * The one date rule (spec A1): dateBounds() per mode, and the three copies of
 * dateRules.ts (admin, member, platform) byte-identical.
 *
 *   node scripts/date-rules-check.mjs "<repo>"
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const R = process.argv[2] ?? '.';
const { dateBounds, withinBounds } = await import(pathToFileURL(`${R}/g-fitness-admin/src/lib/dateRules.ts`).href);
const t = '2026-10-10';
let bad = 0;
const eq = (label, a, b) => {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}`);
  if (!ok) { bad++; console.log('   got', a, 'want', b); }
};

eq('future: today … +2 years', dateBounds('future', { today: t }), { min: '2026-10-10', max: '2028-10-10' });
eq('future: a shorter reach when asked', dateBounds('future', { today: t, aheadDays: 30 }), { min: '2026-10-10', max: '2026-11-09' });
eq('record: 30 days back, never the future', dateBounds('record', { today: t, backDays: 30 }), { min: '2026-09-10', max: '2026-10-10' });
eq('record: never before the earliest allowed day', dateBounds('record', { today: t, backDays: 30, earliest: '2026-10-01' }), { min: '2026-10-01', max: '2026-10-10' });
eq('history: the gym\'s first day … today', dateBounds('history', { today: t, earliest: '2025-06-01' }), { min: '2025-06-01', max: '2026-10-10' });
eq('birth: 120 years back … today − 16 years', dateBounds('birth', { today: t }), { min: '1906-10-10', max: '2010-10-10' });
eq('birth: the gym\'s own minimum age', dateBounds('birth', { today: t, minAge: 18 }).max, '2008-10-10');
eq('birth on 29 Feb: the year before is 28 Feb', dateBounds('birth', { today: '2028-02-29' }).max, '2012-02-29');
eq('…and lands on 28 Feb in a non-leap year', dateBounds('birth', { today: '2028-02-29', minAge: 17 }).max, '2011-02-28');
eq('2002 is not a future date', withinBounds('2002-05-01', dateBounds('future', { today: t })), false);
eq('tomorrow is not a record date', withinBounds('2026-10-11', dateBounds('record', { today: t })), false);

const copies = ['g-fitness-admin', 'g-fitness-member', 'corefitness-platform']
  .map((a) => readFileSync(`${R}/${a}/src/lib/dateRules.ts`, 'utf8'));
eq('the three copies are byte-identical', copies.every((c) => c === copies[0]), true);

console.log(bad ? `\n${bad} FAILED` : '\nall date-rule checks passed');
process.exit(bad ? 1 : 0);
