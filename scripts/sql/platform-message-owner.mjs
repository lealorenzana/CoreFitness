/**
 * 0240: Core Fitness writes to a gym's owner. Only a platform admin may send; the gym's active owner gets one
 * notification (type platform_message, the gym's id, opening Inbox) — never its front desk, a suspended owner or
 * another gym's people; the owner can read it and the desk cannot; the message is logged for the platform and
 * listed on the gym's page with whether it was read; empty or too-long words are refused.
 *
 *   node <repo>/scripts/sql/platform-message-owner.mjs "<repo>"   (from a dir with pglite installed)
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

const id = (k) => `a2400000-0000-4000-8000-0000000000${k}`;
const [PLAT, OWN, DESK, OLD, OTHER] = ['a1', 'b1', 'c1', 'd1', 'e1'].map(id);
const GYM = 'a2400000-0000-4000-8000-00000000ff01';
const GYM2 = 'a2400000-0000-4000-8000-00000000ff02';
await owner();
const people = [[PLAT, 'Plat'], [OWN, 'Olive'], [DESK, 'Dina'], [OLD, 'Oscar'], [OTHER, 'Otto']];
await db.exec(`
  insert into auth.users (id, email, raw_user_meta_data) values ${people.map(([u, f]) => `('${u}', '${f.toLowerCase()}@m.test', '{}')`).join(',')};
  insert into profiles (id, role, first_name, last_name, email, status) values
    ${people.map(([u, f]) => `('${u}', 'admin', '${f}', 'Test', '${f.toLowerCase()}@m.test', 'active')`).join(',')} on conflict (id) do nothing;
  insert into platform_admins (user_id) values ('${PLAT}') on conflict do nothing;
  insert into gyms (id, name, slug) values ('${GYM}', 'Iron Test Gym', 'iron-test-gym'), ('${GYM2}', 'Other Test Gym', 'other-test-gym');
  insert into gym_roles (gym_id, user_id, role, status) values
    ('${GYM}', '${OWN}', 'admin', 'active'), ('${GYM}', '${DESK}', 'staff', 'active'),
    ('${GYM}', '${OLD}', 'admin', 'suspended'), ('${GYM2}', '${OTHER}', 'admin', 'active');
  update profiles set active_gym_id = '${GYM}' where id in ('${OWN}', '${DESK}', '${OLD}');
  update profiles set active_gym_id = '${GYM2}' where id = '${OTHER}';`);

await as(OWN);
let err = await tryExec(`select platform_message_gym('${GYM}', 'Hello there', 'A message a gym owner should not be able to send.')`);
check('a gym owner cannot send as Core Fitness', err !== null && /Core Fitness/.test(err), String(err));

await as(PLAT);
err = await tryExec(`select platform_message_gym('${GYM}', 'Hi', 'Too short a title for this.')`);
check('a title under 3 characters is refused', err !== null && /title/i.test(err), String(err));
err = await tryExec(`select platform_message_gym('${GYM}', 'A fine title', 'short')`);
check('a message under a sentence is refused', err !== null && /at least a sentence/.test(err), String(err));
err = await tryExec(`select platform_message_gym('${GYM}', 'A fine title', '${'x'.repeat(2001)}')`);
check('a message over 2,000 characters is refused', err !== null && /2,000/.test(err), String(err));
const sent = await one(`select platform_message_gym('${GYM}', 'How is it going at your gym?', 'Hi! We noticed no check-ins in 14 days. Is everything all right?', 'check_in') as n`);
check('the platform admin sends; it reaches one person', Number(sent.n) === 1, JSON.stringify(sent));

await owner();
const row = await one(`select user_id, gym_id, type, action_url, read, metadata->>'from' as frm from notifications where type = 'platform_message'`);
check('the active owner has it, for that gym, opening Inbox', row && row.user_id === OWN && row.gym_id === GYM && row.action_url === '/inbox' && row.frm === 'Core Fitness', JSON.stringify(row));
check('…and nobody else: not the desk, the suspended owner or another gym', await n(`select count(*) as n from notifications where type = 'platform_message'`) === 1);
check('it is logged for the platform', await n(`select count(*) as n from platform_events where action = 'message_owner' and gym_id = '${GYM}'`) === 1);

await as(OWN);
check('the owner can read it', await n(`select count(*) as n from notifications where type = 'platform_message'`) === 1);
await as(DESK);
check('the front desk cannot', await n(`select count(*) as n from notifications where type = 'platform_message'`) === 0);
await as(OWN);
await db.exec(`update notifications set read = true where type = 'platform_message'`);

await as(PLAT);
const list = await one(`select title, reason, recipients, read_by, sent_by from platform_gym_messages('${GYM}')`);
check('the gym page lists it, marked read, with who sent it', list && list.title === 'How is it going at your gym?' && list.reason === 'check_in' && list.recipients === 1 && list.read_by === 1 && /Plat/.test(list.sent_by), JSON.stringify(list));
await as(OWN);
check('an owner cannot list the platform\'s messages', await n(`select count(*) as n from platform_gym_messages('${GYM}')`) === 0);

await as(PLAT);
err = await tryExec(`update gym_roles set status = 'suspended' where gym_id = '${GYM2}'`);
await owner();
await db.exec(`update gym_roles set status = 'suspended' where gym_id = '${GYM2}'`);
await as(PLAT);
err = await tryExec(`select platform_message_gym('${GYM2}', 'Anyone there?', 'A gym with no active owner gets nothing.')`);
check('a gym with no active owner is refused, saying so', err !== null && /no active owner/.test(err), String(err));

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
