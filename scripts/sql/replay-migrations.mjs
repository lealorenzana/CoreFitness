/**
 * Replays every migration, in order, into real Postgres, then runs the seeds
 * the way the SQL Editor does — one batch per file. The schema is then the
 * live one, constraint for constraint, instead of a fixture written from
 * memory, which is how part 2 passed locally and failed live.
 *
 * Only Supabase's own furniture is stubbed: the auth and storage schemas, the
 * roles, the realtime publication. Extensions pglite does not ship are turned
 * into no-ops; every migration here already treats pg_cron as optional.
 *
 *   node <repo>/scripts/sql/replay-migrations.mjs "<repo>" [seed files under scripts/demo-data/ ...]
 *
 * Found that seed-demo-data-2.sql is valid against the real schema, which the
 * hand-written fixtures in the other scripts could not show either way.
 */
import { liveDb } from './lib/live-db.mjs';

const REPO = process.argv[2];
try {
  await liveDb(REPO, { seeds: process.argv.slice(3), log: console.log });
} catch (e) {
  console.log(e.message);
  process.exit(e.message.startsWith('SEED') ? 3 : 2);
}
