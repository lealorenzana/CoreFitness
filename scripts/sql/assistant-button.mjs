/**
 * 0213: a member chooses where the assistant button sits (header by default, or floating), for
 * themself only and only from the two places that exist; the reward reminder says the gym's own
 * word for its points, never another gym's.
 *
 *   node <repo>/scripts/sql/assistant-button.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);
const GYM = 'c0f1e55e-0000-4000-8000-000000000001';
const id = (n) => `a2130000-0000-4000-8000-0000000000${n}`;
const M = id('0a'), M2 = id('0b');
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
  ${[['a', M], ['b', M2]].map(([k, u], i) => `
    insert into auth.users (id, email, raw_user_meta_data) values ('${u}', '${k}@ab-test.com', '{}');
    insert into profiles (id, first_name, last_name, email, status, role, active_gym_id)
      values ('${u}', '${k}', 'T', '${k}@ab-test.com', 'active', 'member', '${GYM}') on conflict (id) do update set active_gym_id = excluded.active_gym_id;
    delete from gym_roles where user_id = '${u}';
    insert into gym_roles (gym_id, user_id, role, status) values ('${GYM}', '${u}', 'member', 'active');
    insert into member_profiles (profile_id, gym_id, qr_code) values ('${u}', '${GYM}', 'QR-AB${i}') on conflict do nothing;`).join('\n')}`);

// ---- where the assistant sits ---------------------------------------------------------------------------
check('a member starts with the button in the header',
  (await one(`select assistant_button b from member_profiles where profile_id = '${M}'`)).b === 'header');
await as(M);
const moved = await db.query(`update member_profiles set assistant_button = 'floating' where profile_id = '${M}' returning profile_id`);
check('the member moves it to floating, for themself', moved.rows.length === 1);
check('…and it reads back floating', (await one(`select assistant_button b from member_profiles where profile_id = '${M}'`)).b === 'floating');
const bad = await tryExec(`update member_profiles set assistant_button = 'sideways' where profile_id = '${M}'`);
check('only header or floating are allowed', /assistant_button_check|check constraint/i.test(bad ?? ''), bad ?? 'no error');
const other = await db.query(`update member_profiles set assistant_button = 'floating' where profile_id = '${M2}' returning profile_id`);
check('a member cannot move someone else\'s', other.rows.length === 0);
await owner();
check('…whose stays in the header', (await one(`select assistant_button b from member_profiles where profile_id = '${M2}'`)).b === 'header');

// ---- the reward reminder speaks the gym's word ----------------------------------------------------------
await db.exec(`
  update gym_settings set points_name = 'G Points' where gym_id = '${GYM}';
  insert into rewards (gym_id, name, cost_points, is_active) values ('${GYM}', 'Locker for a month', 5, true);
  insert into point_ledger (gym_id, member_id, rule_key, points, source_table, source_id)
    values ('${GYM}', '${M}', 'checkin', 10, 'test', gen_random_uuid());`);
const note = await one(`select message as body from notifications where user_id = '${M}' and title = 'You can claim a reward' order by created_at desc limit 1`);
check('the reminder says the gym\'s points name', /G Points/.test(note?.body ?? '') && !/CORE Points/.test(note?.body ?? ''), note?.body ?? 'no notification');

await db.exec(`update gym_settings set points_name = null where gym_id = '${GYM}'; delete from notifications where user_id = '${M2}';
  insert into point_ledger (gym_id, member_id, rule_key, points, source_table, source_id)
    values ('${GYM}', '${M2}', 'checkin', 10, 'test', gen_random_uuid());`);
const plain = await one(`select message as body from notifications where user_id = '${M2}' and title = 'You can claim a reward' order by created_at desc limit 1`);
check('…and plain "Points" when the gym has not named them', /\d+ Points —/.test(plain?.body ?? ''), plain?.body ?? 'no notification');

await as(M);
check('the 0213 marker answers', (await one(`select migration_0213_applied() a`)).a === true);

console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
