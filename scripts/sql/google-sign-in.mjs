/**
 * 0190: an account Google made (no metadata, no profile, no gym) finishes its
 * sign-up through finish_signup() — the gym's joining rule, minimum age and
 * approval apply exactly as on the email form, the Terms versions are recorded
 * — and a Google applicant finds their application and gets a profile.
 *
 *   node <repo>/scripts/sql/google-sign-in.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);
const GYM = 'c0f1e55e-0000-4000-8000-000000000001';
const id = (n) => `a1900000-0000-4000-8000-0000000000${n}`;
const G1 = id('01'), G2 = id('02'), G3 = id('03'), G4 = id('04'), DESK = id('05');
let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const one = async (sql) => (await db.query(sql)).rows[0];
const tryExec = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return describe(e); } };
const as = (uid) => db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
const anon = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false); set role anon;`);
const owner = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
const google = (u, email, given, family) => db.exec(`insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
  values ('${u}', '${email}', now(), '{"iss":"https://accounts.google.com","full_name":"${given} ${family}","given_name":"${given}","family_name":"${family}","avatar_url":"https://x/a.png"}')`);
const finish = (gym, via, code, dob, guardian = null) => `select finish_signup('${gym}', '${via}', ${code ? `'${code}'` : 'null'}, null,
  'Ana', 'Reyes', null, '${dob}', ${guardian ? `'${guardian}'` : 'null'}, 'female', 'Mamburao', 'Rosa Reyes', '09171112222', 'Mother',
  null, '2026-09-14', '2026-09-14') w`;

await owner();
await db.exec(`
  insert into auth.users (id, email, raw_user_meta_data) values ('${DESK}', 'desk@g-test.com', '{}');
  insert into profiles (id, first_name, last_name, email, status, role, active_gym_id) values ('${DESK}', 'Desk', 'T', 'desk@g-test.com', 'active', 'staff', '${GYM}') on conflict (id) do nothing;
  insert into gym_roles (gym_id, user_id, role, status) values ('${GYM}', '${DESK}', 'staff', 'active') on conflict (gym_id, user_id) do update set role = 'staff', status = 'active';
  update gym_settings set join_policy = 'open', join_approval = 'auto', min_age = 16 where gym_id = '${GYM}';`);
await google(G1, 'ana@gmail.com', 'Ana', 'Reyes');
check('a Google account arrives with no profile and no gym', (await one(`select count(*)::int n from profiles where id = '${G1}'`)).n === 0
  && (await one(`select count(*)::int n from gym_roles where user_id = '${G1}'`)).n === 0);

await as(G1);
const st = (await one(`select my_signup_state() s`)).s;
check('its state: no gym, and Google\'s names offered', st.has_profile === false && st.gyms === 0 && st.first_name === 'Ana' && st.last_name === 'Reyes', JSON.stringify(st));
check('the Terms must be agreed', !!(await tryExec(`select finish_signup('${GYM}', 'list', null, null, 'Ana', 'Reyes', null, '2000-01-01', null, null, null, null, null, null, null, null, null)`)));
check('too young for the gym is refused', !!(await tryExec(finish(GYM, 'list', null, '2015-01-01'))));
const way = (await one(finish(GYM, 'list', null, '2000-05-05'))).w;
check('an open gym with automatic approval: in at once', way === 'auto');
await owner();
const r = await one(`select r.status::text st, p.first_name, m.date_of_birth::text dob, m.emergency_contact_name ec
  from gym_roles r join profiles p on p.id = r.user_id join member_profiles m on m.profile_id = r.user_id and m.gym_id = r.gym_id where r.user_id = '${G1}'`);
check('…with a profile, an active role and their details on the member row', r && r.st === 'active' && r.first_name === 'Ana' && r.dob === '2000-05-05' && r.ec === 'Rosa Reyes', JSON.stringify(r));
check('…on the free tier', (await one(`select count(*)::int n from memberships where member_id = '${G1}'`)).n >= 1);
check('…and the Terms versions are recorded', (await one(`select count(*)::int n from terms_acceptances where profile_id = '${G1}' and version = '2026-09-14'`)).n === 2);
check('…and only in that gym', (await one(`select count(*)::int n from gym_roles where user_id = '${G1}'`)).n === 1);
await as(G1);
check('finishing twice is refused', !!(await tryExec(finish(GYM, 'list', null, '2000-05-05'))));

// Desk approval and front-desk-only gyms.
await owner();
await db.exec(`update gym_settings set join_approval = 'desk' where gym_id = '${GYM}'`);
await google(G2, 'ben@gmail.com', 'Ben', 'Cruz');
await as(G2);
check('desk approval: asked, not in', (await one(finish(GYM, 'list', null, '1999-01-01'))).w === 'desk');
await owner();
check('…queued for the desk, and the desk told', (await one(`select status::text s from gym_roles where user_id = '${G2}'`)).s === 'pending_approval'
  && (await one(`select count(*)::int n from pending_registrations where auth_user_id = '${G2}'`)).n === 1
  && (await one(`select count(*)::int n from notifications where user_id = '${DESK}' and title = 'New member request'`)).n >= 1);
await db.exec(`update gym_settings set join_policy = 'closed' where gym_id = '${GYM}'`);
await google(G3, 'cara@gmail.com', 'Cara', 'Lim');
await as(G3);
check('a front-desk-only gym refuses a Google sign-up too', !!(await tryExec(finish(GYM, 'list', null, '1999-01-01'))));
await owner();
check('…and leaves nothing behind', (await one(`select count(*)::int n from profiles where id = '${G3}'`)).n === 0);
await db.exec(`update gym_settings set join_policy = 'open', join_approval = 'desk' where gym_id = '${GYM}'`);

// A Google applicant.
await anon();
await one(`select submit_gym_application('Dee Gym', 'Dee Tan', 'dee@gmail.com', '09170001234') t`);
await owner();
await google(G4, 'dee@gmail.com', 'Dee', 'Tan');
await as(G4);
check('a Google applicant\'s state counts the application', (await one(`select my_signup_state() s`)).s.applications === 1);
check('…and finds it', (await one(`select jsonb_array_length(my_applications()) n`)).n === 1);
await owner();
check('…and gets a profile with no gym, so it can be made the owner', (await one(`select active_gym_id is null ok from profiles where id = '${G4}'`))?.ok === true
  && (await one(`select count(*)::int n from gym_roles where user_id = '${G4}'`)).n === 0);
const G5 = id('06');
await google(G5, 'eli@gmail.com', 'Eli', 'Go');
await as(G5);
await db.exec(`select ensure_my_profile(); select ensure_my_profile();`);
await owner();
check('an invited Google account gets a profile with its email and no gym, once', (await one(`select email, active_gym_id from profiles where id = '${G5}'`))?.email === 'eli@gmail.com'
  && (await one(`select count(*)::int n from gym_roles where user_id = '${G5}'`)).n === 0);
check('marker', (await one(`select migration_0190_applied() ok`)).ok === true);
console.log(failures ? `\n${failures} FAILED` : '\nall 0190 checks passed');
process.exit(failures ? 1 : 0);
