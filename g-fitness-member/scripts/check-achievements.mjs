#!/usr/bin/env node
/**
 * Checks the seams the type system cannot see.
 *
 * Until migration 0038 this script diffed a hardcoded `if` ladder in SQL
 * against a hardcoded array in TypeScript, because a badge needed an entry in
 * both and nothing checked that. 0038 removed that split — the catalogue is a
 * table now, so a key cannot exist in one place and not the other.
 *
 * Two new seams replaced it, and both fail silently:
 *
 *  1. **Icon names.** A row stores `icon` as a string; the app resolves it
 *     through the registry in `src/data/achievements.ts`. An admin picking an
 *     icon this build has never heard of gets a fallback trophy rather than a
 *     crash — correct behaviour, and exactly why nobody would notice.
 *
 *  2. **Metric names.** A rule names a column of `member_training_stats()` or
 *     `trainer_stats()`. A typo produces a rule that quietly never fires,
 *     because `jsonb_metric_value` returns 0 for anything it cannot read.
 *
 * Both are checked against the seed in 0038 — the migration file, not a live
 * database, so this stays runnable offline and in CI. Rows an admin adds later
 * are validated by the admin form, which offers only these same lists.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SQL = resolve(here, '../../supabase/migrations/0038_achievements_as_data.sql');
const TS = resolve(here, '../src/data/achievements.ts');

const sql = readFileSync(SQL, 'utf8');
const ts = readFileSync(TS, 'utf8');

/** Icon names the app can actually draw. */
const registry = ts.match(/export const ACHIEVEMENT_ICONS[^{]*\{([\s\S]*?)\n\};/);
if (!registry) {
  console.error('✖ Could not find ACHIEVEMENT_ICONS in src/data/achievements.ts.');
  process.exit(1);
}
const iconNames = new Set(
  registry[1].split(/[,\s]+/).map((s) => s.trim()).filter((s) => /^[A-Z][A-Za-z0-9]*$/.test(s))
);

/** Metric keys the evaluator can read. */
const metricBlock = sql.match(/insert into achievement_metrics[\s\S]*?on conflict/);
const metricKeys = new Set(
  metricBlock ? [...metricBlock[0].matchAll(/^\s*\('([a-z0-9_]+)',/gm)].map((m) => m[1]) : []
);

/**
 * The seeded achievement rows.
 *
 * Parsed a line at a time, pulling the quoted values out in order, rather than
 * with one big pattern across the whole tuple. A single regex spanning thirteen
 * columns silently mis-aligns the moment any value contains an unexpected
 * character, and reports a confident, wrong answer — it read `rule_kind` as the
 * icon on the first attempt at this.
 *
 * Column order matches the INSERT: key, audience, title, description,
 * requirement, icon, tier, category, rule_kind, metric, …
 */
const seedBlock = sql.match(/insert into achievements\b[\s\S]*?on conflict \(key\)/);
const rows = (seedBlock ? seedBlock[0].split('\n') : [])
  .filter((line) => /^\s*\('[a-z0-9_]+','(member|trainer)',/.test(line))
  .map((line) => {
    const q = [...line.matchAll(/'((?:[^']|'')*)'/g)].map((m) => m[1]);
    return {
      key: q[0], audience: q[1], icon: q[5], tier: q[6],
      ruleKind: q[8],
      // `metric` is quoted when present and the bare word `null` when not, so a
      // missing one simply does not appear in the quoted list.
      metric: q[8] === 'metric' ? q[9] ?? null : null,
    };
  });

const problems = [];

if (iconNames.size === 0) problems.push('The icon registry parsed as empty.');
if (metricKeys.size === 0) problems.push('No metrics parsed out of 0038.');
if (rows.length === 0) problems.push('No achievement rows parsed out of 0038 — the seed format may have changed.');

for (const r of rows) {
  if (!iconNames.has(r.icon)) {
    problems.push(`"${r.key}" uses icon "${r.icon}", which is not in ACHIEVEMENT_ICONS — it will draw a fallback trophy.`);
  }
  if (r.ruleKind === 'metric' && !metricKeys.has(r.metric)) {
    problems.push(`"${r.key}" is a metric rule on "${r.metric}", which is not in achievement_metrics — it can never fire.`);
  }
  if (r.ruleKind === 'metric' && !r.metric) {
    problems.push(`"${r.key}" is a metric rule with no metric.`);
  }
}

if (problems.length > 0) {
  console.error('✖ Achievement catalogue problems:\n');
  for (const p of problems) console.error('  • ' + p);
  console.error('');
  process.exit(1);
}

console.log(
  `✓ ${rows.length} seeded achievements — every icon resolves (${iconNames.size} in the registry) ` +
  `and every metric rule names one of the ${metricKeys.size} real metrics.`
);
