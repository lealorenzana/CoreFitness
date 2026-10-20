/**
 * 0207: the desk closes an equipment report as "not a problem" with a reason
 * the reporter is told; the owner/desk remove a room post or comment and the
 * author is told why. A member or a coach can do neither.
 *
 *   node <repo>/scripts/sql/reports-and-removals.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);
const GYM = 'c0f1e55e-0000-4000-8000-000000000001';
const id = (n) => `a2070000-0000-4000-8000-0000000000${n}`;
const M = id('0a'), T = id('0c'), AD = id('0d'), ST = id('0e');
let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const one = async (sql) => (await db.query(sql)).rows[0];
const tryOne = async (sql) => { try { return { row: (await db.query(sql)).rows[0], err: null }; } catch (e) { return { row: null, err: describe(e) }; } };
const as = (uid) => db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
const owner = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);

await owner();
await db.exec(`
  ${[['m', M, 'member'], ['coach', T, 'trainer'], ['own', AD, 'admin'], ['desk', ST, 'staff']].map(([k, u, role]) => `
    insert into auth.users (id, email, raw_user_meta_data) values ('${u}', '${k}@rr-test.com', '{}');
    insert into profiles (id, first_name, last_name, email, status, role, active_gym_id)
      values ('${u}', '${k}', 'T', '${k}@rr-test.com', 'active', '${role}', '${GYM}') on conflict (id) do update set active_gym_id = excluded.active_gym_id;
    delete from gym_roles where user_id = '${u}';
    insert into gym_roles (gym_id, user_id, role, status) values ('${GYM}', '${u}', '${role}', 'active');`).join('\n')}
  insert into trainer_profiles (profile_id, gym_id, specialization) values ('${T}', '${GYM}', 'Strength') on conflict do nothing;
  insert into member_profiles (profile_id, gym_id, qr_code) values ('${M}', '${GYM}', 'QR-RR1') on conflict do nothing;
  select act_as_gym('${GYM}');
  insert into gym_equipment (id, gym_id, name, category) values ('${id('e1')}', '${GYM}', 'Leg press', 'machines');
  insert into rooms (id, gym_id, kind, trainer_id, member_id, name) values ('${id('b1')}', '${GYM}', 'pt', '${T}', '${M}', 'm · 1-on-1');
  select act_as_gym(null);`);

// A member reports the leg press; the desk finds nothing wrong.
await as(M);
const rep = (await one(`select report_equipment('${id('e1')}', 'The seat pin is stuck') id`)).id;
await as(M);
check('a member cannot close a report', /front desk/.test((await tryOne(`select dismiss_equipment_report('${rep}', 'fine')`)).err ?? ''));
await as(ST);
check('a reason is needed', /few words/.test((await tryOne(`select dismiss_equipment_report('${rep}', '  ')`)).err ?? ''));
let r = await tryOne(`select dismiss_equipment_report('${rep}', 'The pin was locked on purpose — pull, then slide.')`);
check('the desk closes it as not a problem', r.err === null, r.err ?? '');
await owner();
check('…the report is resolved, by the desk, and the machine is untouched',
  (await one(`select status from equipment_reports where id = '${rep}'`)).status === 'resolved'
  && (await one(`select status from gym_equipment where id = '${id('e1')}'`)).status === 'available');
check('…and the member is told what the desk found', !!(await one(`select 1 x from notifications where user_id = '${M}' and message like 'The gym checked it: The pin was locked%'`)));
await as(ST);
check('not twice', /already closed/.test((await tryOne(`select dismiss_equipment_report('${rep}', 'again')`)).err ?? ''));

// The coach posts, the member comments; the desk removes the comment with a reason.
await as(T);
const post = (await one(`insert into room_posts (gym_id, room_id, body) values ('${GYM}', '${id('b1')}', 'Bring water tomorrow') returning id`)).id;
await owner();
const comment = (await one(`insert into room_comments (gym_id, post_id, author_id, body) values ('${GYM}', '${post}', '${M}', 'buy my supplements lol') returning id`)).id;
await as(T);
check('a coach cannot use the desk\'s removal', /owner and the desk/.test((await tryOne(`select moderate_room_item('comment', '${comment}', 'spam')`)).err ?? ''));
await as(AD);
check('the owner must say why', /Say why/.test((await tryOne(`select moderate_room_item('comment', '${comment}', '')`)).err ?? ''));
r = await tryOne(`select moderate_room_item('comment', '${comment}', 'Selling things is not allowed in rooms.')`);
check('the owner removes the comment', r.err === null, r.err ?? '');
await owner();
check('…it is gone', !(await one(`select 1 x from room_comments where id = '${comment}'`)));
check('…and the author is told why', !!(await one(`select 1 x from notifications where user_id = '${M}' and title like 'Your comment in%was removed' and message like 'The gym removed it: Selling%'`)));
await as(ST);
r = await tryOne(`select moderate_room_item('post', '${post}', 'Posted in the wrong room.')`);
check('the desk removes a post, and the coach is told', r.err === null
  && !!(await (async () => { await owner(); return one(`select 1 x from notifications where user_id = '${T}' and title like 'Your post in%'`); })()), r.err ?? '');

await owner();
check('closed to visitors', !(await one(`select has_function_privilege('anon', 'moderate_room_item(text, uuid, text)', 'execute') x`)).x
  && !(await one(`select has_function_privilege('anon', 'dismiss_equipment_report(uuid, text)', 'execute') x`)).x);
check('marker', (await one(`select migration_0207_applied() ok`)).ok === true);
console.log(failures ? `\n${failures} FAILED` : '\nall 0207 checks passed');
process.exit(failures ? 1 : 0);
