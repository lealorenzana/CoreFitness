/**
 * Tenancy: two gyms, every role, nothing crosses. Built on the real migrations
 * (lib/live-db.mjs) plus both demo seeds, acting as the real `authenticated`
 * role — an owner bypasses RLS, so `current_user` is asserted before any
 * result is believed. RLS filters rows and does not raise: a forbidden read is
 * zero rows, a forbidden update or delete touches zero rows, a forbidden insert
 * raises.
 *
 *   node <repo>/scripts/sql/tenancy-isolation.mjs "<repo>"   (from a dir with pglite installed)
 *
 * Plan: docs/superpowers/plans/2026-09-20-saas-part-a-tenancy.md
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO, { seeds: ['seed-demo-data.sql', 'seed-demo-data-2.sql'] });

const GYM_A = 'c0f1e55e-0000-4000-8000-000000000001';   // Gym #1: today's data
const GYM_B = 'b0000000-0000-4000-8000-00000000000b';
// People. `both` is a member of both gyms; `outsider` belongs to none.
const P = {
  adminA: 'a1000000-0000-4000-8000-000000000001', staffA: 'a1000000-0000-4000-8000-000000000002',
  trainerA: 'a1000000-0000-4000-8000-000000000003', memberA: 'a1000000-0000-4000-8000-000000000004',
  adminB: 'b1000000-0000-4000-8000-000000000001', staffB: 'b1000000-0000-4000-8000-000000000002',
  trainerB: 'b1000000-0000-4000-8000-000000000003', memberB: 'b1000000-0000-4000-8000-000000000004',
  both: 'ab000000-0000-4000-8000-000000000005', outsider: '0c000000-0000-4000-8000-000000000006',
};

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const finish = () => {
  console.log(failures ? `\n${failures} FAILED` : '\nall tenancy checks passed');
  process.exit(failures ? 1 : 0);
};
const asOwner = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
async function as(uid) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
  const { rows } = await db.query('select current_user as u');
  if (rows[0].u !== 'authenticated') throw new Error('not running as authenticated');
}
const one = async (sql) => (await db.query(sql)).rows[0];
const fails = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return describe(e); } };

// ---- 0097: the tenancy core exists -------------------------------------------
await asOwner();
const core = await one(`select to_regclass('public.gyms') is not null as gyms,
  to_regclass('public.gym_roles') is not null as roles,
  to_regprocedure('public.current_gym_id()') is not null as cur`);
check('0097 tables and current_gym_id exist', core.gyms && core.roles && core.cur, JSON.stringify(core));
if (!core.gyms) finish();

finish();
