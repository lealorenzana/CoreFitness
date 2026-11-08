/**
 * 0242: the front desk reads members' and coaches' notifications — never the owner's, another desk's, or another
 * gym's — and cannot mark read or delete what it cannot read. The owner still reads everyone's in the gym; members
 * and coaches only their own; the desk still reads, recalls and marks its own.
 *
 *   node <repo>/scripts/sql/desk-notifications.mjs "<repo>"   (from a dir with pglite installed)
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
const n = async (sql) => Number((await one(sql)).n);
const tryExec = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return describe(e); } };
const as = (uid) => db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
const owner = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);

const id = (k) => `a2420000-0000-4000-8000-0000000000${k}`;
const [OWN, DESK, DESK2, MEM, COACH, OTHER] = ['01', '02', '03', '04', '05', '06'].map(id);
const GYM = 'a2420000-0000-4000-8000-00000000ff01';
const GYM2 = 'a2420000-0000-4000-8000-00000000ff02';
await owner();
const people = [[OWN, 'Olive', 'admin'], [DESK, 'Dina', 'staff'], [DESK2, 'Dan', 'staff'], [MEM, 'Mia', 'member'], [COACH, 'Cole', 'trainer'], [OTHER, 'Otto', 'member']];
await db.exec(`
  insert into auth.users (id, email, raw_user_meta_data) values ${people.map(([u, f]) => `('${u}', '${f.toLowerCase()}@d.test', '{}')`).join(',')};
  insert into profiles (id, role, first_name, last_name, email, status) values
    ${people.map(([u, f, r]) => `('${u}', '${r === 'staff' ? 'staff' : r}', '${f}', 'Test', '${f.toLowerCase()}@d.test', 'active')`).join(',')} on conflict (id) do nothing;
  insert into gyms (id, name, slug) values ('${GYM}', 'Desk Test Gym', 'desk-test-gym'), ('${GYM2}', 'Other Desk Gym', 'other-desk-gym');
  insert into gym_roles (gym_id, user_id, role, status) values
    ${people.slice(0, 5).map(([u, , r]) => `('${GYM}', '${u}', '${r}', 'active')`).join(',')}, ('${GYM2}', '${OTHER}', 'member', 'active');
  update profiles set active_gym_id = '${GYM}' where id in (${people.slice(0, 5).map(([u]) => `'${u}'`).join(',')});
  update profiles set active_gym_id = '${GYM2}' where id = '${OTHER}';
  insert into notifications (user_id, gym_id, type, title, message) values
    ('${OWN}', '${GYM}', 'system', 'Your Core Fitness plan is due', 'for the owner'),
    ('${DESK2}', '${GYM}', 'system', 'For the other desk', 'desk two'),
    ('${DESK}', '${GYM}', 'system', 'For this desk', 'desk one'),
    ('${MEM}', '${GYM}', 'system', 'For the member', 'member'),
    ('${COACH}', '${GYM}', 'system', 'For the coach', 'coach'),
    ('${OTHER}', '${GYM2}', 'system', 'Another gym', 'other');`);

const titles = async () => (await db.query(`select title from notifications order by title`)).rows.map((r) => r.title);

await as(DESK);
let t = await titles();
check('the desk reads the member\'s and the coach\'s', t.includes('For the member') && t.includes('For the coach'), t.join(' | '));
check('…and its own', t.includes('For this desk'), t.join(' | '));
check('…but not the owner\'s', !t.includes('Your Core Fitness plan is due'), t.join(' | '));
check('…nor the other desk\'s', !t.includes('For the other desk'), t.join(' | '));
check('…nor another gym\'s', !t.includes('Another gym'), t.join(' | '));
await tryExec(`update notifications set read = true where title = 'Your Core Fitness plan is due'`);
await tryExec(`delete from notifications where title = 'Your Core Fitness plan is due'`);
await owner();
const ownRow = await one(`select read from notifications where title = 'Your Core Fitness plan is due'`);
check('the desk cannot mark the owner\'s read or delete it', ownRow && ownRow.read === false, JSON.stringify(ownRow));

await as(DESK);
const del = await db.query(`delete from notifications where title = 'For the member' returning id`);
check('the desk can still recall a member\'s (a broadcast)', del.rows.length === 1, String(del.rows.length));

await as(OWN);
t = await titles();
check('the owner still reads every one in the gym', ['Your Core Fitness plan is due', 'For the other desk', 'For this desk', 'For the coach'].every((x) => t.includes(x)) && !t.includes('Another gym'), t.join(' | '));

await as(MEM);
t = await titles();
check('a member reads only their own (none left after the recall)', t.length === 0, t.join(' | '));
await as(COACH);
t = await titles();
check('a coach reads only their own', t.length === 1 && t[0] === 'For the coach', t.join(' | '));

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
