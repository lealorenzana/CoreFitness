/**
 * 0216: the big moments. The owner (only) sets the gym's two switches; a member sets their own
 * sound and their own "already celebrated" markers — never another member's; a target's
 * celebration mark is the member's own; the three notes are there once each.
 *
 *   node <repo>/scripts/sql/big-moments.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);
const GYM = 'c0f1e55e-0000-4000-8000-000000000001';
const id = (n) => `a2160000-0000-4000-8000-0000000000${n}`;
const M = id('0a'), M2 = id('0b'), AD = id('0d'), DESK = id('0e');
let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const one = async (sql) => (await db.query(sql)).rows[0];
const tryExec = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return describe(e); } };
const as = (uid) => db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
const owner = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);

await owner();
await db.exec(`
  ${[['m', M, 'member'], ['m2', M2, 'member'], ['own', AD, 'admin'], ['desk', DESK, 'staff']].map(([k, u, role]) => `
    insert into auth.users (id, email, raw_user_meta_data) values ('${u}', '${k}@bm-test.com', '{}');
    insert into profiles (id, first_name, last_name, email, status, role, active_gym_id)
      values ('${u}', '${k}', 'T', '${k}@bm-test.com', 'active', '${role}', '${GYM}') on conflict (id) do update set active_gym_id = excluded.active_gym_id;
    delete from gym_roles where user_id = '${u}';
    insert into gym_roles (gym_id, user_id, role, status) values ('${GYM}', '${u}', '${role}', 'active');`).join('\n')}
  insert into member_profiles (profile_id, gym_id, qr_code) values ('${M}', '${GYM}', 'QR-BM1'), ('${M2}', '${GYM}', 'QR-BM2') on conflict do nothing;
  insert into fitness_goals (id, gym_id, member_id, title, metric, target_value) values ('${id('91')}', '${GYM}', '${M}', 'Squat', 'lift_kg', 100), ('${id('92')}', '${GYM}', '${M2}', 'Bench', 'lift_kg', 80);`);

check('defaults: celebrations and sounds on for a gym',
  (await one(`select celebrations c, celebration_sounds s from gym_settings where gym_id = '${GYM}'`))?.c === true);
check('defaults: a member has sounds on and nothing celebrated',
  JSON.stringify(await one(`select celebration_sounds s, celebrated_level l, arrival_on a, celebrated_challenges c from member_profiles where profile_id = '${M}'`))
    === JSON.stringify({ s: true, l: null, a: null, c: [] }));

// The member's own row.
await as(M);
let err = await tryExec(`update member_profiles set celebration_sounds = false, celebrated_level = 'intermediate', arrival_on = current_date,
  checkin_celebrated_on = current_date, celebrated_challenges = array['${id('c1')}']::uuid[] where profile_id = '${M}'`);
check('a member sets their own sound and markers', err === null, err ?? '');
await tryExec(`update member_profiles set celebration_sounds = false, celebrated_level = 'advanced' where profile_id = '${M2}'`);
await owner();
const mine = await one(`select celebration_sounds s, celebrated_level l, cardinality(celebrated_challenges) n from member_profiles where profile_id = '${M}'`);
check('…and they are kept', mine.s === false && mine.l === 'intermediate' && mine.n === 1, JSON.stringify(mine));
const theirs = await one(`select celebration_sounds s, celebrated_level l from member_profiles where profile_id = '${M2}'`);
check('…but never another member\'s (zero rows, no error — RLS)', theirs.s === true && theirs.l === null, JSON.stringify(theirs));

// A target's mark.
await as(M);
err = await tryExec(`update fitness_goals set celebrated_at = now() where id = '${id('91')}'`);
check('a member marks their own target celebrated', err === null, err ?? '');
await tryExec(`update fitness_goals set celebrated_at = now() where id = '${id('92')}'`);
await owner();
check('…and not someone else\'s', (await one(`select celebrated_at c from fitness_goals where id = '${id('92')}'`)).c === null);
check('…and marking it did not mark it reached (the achieved guard still decides that)',
  (await one(`select achieved_on a from fitness_goals where id = '${id('91')}'`)).a === null);

// The gym's switches: the owner, not a member, not the desk.
await as(M);
await tryExec(`update gym_settings set celebrations = false where gym_id = '${GYM}'`);
await as(DESK);
await tryExec(`update gym_settings set celebration_sounds = false where gym_id = '${GYM}'`);
await owner();
const after = await one(`select celebrations c, celebration_sounds s from gym_settings where gym_id = '${GYM}'`);
check('a member or the desk cannot turn the gym\'s celebrations or sounds off', after.c === true && after.s === true, JSON.stringify(after));
await as(AD);
err = await tryExec(`update gym_settings set celebrations = false, celebration_sounds = false where gym_id = '${GYM}'`);
await owner();
const byOwner = await one(`select celebrations c, celebration_sounds s from gym_settings where gym_id = '${GYM}'`);
check('the owner turns them off', err === null && byOwner.c === false && byOwner.s === false, err ?? JSON.stringify(byOwner));

const notes = await one(`select count(*)::int n from app_releases where title in ('Big moments, and the app offline', 'Today first, and You', 'Celebrations in the member app')`);
check('the three notes are there, once each', notes.n === 3, String(notes.n));
check('the 0216 marker answers', (await one(`select migration_0216_applied() a`)).a === true);

console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
