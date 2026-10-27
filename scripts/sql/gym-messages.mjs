/**
 * 0215: a notification the gym wrote is marked `from_gym` — only the gym's owner or desk can mark one,
 * and a member cannot turn the mark on later; the members' note about the redesign is there once.
 *
 *   node <repo>/scripts/sql/gym-messages.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);
const GYM = 'c0f1e55e-0000-4000-8000-000000000001';
const id = (n) => `a2150000-0000-4000-8000-0000000000${n}`;
const M = id('0a'), AD = id('0d'), CO = id('0c');
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
  ${[['m', M, 'member'], ['own', AD, 'admin'], ['coach', CO, 'trainer']].map(([k, u, role]) => `
    insert into auth.users (id, email, raw_user_meta_data) values ('${u}', '${k}@gm-test.com', '{}');
    insert into profiles (id, first_name, last_name, email, status, role, active_gym_id)
      values ('${u}', '${k}', 'T', '${k}@gm-test.com', 'active', '${role}', '${GYM}') on conflict (id) do update set active_gym_id = excluded.active_gym_id;
    delete from gym_roles where user_id = '${u}';
    insert into gym_roles (gym_id, user_id, role, status) values ('${GYM}', '${u}', '${role}', 'active');`).join('\n')}
  insert into member_profiles (profile_id, gym_id, qr_code) values ('${M}', '${GYM}', 'QR-GM1') on conflict do nothing;`);

// The owner's announcement is the gym's.
await as(AD);
let err = await tryExec(`insert into notifications (user_id, type, title, message, read, from_gym) values ('${M}', 'system', 'We are closed today', 'Back tomorrow.', false, true)`);
check('the owner sends an announcement', err === null, err ?? '');
await owner();
check('…and it is marked as the gym\'s', (await one(`select from_gym f from notifications where user_id = '${M}' and title = 'We are closed today'`))?.f === true);

// A coach (not the desk) cannot speak for the gym, even if their insert is allowed.
await as(CO);
await tryExec(`insert into notifications (user_id, type, title, message, read, from_gym) values ('${M}', 'system', 'Coach says', 'Hi.', false, true)`);
await owner();
const coachRow = await one(`select from_gym f from notifications where user_id = '${M}' and title = 'Coach says'`);
check('a coach\'s notice is never marked as the gym\'s', !coachRow || coachRow.f === false, JSON.stringify(coachRow));

// An automatic notice stays unmarked.
await db.exec(`select notify_once('${M}', 'attendance', 'Checked in', 'At the kiosk.', null, 'gm-test-1')`).catch(() => {});
const auto = await one(`select from_gym f from notifications where user_id = '${M}' and title = 'Checked in'`);
check('an automatic notice is not the gym\'s', auto?.f === false, JSON.stringify(auto));

// The member cannot turn the mark on, but can still read and archive.
await as(M);
err = await tryExec(`update notifications set from_gym = true where user_id = '${M}' and title = 'Checked in'`);
check('a member cannot mark a notice as the gym\'s', /Only read\/archived_at\/cleared_at/.test(err ?? ''), err ?? 'no error');
err = await tryExec(`update notifications set read = true where user_id = '${M}' and title = 'We are closed today'`);
check('…and still marks one read', err === null, err ?? '');

await owner();
const note = await one(`select count(*)::int n from app_releases where app = 'member' and title = 'A cleaner, simpler app'`);
check('the members\' redesign note is there, once', note.n === 1, String(note.n));
check('the 0215 marker answers', (await one(`select migration_0215_applied() a`)).a === true);

console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
