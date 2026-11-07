/**
 * 0236: usernames and login slips — the username's form and uniqueness (by the
 * function and by a direct write), the stand-in address for a no-email account,
 * the server-only username lookup, the desk's view of a login and who may reset
 * one, and an invitation log that never shows the stand-in address.
 *
 *   node <repo>/scripts/sql/usernames.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);
const GYM = 'c0f1e55e-0000-4000-8000-000000000001';
const OTHER_GYM = 'c0f1e55e-0000-4000-8000-000000000002';
const id = (n) => `a2360000-0000-4000-8000-0000000000${n}`;
const MAIL = id('0a'), NOMAIL = id('0b'), NEWBIE = id('0c'), COACH = id('1a'), AD = id('2a'), ST = id('2b'), FAR = id('3a');
let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const one = async (sql) => (await db.query(sql)).rows[0];
const tryExec = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return describe(e); } };
const tryOne = async (sql) => { try { return { row: await one(sql) }; } catch (e) { return { err: describe(e) }; } };
const as = (uid) => db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
const owner = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);

await owner();
const people = [
  // key, uid, email, role, gym, metadata
  ['mail', MAIL, 'lea@names-test.com', 'member', GYM, '{}'],
  ['nomail', NOMAIL, 'juan.dc@no-email.invalid', 'member', GYM, '{}'],
  ['newbie', NEWBIE, 'ana@names-test.com', 'member', GYM, '{"must_change_password": true}'],
  ['coach', COACH, 'rae.coach@no-email.invalid', 'trainer', GYM, '{}'],
  ['own', AD, 'own@names-test.com', 'admin', GYM, '{}'],
  ['desk', ST, 'desk@names-test.com', 'staff', GYM, '{}'],
  ['far', FAR, 'far@names-test.com', 'member', OTHER_GYM, '{}'],
];
await db.exec(`
  insert into gyms (id, name, slug) values ('${OTHER_GYM}', 'Far Gym', 'far-gym-names') on conflict do nothing;
  ${people.map(([k, u, mail, role, gym, meta]) => `
    insert into auth.users (id, email, raw_user_meta_data) values ('${u}', '${mail}', '${meta}');
    insert into profiles (id, first_name, last_name, email, status, role, active_gym_id)
      values ('${u}', '${k}', 'T', '${mail}', 'active', '${role}', '${gym}') on conflict (id) do nothing;
    insert into gym_roles (gym_id, user_id, role, status) values ('${gym}', '${u}', '${role}', 'active') on conflict do nothing;`).join('\n')}
  update profiles set username = 'juan.dc' where id = '${NOMAIL}';
  update profiles set username = 'rae.coach' where id = '${COACH}';`);

// ---- the form ----
await as(MAIL);
let r = await one(`select set_my_username('  Lea_Lorenzana ') u`);
check('a username is saved trimmed and lowercase', r.u === 'lea_lorenzana', JSON.stringify(r));
for (const [bad, why, re] of [
  ['ab', 'too short', /at least 3/], ['a'.repeat(21), 'too long', /at most 20/], ['lea lorenzana', 'a space', /letters, numbers, dots or underscores/],
  ['.lea', 'starting with a dot', /starting and ending/], ['lea-l', 'a dash', /letters, numbers/], ['admin', 'a reserved word', /kept for the gym/],
  ['juan.dc', "someone else's", /taken/]]) {
  check(`refused: ${why} ("${bad}"), in words`, re.test((await tryExec(`select set_my_username('${bad}')`)) ?? ''));
}
r = await one(`select username_available('lea_lorenzana') a, username_available('JUAN.DC') b, username_available('fresh.name') c`);
check('available: my own counts as free, a taken one says so (any case), a fresh one is free', r.a === null && /taken/.test(r.b ?? '') && r.c === null, JSON.stringify(r));

// Writing the row directly is held to the same rules (RLS cannot limit columns).
check('a direct write of a reserved word is refused', /kept for the gym/.test((await tryExec(`update profiles set username = 'support' where id = '${MAIL}'`)) ?? ''));
check('a direct write of a bad form is refused', !!(await tryExec(`update profiles set username = 'no spaces' where id = '${MAIL}'`)));
check('a direct write of a taken one is refused', !!(await tryExec(`update profiles set username = 'rae.coach' where id = '${MAIL}'`)));

// ---- removing it ----
r = await one(`select set_my_username('') u`);
check('with a real email, the username can be removed', r.u === null);
await as(NOMAIL);
check('with no real email, removing it is refused — it is how they sign in', /how you sign in/.test((await tryExec(`select set_my_username(null)`)) ?? ''));
r = await one(`select * from my_login()`);
check('my_login: no real email reads as none, never the stand-in address', r.username === 'juan.dc' && r.has_email === false && r.email === null, JSON.stringify(r));
await as(MAIL);
r = await one(`select * from my_login()`);
check('my_login: a real email is shown', r.has_email === true && r.email === 'lea@names-test.com', JSON.stringify(r));

// ---- the server-only lookup ----
for (const [who, setRole] of [['a signed-in member', () => as(MAIL)], ['a visitor', () => db.exec(`reset role; set role anon;`)]]) {
  await setRole();
  check(`${who} cannot turn a username into an email`, !!(await tryExec(`select login_email_for_username('juan.dc')`)));
  check(`${who} cannot read the sign-in failures`, !!(await tryExec(`select count(*) from login_failures`)));
}
await db.exec(`reset role; set role service_role;`);
r = await one(`select login_email_for_username('  JUAN.DC ') e, login_email_for_username('nobody.here') n`);
check('the server finds the address for a username (any case), and nothing for an unknown one', r.e === 'juan.dc@no-email.invalid' && r.n === null, JSON.stringify(r));

// ---- what the desk sees, and who may reset ----
await as(ST);
const info = async (u) => one(`select * from login_info_for('${u}')`);
r = await info(NOMAIL);
check('desk, no-email member: username shown, no email, may reset', r.username === 'juan.dc' && r.has_email === false && r.can_reset === true, JSON.stringify(r));
r = await info(MAIL);
check('desk, member with an email who is set up: may NOT reset (Forgot password is theirs)', r.has_email === true && r.set_up === true && r.can_reset === false, JSON.stringify(r));
r = await info(NEWBIE);
check('desk, member who never finished their first sign-in: may reset', r.set_up === false && r.can_reset === true, JSON.stringify(r));
r = await info(COACH);
check('desk, a no-email coach: may NOT reset (the owner does)', r.can_reset === false, JSON.stringify(r));
check('desk, someone from another gym: refused', /not in this gym/.test((await tryOne(`select * from login_info_for('${FAR}')`)).err ?? ''));
await as(AD);
r = await info(COACH);
check('owner, a no-email coach: may reset', r.can_reset === true, JSON.stringify(r));
await as(MAIL);
check('a member cannot see anyone\'s login', /owner or front desk/.test((await tryOne(`select * from login_info_for('${NOMAIL}')`)).err ?? ''));

await as(ST);
check('the reset check refuses an account with its own email', /Forgot password/.test((await tryExec(`select login_reset_check('${MAIL}')`)) ?? ''));
r = await one(`select login_reset_check('${NOMAIL}') u`);
await owner();
const log = await one(`select summary, detail from activity_log where action = 'login.reset' order by id desc limit 1`);
check('the reset check passes a no-email member and writes who was reset to the log', r.u === 'juan.dc' && /login was reset/.test(log?.summary ?? ''), JSON.stringify({ r, log }));

// ---- an invitation for a no-email account ----
await as(ST);
await db.exec(`select * from invite_to_gym('maria.s@no-email.invalid', 'member', 'Maria', 'Santos')`);
await owner();
const inv = await one(`select summary, detail from activity_log where action = 'member.invited' order by id desc limit 1`);
check('the invitation log names the username, never the stand-in address',
  inv.summary === '@maria.s was invited as a member' && !/invalid/.test(JSON.stringify(inv)) && inv.detail.username === 'maria.s', JSON.stringify(inv));
await as(ST);
check('the desk still cannot invite a coach', /only a member/.test((await tryExec(`select * from invite_to_gym('x.y@no-email.invalid', 'trainer')`)) ?? ''));

await owner();
const probe = await one(`select migration_0236_applied() ok`);
check('the probe marker answers', probe.ok === true);

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
