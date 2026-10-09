/**
 * 0170: every notification is pushed by the database — once, only while fresh,
 * and only by the push function (service role), never by a signed-in user.
 *
 *   node <repo>/scripts/sql/push-claim.mjs "<repo>"   (from a dir with pglite installed)
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
const GYM = 'c0f1e55e-0000-4000-8000-000000000001';
const M = 'a9700000-0000-4000-8000-000000000001';

await db.exec(`reset role;
  insert into auth.users (id, email, raw_user_meta_data) values ('${M}', 'push@claim-test.com', '{}');
  insert into profiles (id, first_name, last_name, email, status, role) values ('${M}', 'Pia', 'Test', 'push@claim-test.com', 'active', 'member') on conflict (id) do nothing;`);

// An insert must succeed whatever the push does (no pg_net here: the trigger skips the call).
let err = null;
try { await db.exec(`insert into notifications (gym_id, user_id, type, title, message) values ('${GYM}', '${M}', 'booking', 'Session confirmed', 'Friday 7am')`); }
catch (e) { err = describe(e); }
check('a notification is saved whatever happens to its push', err === null, err ?? '');
const id = (await one(`select id from notifications where user_id = '${M}' order by created_at desc limit 1`)).id;

await db.exec(`set role service_role`);
const first = await one(`select * from claim_notification_push('${id}')`);
const second = await one(`select * from claim_notification_push('${id}')`);
check('the push function claims it, with the row\'s own title, message and recipient',
  first?.user_id === M && first?.title === 'Session confirmed' && first?.message === 'Friday 7am', JSON.stringify(first));
check('…once: a second claim gets nothing', !second, JSON.stringify(second));

await db.exec(`reset role; insert into notifications (gym_id, user_id, type, title, message, created_at)
  values ('${GYM}', '${M}', 'system', 'Old news', 'from yesterday', now() - interval '1 day')`);
const old = (await one(`select id from notifications where title = 'Old news'`)).id;
await db.exec(`set role service_role`);
check('a notification older than two minutes is never pushed', !(await one(`select * from claim_notification_push('${old}')`)));

await db.exec(`reset role; insert into notifications (gym_id, user_id, type, title, message) values ('${GYM}', '${M}', 'system', 'Fresh', 'now')`);
const fresh = (await one(`select id from notifications where title = 'Fresh'`)).id;
await db.exec(`select set_config('request.jwt.claim.sub', '${M}', false); set role authenticated;`);
let refused = false;
try { await db.exec(`select claim_notification_push('${fresh}')`); } catch { refused = true; }
check('a signed-in user cannot claim a push', refused);
await db.exec(`reset role`);
check('…so it is still there for the push function', (await one(`select pushed_at from notifications where id = '${fresh}'`)).pushed_at === null);

console.log(failures ? `\n${failures} FAILED` : '\nall 0170 checks passed');
process.exit(failures ? 1 : 0);
