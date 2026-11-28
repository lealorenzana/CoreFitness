/**
 * 0285: each person's View choice per page, on their own profile. Saving and reading are the caller's own; one
 * person's choice never shows to another; the key and the value are checked; a visitor saves nothing.
 *
 *   node <repo>/scripts/sql/view-prefs.mjs "<repo>"   (from a dir with pglite installed)
 *   BEFORE=0285 … replays without it, to prove the checks can fail.
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO, { before: process.env.BEFORE || null });
const GYM = 'c0f1e55e-0000-4000-8000-000000000001';
const A = 'a2850000-0000-4000-8000-0000000000a1', B = 'a2850000-0000-4000-8000-0000000000b2';
let failures = 0;
const check = (label, ok, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`); if (!ok) failures++; };
const one = async (sql) => (await db.query(sql)).rows[0];
const err = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return describe(e); } };
const as = (uid) => db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role ${uid ? 'authenticated' : 'anon'};`);

await db.exec(`reset role;
  ${[[A, 'desk-a'], [B, 'desk-b']].map(([u, k]) => `
    insert into auth.users (id, email, raw_user_meta_data) values ('${u}', '${k}@prefs-test.com', '{}');
    insert into profiles (id, first_name, last_name, email, status, role, active_gym_id)
      values ('${u}', '${k}', 'T', '${k}@prefs-test.com', 'active', 'staff', '${GYM}') on conflict (id) do update set active_gym_id = excluded.active_gym_id;`).join('\n')}`);

await as(A);
check('a person saves their choice for a page', (await err(`select set_view_pref('admin.members', '{"view":"tiles","pane":true}')`)) === null);
const mine = (await one(`select my_view_prefs() p`)).p;
check('…and reads it back', mine?.['admin.members']?.view === 'tiles' && mine['admin.members'].pane === true, JSON.stringify(mine));
await db.exec(`select set_view_pref('platform.gyms', '{"view":"list","pane":false}')`);
check('a second page keeps the first', (await one(`select my_view_prefs() p`)).p['admin.members']?.view === 'tiles');
await as(B);
check('another person on the same desk does not get it', JSON.stringify((await one(`select my_view_prefs() p`)).p) === '{}');
check('an odd key is refused', /Unknown page/.test((await err(`select set_view_pref('../profiles', '{}')`)) ?? ''));
check('a large value is refused', /too large/.test((await err(`select set_view_pref('admin.members', '{"x":"${'y'.repeat(600)}"}')`)) ?? ''));
await err(`update profiles set view_prefs = '{"admin.members":{"view":"list"}}' where id = '${A}'`); // as B: reaches no row, or is refused
await as(A);
check('another person cannot change mine', (await one(`select my_view_prefs() p`)).p['admin.members']?.view === 'tiles');
await as(null);
check('a visitor saves nothing', (await err(`select set_view_pref('admin.members', '{}')`)) !== null);

console.log(failures ? `\n${failures} check(s) failed` : '\nall passed');
process.exit(failures ? 1 : 0);
