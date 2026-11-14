/**
 * 0234: light or dark is each person's own choice, on their account — 'system'
 * until they pick, only system/light/dark, only their own row, never a visitor.
 * 0254: the account remembers that it chose, so the first sign-in asks once — and
 * choosing "Match my phone" counts as an answer; someone else is still to be asked.
 * BEFORE=0254 replays without it (the 0254 checks are skipped).
 *
 *   node <repo>/scripts/sql/color-mode.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO, { before: process.env.BEFORE || null });
const has0254 = !process.env.BEFORE || Number(process.env.BEFORE) > 254;
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
if (has0254) check('a new account is still to be asked', (await one(`select my_color_mode_asked() a`)).a === false);
await db.exec(`select set_color_mode('light')`);
check('a choice is kept on the account', (await one(`select my_color_mode() m`)).m === 'light');
check('only system, light or dark', /Choose system, light or dark/.test((await tryExec(`select set_color_mode('sepia')`)) ?? ''));
if (has0254) {
  check('choosing answers the question', (await one(`select my_color_mode_asked() a`)).a === true);
  await db.exec('reset role');
  const first = (await one(`select color_mode_chosen_at t from profiles where id = '${A}'`)).t;
  await as(A);
  await db.exec(`select set_color_mode('dark')`);
  await db.exec('reset role');
  const again = (await one(`select color_mode_chosen_at t from profiles where id = '${A}'`)).t;
  check('changing it later keeps the first answer time', !!first && String(first) === String(again));
}
await as(B);
check("someone else's choice is their own", (await one(`select my_color_mode() m`)).m === 'system');
if (has0254) {
  check('…and they are still to be asked', (await one(`select my_color_mode_asked() a`)).a === false);
  await db.exec(`select set_color_mode('system')`);
  check('"Match my phone" is an answer too', (await one(`select my_color_mode_asked() a`)).a === true
    && (await one(`select my_color_mode() m`)).m === 'system');
}
await db.exec(`reset role; set role anon;`);
check('a visitor cannot set one', !!(await tryExec(`select set_color_mode('dark')`)));
if (has0254) {
  check('a visitor cannot ask whether anyone chose', !!(await tryExec(`select my_color_mode_asked()`)));
  check('the 0254 marker answers a visitor', (await one(`select migration_0254_applied() ok`)).ok === true);
}
check('the probe marker answers a visitor', (await one(`select migration_0234_applied() ok`)).ok === true);

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
