#!/usr/bin/env node
/**
 * Diffs the two halves of the achievement system.
 *
 * The earning rules live in SQL and the presentation lives in TypeScript (see
 * the header of `src/data/achievements.ts` for why). They are joined only by a
 * string key, and nothing in the compiler or the database checks that the two
 * sets match. The failure is silent both ways: a key with no rule is a badge
 * nobody can earn, a rule with no key renders as a blank tile.
 *
 * So this script does the check the type system can't.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SQL = resolve(here, '../../supabase/migrations/0028_progression_and_achievements.sql');
const TS = resolve(here, '../src/data/achievements.ts');

const sql = readFileSync(SQL, 'utf8');
const ts = readFileSync(TS, 'utf8');

const sqlKeys = new Set([...sql.matchAll(/earned \|\| '([a-z0-9_]+)'::text/g)].map((m) => m[1]));
const tsKeys = new Set([...ts.matchAll(/^\s*key: '([a-z0-9_]+)'/gm)].map((m) => m[1]));

const missingInTs = [...sqlKeys].filter((k) => !tsKeys.has(k));
const missingInSql = [...tsKeys].filter((k) => !sqlKeys.has(k));

if (sqlKeys.size === 0 || tsKeys.size === 0) {
  console.error('✗ parsed 0 keys from one side — the patterns in this script have gone stale');
  console.error(`  SQL: ${sqlKeys.size} keys, TS: ${tsKeys.size} keys`);
  process.exit(1);
}

if (missingInTs.length || missingInSql.length) {
  if (missingInTs.length) {
    console.error(`✗ earnable in SQL but not in the catalogue: ${missingInTs.join(', ')}`);
  }
  if (missingInSql.length) {
    console.error(`✗ in the catalogue but nothing can earn them: ${missingInSql.join(', ')}`);
  }
  process.exit(1);
}

console.log(`✓ achievements in sync — ${sqlKeys.size} keys, rules and catalogue agree`);
