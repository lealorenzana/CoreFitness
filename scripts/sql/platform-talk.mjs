/**
 * 0137: announcements, support tickets and the bell — who may write, who sees.
 *
 *   node <repo>/scripts/sql/platform-talk.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);

const GYM_A = 'c0f1e55e-0000-4000-8000-000000000001';
const GYM_B = 'b0000000-0000-4000-8000-00000000000b';
const P = {
  pa: 'a1000000-0000-4000-8000-000000000009', ownerA: 'a1000000-0000-4000-8000-000000000001',
  deskA: 'a1000000-0000-4000-8000-000000000002', memA: 'a1000000-0000-4000-8000-000000000004',
  ownerB: 'b1000000-0000-4000-8000-000000000001',
};

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const one = async (sql) => (await db.query(sql)).rows[0];
const all = async (sql) => (await db.query(sql)).rows;
async function as(uid) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
}
const tryExec = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return describe(e); } };

await db.exec(`reset role;
  insert into gyms (id, slug, name, plan) values ('${GYM_B}', 'gym-b', 'Gym B', 'trial');
  update gyms set plan = 'premium' where id = '${GYM_A}';
  ${Object.entries(P).map(([k, id]) => `insert into auth.users (id, email, raw_user_meta_data) values ('${id}', '${k}@talk-test.com', '{}');
    insert into profiles (id, first_name, last_name, email, status, role) values ('${id}', '${k}', 'T', '${k}@talk-test.com', 'active', 'member') on conflict do nothing;`).join('\n')}
  insert into platform_admins (user_id) values ('${P.pa}') on conflict do nothing;
  insert into gym_roles (gym_id, user_id, role, status) values
    ('${GYM_A}', '${P.ownerA}', 'admin', 'active'), ('${GYM_A}', '${P.deskA}', 'staff', 'active'),
    ('${GYM_A}', '${P.memA}', 'member', 'active'), ('${GYM_B}', '${P.ownerB}', 'admin', 'active')
  on conflict (gym_id, user_id) do update set role = excluded.role;
  update profiles set active_gym_id = '${GYM_A}' where id in ('${P.pa}', '${P.ownerA}', '${P.deskA}', '${P.memA}');
  update profiles set active_gym_id = '${GYM_B}' where id = '${P.ownerB}';`);

// ---- 1. announcements ----------------------------------------------------------------------
await as(P.ownerA);
check('a gym owner cannot announce', !!(await tryExec(`select save_announcement(null, 'Hi', 'Body', 'info', null, null, null)`)));
check('nobody reads the tables directly', (await all(`select id from platform_announcements`)).length === 0);
await as(P.pa);
const all1 = (await one(`select save_announcement(null, 'Maintenance tonight', 'Down 10–11pm.', 'warning', null, null, null) as id`)).id;
const prem = (await one(`select save_announcement(null, 'New: Shop', 'Premium gyms can sell at the counter.', 'info', 'premium', null, null) as id`)).id;
check('the platform lists what it announced, with reach', (await all(`select * from platform_announcements_list()`)).length === 2);
await as(P.ownerA);
check('a Premium gym sees both', (await all(`select * from my_announcements()`)).length === 2);
await as(P.deskA);
check('its desk sees them too', (await all(`select * from my_announcements()`)).length === 2);
await as(P.memA);
check('a member never sees them', (await all(`select * from my_announcements()`)).length === 0);
await as(P.ownerB);
check('a trial gym sees only the one for everyone', (await all(`select id from my_announcements()`)).map((r) => r.id).join() === all1);
await db.exec(`select dismiss_announcement('${all1}')`);
check('dismissed: gone for that person', (await all(`select * from my_announcements()`)).length === 0);
await as(P.pa);
await db.exec(`select end_announcement('${prem}')`);
await as(P.ownerA);
check('an ended announcement stops showing', !(await all(`select id from my_announcements()`)).some((r) => r.id === prem));

// ---- 2. support ----------------------------------------------------------------------------
await as(P.memA);
check('a member cannot open a ticket', !!(await tryExec(`select open_support_ticket('Help', 'x')`)));
await as(P.deskA);
const t = (await one(`select open_support_ticket('Cannot print receipts', 'The printer button does nothing.') as id`)).id;
check('the desk opens a ticket', !!t);
await as(P.ownerA);
check('the owner sees the same ticket', (await all(`select * from my_support_tickets()`)).length === 1);
await as(P.ownerB);
check('another gym sees no ticket', (await all(`select * from my_support_tickets()`)).length === 0);
check('nor its thread', (await all(`select * from support_thread('${t}')`)).length === 0);
check('nor can it reply', !!(await tryExec(`select reply_support_ticket('${t}', 'hi')`)));
await as(P.pa);
check('the platform sees it, unread', (await one(`select unread from platform_support_tickets() where id = '${t}'`))?.unread === true);
check('the bell counts it', (await one(`select count from platform_bell() where kind = 'support'`))?.count === 1);
check('reading the thread marks it read', (await all(`select * from support_thread('${t}')`)).length === 1
  && (await one(`select unread from platform_support_tickets() where id = '${t}'`)).unread === false);
await db.exec(`select reply_support_ticket('${t}', 'Fixed in today''s update — refresh the page.')`);
await db.exec(`reset role`);
check('whoever opened it is told', (await one(`select count(*)::int as n from notifications where user_id = '${P.deskA}' and title = 'Core Fitness support replied'`)).n === 1);
await as(P.deskA);
const mine = await one(`select * from my_support_tickets()`);
check('the gym sees it answered, unread', mine.status === 'answered' && mine.unread === true, JSON.stringify(mine));
const thread = await all(`select * from support_thread('${t}')`);
check('the thread, both sides, in order', thread.length === 2 && thread[1].from_platform && thread[1].author_name === 'Core Fitness support');
await as(P.pa);
check('answered: the bell stops counting it', !(await all(`select kind from platform_bell()`)).some((r) => r.kind === 'support'));
await as(P.ownerA);
check('a gym owner has no bell', (await all(`select * from platform_bell()`)).length === 0);

console.log(failures ? `\n${failures} FAILED` : '\nall 0137 checks passed');
process.exit(failures ? 1 : 0);
