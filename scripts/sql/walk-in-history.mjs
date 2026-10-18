/**
 * 0201: the walk-in history lists every visit in a range with names, for the
 * desk only; a guest's name stays required (0185).
 *
 *   node <repo>/scripts/sql/walk-in-history.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);
const GYM = 'c0f1e55e-0000-4000-8000-000000000001';
const id = (n) => `a2010000-0000-4000-8000-0000000000${n}`;
const AD = id('0a'), ST = id('0b'), M = id('0c');
let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const one = async (sql) => (await db.query(sql)).rows[0];
const all = async (sql) => (await db.query(sql)).rows;
const tryExec = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return describe(e); } };
const as = (uid) => db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
const owner = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);

await owner();
await db.exec(`
  ${[['own', AD, 'admin'], ['desk', ST, 'staff'], ['mem', M, 'member']].map(([k, u, role]) => `
    insert into auth.users (id, email, raw_user_meta_data) values ('${u}', '${k}@whist-test.com', '{}');
    insert into profiles (id, first_name, last_name, email, status, role, active_gym_id)
      values ('${u}', '${k}', 'T', '${k}@whist-test.com', 'active', '${role}', '${GYM}') on conflict (id) do update set active_gym_id = excluded.active_gym_id;
    delete from gym_roles where user_id = '${u}';
    insert into gym_roles (gym_id, user_id, role, status) values ('${GYM}', '${u}', '${role}', 'active');`).join('\n')}
  update gym_settings set day_pass_on = true, day_pass_price = 150, pack5_price = 650 where gym_id = '${GYM}';`);

await as(ST);
check('a new walk-in still needs a name', /Type the guest's name/.test((await tryExec(`select * from record_guest_visit(null, null, '0917 555 0144', 'day', 'cash')`)) ?? ''));
let r = await one(`select * from record_guest_visit(null, 'Ana Reyes', null, 'day', 'cash')`);
r = await one(`select * from record_guest_visit(null, 'Mara Cruz', '0917 555 0144', 'pack5', 'online')`);
const g = r.guest_id;
await one(`select * from record_guest_visit('${g}', null, null, 'pack_visit', 'cash')`);
await one(`select * from record_guest_visit('${g}', null, null, 'pack_visit', 'cash')`);
const h = await all(`select * from guest_visits_between(manila_today() - 30, manila_today())`);
check('the history lists every visit, with names, newest first', h.length === 4 && h.filter((x) => x.name === 'Mara Cruz').length === 3 && h.some((x) => x.name === 'Ana Reyes'), JSON.stringify(h.map((x) => x.name)));
check('…with who recorded it and how they paid', h.every((x) => x.recorded_by_name === 'desk T') && h.some((x) => x.method === 'online'));
check('…and nothing outside the range', (await all(`select * from guest_visits_between(manila_today() - 60, manila_today() - 31)`)).length === 0);
await as(M);
check('a member cannot read the walk-in history', (await all(`select * from guest_visits_between(manila_today() - 30, manila_today())`)).length === 0);
await owner();
check('closed to visitors', !(await one(`select has_function_privilege('anon', 'guest_visits_between(date, date)', 'execute') x`)).x);
check('marker', (await one(`select migration_0201_applied() ok`)).ok === true);
console.log(failures ? `\n${failures} FAILED` : '\nall 0201 checks passed');
process.exit(failures ? 1 : 0);
