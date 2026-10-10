/**
 * 0172: the Workouts section's introduction is shown once per member, and a
 * routine says where it came from (member / AI coach / trainer).
 *
 *   node <repo>/scripts/sql/workouts-section.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);
const GYM = 'c0f1e55e-0000-4000-8000-000000000001';
const A = 'a1720000-0000-4000-8000-000000000001';
const B = 'a1720000-0000-4000-8000-000000000002';

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const one = async (sql) => (await db.query(sql)).rows[0];
const asOwner = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
const as = (uid) => db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
const code = async (sql) => { try { await db.exec(sql); return 'ok'; } catch (e) { return e.code ?? String(e.message); } };

await asOwner();
for (const [id, n] of [[A, 'ana'], [B, 'ben']]) {
  await db.exec(`insert into auth.users (id, email, raw_user_meta_data) values ('${id}', '${n}@wk-test.com', '{}');
    insert into profiles (id, first_name, last_name, email, status, role, active_gym_id) values ('${id}', '${n}', 'T', '${n}@wk-test.com', 'active', 'member', '${GYM}') on conflict (id) do nothing;
    insert into gym_roles (gym_id, user_id, role, status) values ('${GYM}', '${id}', 'member', 'active') on conflict do nothing;
    insert into member_profiles (profile_id, gym_id, qr_code) values ('${id}', '${GYM}', 'QR-${n}') on conflict do nothing;`);
}

await as(A);
check('a member has not seen the introduction yet', (await one(`select workouts_intro_seen_at t from member_profiles where profile_id = '${A}'`)).t === null);
await db.exec(`select mark_workouts_intro_seen()`);
const first = (await one(`select workouts_intro_seen_at t from member_profiles where profile_id = '${A}'`)).t;
check('…marking it records when', first !== null);
await db.exec(`select pg_sleep(0.01); select mark_workouts_intro_seen()`);
const again = (await one(`select workouts_intro_seen_at t from member_profiles where profile_id = '${A}'`)).t;
check('…and a second call keeps the first time', String(again) === String(first), `${first} vs ${again}`);
await asOwner();
check("another member's flag is untouched", (await one(`select workouts_intro_seen_at t from member_profiles where profile_id = '${B}'`)).t === null);
check('with no session the call does nothing', (await code(`select mark_workouts_intro_seen()`)) === 'ok');

await db.exec(`insert into workout_routines (gym_id, member_id, name, source, author_id) values ('${GYM}', '${A}', 'Coach legs', 'trainer', '${B}')`);
check("a coach's routine is 'trainer', with its author",
  (await one(`select source, author_id from workout_routines where name = 'Coach legs'`)).author_id === B);
check('an unknown source is refused', (await code(`insert into workout_routines (gym_id, member_id, name, source) values ('${GYM}', '${A}', 'X', 'x')`)) === '23514');
check('the AI coach keeps its value', (await code(`insert into workout_routines (gym_id, member_id, name, source) values ('${GYM}', '${A}', 'AI', 'coach')`)) === 'ok');
check('marker', (await one(`select migration_0172_applied() ok`)).ok === true);

console.log(failures ? `\n${failures} FAILED` : '\nall 0172 checks passed');
process.exit(failures ? 1 : 0);
