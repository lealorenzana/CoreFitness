/**
 * 0131: coach <-> member chat — who may talk, who may read (only the two of
 * them: not the owner, not the desk), unread and "Seen", muting, one alert per
 * burst of messages.
 *
 *   node <repo>/scripts/sql/chat.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);

const GYM_A = 'c0f1e55e-0000-4000-8000-000000000001';
const GYM_B = 'b0000000-0000-4000-8000-00000000000b';
const P = {
  admin: 'a1000000-0000-4000-8000-000000000001', staff: 'a1000000-0000-4000-8000-000000000002',
  coach: 'a1000000-0000-4000-8000-000000000003', coach2: 'a1000000-0000-4000-8000-000000000005',
  mem: 'a1000000-0000-4000-8000-000000000004', other: 'a1000000-0000-4000-8000-000000000006',
  memberB: 'b1000000-0000-4000-8000-000000000004',
};

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const one = async (sql) => (await db.query(sql)).rows[0];
const all = async (sql) => (await db.query(sql)).rows;
const asOwner = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
async function as(uid) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
  if ((await one('select current_user as u')).u !== 'authenticated') throw new Error('not running as authenticated');
}
const tryExec = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return describe(e); } };
const alerts = async (uid) => (await one(`select count(*)::int as n from notifications where user_id = '${uid}' and type = 'message'`)).n;

await asOwner();
const person = (id, name) => `insert into auth.users (id, email, raw_user_meta_data) values ('${id}', '${name}@chat-test.com', '{}');
  insert into profiles (id, first_name, last_name, email, status, role) values ('${id}', '${name}', 'Tester', '${name}@chat-test.com', 'active', 'member')
    on conflict (id) do update set first_name = excluded.first_name, status = 'active';`;
await db.exec(`
  insert into gyms (id, slug, name) values ('${GYM_B}', 'gym-b', 'Gym B');
  ${Object.entries(P).map(([k, v]) => person(v, k)).join('\n')}
  insert into gym_roles (gym_id, user_id, role, status) values
    ('${GYM_A}', '${P.admin}', 'admin', 'active'), ('${GYM_A}', '${P.staff}', 'staff', 'active'),
    ('${GYM_A}', '${P.coach}', 'trainer', 'active'), ('${GYM_A}', '${P.coach2}', 'trainer', 'active'),
    ('${GYM_A}', '${P.mem}', 'member', 'active'), ('${GYM_A}', '${P.other}', 'member', 'active'),
    ('${GYM_B}', '${P.memberB}', 'member', 'active')
  on conflict (gym_id, user_id) do update set role = excluded.role, status = excluded.status;
  delete from gym_roles where gym_id = '${GYM_A}' and user_id = '${P.memberB}';
  update profiles set active_gym_id = '${GYM_B}' where id = '${P.memberB}';
  update profiles set active_gym_id = '${GYM_A}' where id <> '${P.memberB}' and email like '%@chat-test.com';
  insert into member_profiles (profile_id, gym_id, qr_code) values
    ('${P.mem}', '${GYM_A}', 'QR-CM'), ('${P.other}', '${GYM_A}', 'QR-CO'), ('${P.memberB}', '${GYM_B}', 'QR-CB') on conflict do nothing;
  insert into trainer_profiles (profile_id, gym_id) values ('${P.coach}', '${GYM_A}'), ('${P.coach2}', '${GYM_A}') on conflict do nothing;
  select act_as_gym('${GYM_A}');
  insert into memberships (member_id, gym_id, plan_id, status, start_date, expiry_date)
    select '${P.mem}', '${GYM_A}', id, 'active', current_date - 1, current_date + 29
      from membership_plans where gym_id = '${GYM_A}' and tier = 'premium' limit 1;
  insert into pt_sessions (gym_id, member_id, trainer_id, starts_at) values ('${GYM_A}', '${P.mem}', '${P.coach}', now() - interval '2 days');
  select act_as_gym(null);
`);

// ---- 1. who may talk ---------------------------------------------------------------------------
await as(P.mem);
check('a member lists the coaches they train with',
  (await all(`select trainer_id from my_coaches()`)).map((r) => r.trainer_id).join() === P.coach);
const conv = (await one(`select open_conversation('${P.coach}') as id`)).id;
check('a member opens a chat with their coach', !!conv);
check('not with a coach they do not train with', !!(await tryExec(`select open_conversation('${P.coach2}')`)));
check('not with another member', !!(await tryExec(`select open_conversation('${P.other}')`)));
await as(P.other);
check('a member who never trained with the coach cannot start one', !!(await tryExec(`select open_conversation('${P.coach}')`)));
await as(P.coach);
check('the coach opening it finds the same conversation', (await one(`select open_conversation('${P.mem}') as id`)).id === conv);
check('a coach cannot open one with someone they do not coach', !!(await tryExec(`select open_conversation('${P.other}')`)));
await as(P.staff);
check('the desk cannot open one', !!(await tryExec(`select open_conversation('${P.mem}')`)));

// ---- 2. sending, alerts, unread and "Seen" -------------------------------------------------------
await as(P.mem);
await db.exec(`select send_message('${conv}', 'Coach, my knee hurts on squats.')`);
await db.exec(`select send_message('${conv}', 'Should I skip leg day?')`);
check('members cannot write messages directly',
  !!(await tryExec(`insert into messages (gym_id, conversation_id, sender_id, body) values ('${GYM_A}', '${conv}', '${P.mem}', 'x')`)));
await asOwner();
check('two quick messages: one alert for the coach', (await alerts(P.coach)) === 1);
await as(P.coach);
check('the coach has 2 unread', (await one(`select unread from my_conversations()`)).unread === 2);
check('the unread badge says 2', (await one(`select unread_messages() as n`)).n === 2);
await as(P.mem);
check('not "Seen" yet', (await one(`select other_read_at from my_conversations()`)).other_read_at === null);
await as(P.coach);
await db.exec(`select mark_conversation_read('${conv}')`);
check('read: 0 unread', (await one(`select unread from my_conversations()`)).unread === 0);
await as(P.mem);
check('the member sees "Seen"', !!(await one(`select other_read_at from my_conversations()`)).other_read_at);
await as(P.coach);
await db.exec(`select send_message('${conv}', 'Skip squats, do the bike. See you Thursday.')`);
await asOwner();
check('the member is alerted', (await alerts(P.mem)) === 1);

// ---- 3. privacy ------------------------------------------------------------------------------------
for (const [who, label] of [[P.admin, 'the owner'], [P.staff, 'the desk'], [P.other, 'another member'], [P.coach2, 'another coach']]) {
  await as(who);
  check(`${label} cannot read the conversation`, (await all(`select id from conversations`)).length === 0);
  check(`${label} cannot read the messages`, (await all(`select id from messages`)).length === 0);
  check(`${label} cannot send into it`, !!(await tryExec(`select send_message('${conv}', 'hi')`)));
}
await as(P.memberB);
check('another gym sees nothing', (await all(`select id from messages`)).length === 0);

// ---- 4. mute -----------------------------------------------------------------------------------------
await as(P.mem);
await db.exec(`select set_conversation_muted('${conv}', true)`);
await asOwner();
await db.exec(`delete from notifications where user_id = '${P.mem}' and type = 'message'`);
await as(P.coach);
await db.exec(`select send_message('${conv}', 'Also bring a towel.')`);
await asOwner();
check('muted: no alert', (await alerts(P.mem)) === 0);
await as(P.mem);
check('but the message is there, unread', (await one(`select unread from my_conversations()`)).unread === 2);

console.log(failures ? `\n${failures} FAILED` : '\nall 0131 checks passed');
process.exit(failures ? 1 : 0);
