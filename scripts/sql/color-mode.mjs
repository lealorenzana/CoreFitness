/**
 * 0234: light or dark is each person's own choice, on their account — 'system'
 * until they pick, only system/light/dark, only their own row, never a visitor.
 *
 *   node <repo>/scripts/sql/color-mode.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);
let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const one = async (sql) => (await db.query(sql)).rows[0];
const tryExec = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return describe(e); } };
const as = (uid) => db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);

const A = 'a2340000-0000-4000-8000-000000000001', B = 'a2340000-0000-4000-8000-000000000002';
await db.exec(`reset role;
  insert into auth.users (id, email, raw_user_meta_data) values ('${A}', 'a@mode-test.ph', '{}'), ('${B}', 'b@mode-test.ph', '{}');
  insert into profiles (id, first_name, last_name, email, status, role) values
    ('${A}', 'Ann', 'A', 'a@mode-test.ph', 'active', 'member'), ('${B}', 'Ben', 'B', 'b@mode-test.ph', 'active', 'member') on conflict (id) do nothing;`);

await as(A);
check('a new account follows the device', (await one(`select my_color_mode() m`)).m === 'system');
await db.exec(`select set_color_mode('light')`);
check('a choice is kept on the account', (await one(`select my_color_mode() m`)).m === 'light');
check('only system, light or dark', /Choose system, light or dark/.test((await tryExec(`select set_color_mode('sepia')`)) ?? ''));
await as(B);
check("someone else's choice is their own", (await one(`select my_color_mode() m`)).m === 'system');
await db.exec(`reset role; set role anon;`);
check('a visitor cannot set one', !!(await tryExec(`select set_color_mode('dark')`)));
check('the probe marker answers a visitor', (await one(`select migration_0234_applied() ok`)).ok === true);

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
