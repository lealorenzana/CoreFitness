/**
 * 0277: the gym writes its own Today hero. Only the owner may save it; desk, coach, member and a visitor may not;
 * each line has a length a phone holds; blank means the app's default (stored as nothing); my_gym_app() returns
 * the words to the gym's own people and still not to a visitor.
 *
 *   node <repo>/scripts/sql/today-words.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);
const GYM = 'c0f1e55e-0000-4000-8000-000000000001';
const id = (n) => `a2770000-0000-4000-8000-0000000000${n}`;
const OWN = id('01'), DESK = id('02'), COACH = id('03'), MEM = id('04');
let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const one = async (sql) => (await db.query(sql)).rows[0];
const tryExec = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return describe(e); } };
const as = (uid) => db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
const save = (k, l, a, t) => tryExec(`select save_today_words(${[k, l, a, t].map((v) => (v == null ? 'null' : `'${v}'`)).join(', ')})`);

await db.exec(`reset role;
  insert into gyms (id, name, slug) values ('${GYM}', 'Today Test Gym', 'today-test') on conflict (id) do nothing;
  insert into gym_settings (gym_id) values ('${GYM}') on conflict (gym_id) do nothing;
  ${[['own', OWN, 'admin'], ['desk', DESK, 'staff'], ['coach', COACH, 'trainer'], ['mem', MEM, 'member']].map(([k, u, role]) => `
    insert into auth.users (id, email, raw_user_meta_data) values ('${u}', '${k}@today-test.ph', '{}') on conflict (id) do nothing;
    insert into profiles (id, first_name, last_name, email, status, role, active_gym_id)
      values ('${u}', '${k}', 'Test', '${k}@today-test.ph', 'active', '${role}', '${GYM}')
      on conflict (id) do update set active_gym_id = excluded.active_gym_id;
    delete from gym_roles where user_id = '${u}';
    insert into gym_roles (gym_id, user_id, role, status) values ('${GYM}', '${u}', '${role}', 'active');`).join('\n')}`);

const words = async (uid) => { await as(uid); return one(`select today_kicker k, today_lead l, today_accent a, today_line t from my_gym_app()`); };

let w = await words(MEM);
check('a gym that never wrote it returns nothing (the app uses its default)', w && w.k === null && w.l === null && w.a === null && w.t === null, JSON.stringify(w));

await as(OWN);
check('the owner saves the hero', (await save('  Welcome back  ', 'Train with', 'G Fitness.', 'Your gym in Mamburao.')) === null);
w = await words(MEM);
check('a member reads it, trimmed', w.k === 'Welcome back' && w.l === 'Train with' && w.a === 'G Fitness.' && w.t === 'Your gym in Mamburao.', JSON.stringify(w));
w = await words(COACH);
check('a coach reads the same words', w.l === 'Train with');

for (const [who, uid] of [['the desk', DESK], ['a coach', COACH], ['a member', MEM]]) {
  await as(uid);
  check(`${who} cannot change it`, /Only the gym owner/.test((await save('x', 'y', 'z', 'w')) ?? ''));
}
w = await words(MEM);
check('…and nothing changed', w.l === 'Train with');

await as(OWN);
check('the big line is 22 characters or fewer', /22 characters/.test((await save(null, 'x'.repeat(23), null, null)) ?? ''));
check('the coloured line is 22 characters or fewer', /22 characters/.test((await save(null, null, 'x'.repeat(23), null)) ?? ''));
check('the small line is 40 characters or fewer', /40 characters/.test((await save('x'.repeat(41), null, null, null)) ?? ''));
check('the sentence is 120 characters or fewer', /120 characters/.test((await save(null, null, null, 'x'.repeat(121))) ?? ''));
check('exactly at the limits is fine', (await save('x'.repeat(40), 'x'.repeat(22), 'x'.repeat(22), 'x'.repeat(120))) === null);

check('blank goes back to the default (stored as nothing)', (await save('', '   ', null, '')) === null);
w = await words(MEM);
check('…all four are nothing again', w.k === null && w.l === null && w.a === null && w.t === null, JSON.stringify(w));

await db.exec(`reset role;`);
check('the table refuses a too-long line even bypassing the function',
  !!(await tryExec(`update gym_settings set today_lead = '${'x'.repeat(23)}' where gym_id = '${GYM}'`)));

await db.exec(`reset role; set role anon;`);
check('a visitor cannot save it', !!(await save('a', 'b', 'c', 'd')));
check('a visitor cannot read the gym app', !!(await tryExec(`select * from my_gym_app()`)));
check('the probe marker answers a visitor', (await one(`select migration_0277_applied() ok`)).ok === true);

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
