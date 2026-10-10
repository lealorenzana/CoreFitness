/**
 * 0179: a gym's joining rule (open / code / front desk only), automatic or desk
 * approval, and its minimum age — applied to sign-ups and to existing accounts
 * joining, in SQL.
 *
 *   node <repo>/scripts/sql/joining-rules.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);
const GYM = 'c0f1e55e-0000-4000-8000-000000000001';
const OWNER = 'a1790000-0000-4000-8000-000000000001';
const FRIEND = 'a1790000-0000-4000-8000-000000000002';
let n = 10;
const nextId = () => `a1790000-0000-4000-8000-0000000000${String(n++).padStart(2, '0')}`;
let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const one = async (sql) => (await db.query(sql)).rows[0];
const owner = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
const as = (uid) => db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
const tryExec = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return describe(e); } };
const q = (o) => `'${JSON.stringify(o).replace(/'/g, "''")}'::jsonb`;

/** A self sign-up exactly as the app makes it: an auth user with signup metadata. */
const signUp = async (meta) => {
  const id = nextId();
  const err = await tryExec(`insert into auth.users (id, email, raw_user_meta_data) values ('${id}', 'u${id.slice(-2)}@join-test.com',
    ${q({ signup_source: 'member_self_registration', gym_id: GYM, first_name: 'New', last_name: 'One', ...meta })})`);
  const st = err ? null : (await one(`select status from gym_roles where gym_id = '${GYM}' and user_id = '${id}'`))?.status;
  const ms = err ? null : (await one(`select count(*)::int c from memberships where member_id = '${id}' and gym_id = '${GYM}'`)).c;
  return { id, err, st, ms };
};

await owner();
await db.exec(`
  insert into auth.users (id, email, raw_user_meta_data) values ('${OWNER}', 'owner@join-test.com', '{}'), ('${FRIEND}', 'friend@join-test.com', '{}');
  insert into profiles (id, first_name, last_name, email, status, role, active_gym_id) values
    ('${OWNER}', 'Olga', 'O', 'owner@join-test.com', 'active', 'admin', '${GYM}'),
    ('${FRIEND}', 'Fe', 'F', 'friend@join-test.com', 'active', 'member', '${GYM}') on conflict (id) do nothing;
  insert into gym_roles (gym_id, user_id, role, status) values ('${GYM}', '${OWNER}', 'admin', 'active'), ('${GYM}', '${FRIEND}', 'member', 'active') on conflict do nothing;
  insert into referral_codes (gym_id, member_id, code) values ('${GYM}', '${FRIEND}', 'FRIEND');`);

// ---- open, desk approval (the default: unchanged behaviour) ----
let s = await signUp({});
check('an open gym, desk approval: a sign-up waits for the desk', s.err === null && s.st === 'pending_approval', s.err ?? s.st);

// ---- open, automatic ----
await as(OWNER);
await db.exec(`select set_join_settings('open', 'auto', 16)`);
await owner();
s = await signUp({});
check('automatic approval: a sign-up is let in at once', s.st === 'active', s.err ?? s.st);
check('…on the free tier', s.ms === 1, String(s.ms));
s = await signUp({ date_of_birth: '2015-01-01' });
check('younger than the gym\'s minimum age is refused, in words', s.err !== null && /from age 16/.test(s.err), s.err ?? '');

// ---- code only ----
await as(OWNER);
const code = (await one(`select set_join_settings('code', 'desk', 16) c`)).c;
await owner();
s = await signUp({ join_via: 'list' });
check('a code-only gym refuses a sign-up from the list', s.err !== null && /its code or its own link/.test(s.err), s.err ?? '');
s = await signUp({ join_via: 'code', join_code: 'WRONGX' });
check('…and a wrong code', s.err !== null);
s = await signUp({ join_via: 'code', join_code: code });
check('…but takes the right code', s.err === null && s.st === 'pending_approval', s.err ?? '');
s = await signUp({ join_via: 'link' });
check('…or its own link', s.err === null, s.err ?? '');

// ---- front desk only ----
await as(OWNER);
await db.exec(`select set_join_settings('closed', 'auto', 16)`);
await owner();
s = await signUp({});
check('a front-desk-only gym refuses a self sign-up', s.err !== null && /front desk/.test(s.err), s.err ?? '');
s = await signUp({ referral_code: 'FRIEND' });
check('…but a friend a member invited sends a join request the desk decides', s.err === null && s.st === 'pending_approval', s.err ?? s.st);
check('…which is on the desk\'s queue', !!(await one(`select 1 x from pending_registrations where auth_user_id = '${s.id}'`)));

// ---- an existing account joining ----
const other = nextId();
await db.exec(`insert into auth.users (id, email, raw_user_meta_data) values ('${other}', 'other@join-test.com', '{}');
  insert into profiles (id, first_name, last_name, email, status, role) values ('${other}', 'Oz', 'O', 'other@join-test.com', 'active', 'member') on conflict do nothing;
  delete from gym_roles where user_id = '${other}';`);  // a legacy profile mirror files it under the first gym
await as(other);
check('an existing account cannot join a front-desk-only gym from the list', (await tryExec(`select request_to_join('${GYM}')`)) !== null);
{ const e = await tryExec(`select request_to_join('${GYM}', 'list', null, 'FRIEND')`); check('…but can with a member\'s invite', e === null, e ?? ''); }

await as(FRIEND);
check('only the owner changes the rules', (await tryExec(`select set_join_settings('open', 'auto', 10)`)) !== null);
await owner();
await db.exec(`set role anon;`);
{ const r = await one(`select * from gym_join_rules('${GYM}')`); check('a signed-out screen reads the rule, approval and age (never the code)', r && r.policy === 'closed' && r.approval === 'auto' && r.min_age === 16 && !('join_code' in r), JSON.stringify(r)); }
await owner();
check('marker', (await one(`select migration_0179_applied() ok`)).ok === true);
console.log(failures ? `\n${failures} FAILED` : '\nall 0179 checks passed');
process.exit(failures ? 1 : 0);
