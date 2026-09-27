/**
 * 0135: a gym's profile for the platform — contacts (owner and desk only, never
 * members), weekly use, features used, its timeline, and the platform's own
 * notes, which no gym can read or write.
 *
 *   node <repo>/scripts/sql/platform-profile.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);

const GYM = 'c0f1e55e-0000-4000-8000-000000000001';
const P = {
  pa: 'a1000000-0000-4000-8000-000000000009', owner: 'a1000000-0000-4000-8000-000000000001',
  desk: 'a1000000-0000-4000-8000-000000000002', coach: 'a1000000-0000-4000-8000-000000000003',
  mem: 'a1000000-0000-4000-8000-000000000004',
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
  ${Object.entries(P).map(([k, id]) => `insert into auth.users (id, email, raw_user_meta_data, last_sign_in_at)
     values ('${id}', '${k}@prof-test.com', '{}', now() - interval '2 days');
   insert into profiles (id, first_name, last_name, email, phone, status, role, active_gym_id)
     values ('${id}', '${k}', 'Tester', '${k}@prof-test.com', '0917000000', 'active', 'member', '${GYM}') on conflict (id) do nothing;`).join('\n')}
  insert into platform_admins (user_id) values ('${P.pa}') on conflict do nothing;
  insert into gym_roles (gym_id, user_id, role, status) values
    ('${GYM}', '${P.owner}', 'admin', 'active'), ('${GYM}', '${P.desk}', 'staff', 'active'),
    ('${GYM}', '${P.coach}', 'trainer', 'active'), ('${GYM}', '${P.mem}', 'member', 'active')
  on conflict (gym_id, user_id) do update set role = excluded.role;
  insert into member_profiles (profile_id, gym_id, qr_code) values ('${P.mem}', '${GYM}', 'QR-PR') on conflict do nothing;
  select act_as_gym('${GYM}');
  insert into attendance (member_id, gym_id, check_in_time) values
    ('${P.mem}', '${GYM}', now() - interval '1 day'), ('${P.mem}', '${GYM}', now() - interval '40 days');
  select act_as_gym(null);
  insert into platform_events (gym_id, action, summary) values ('${GYM}', 'gym.plan', 'Moved to Premium');`);

await as(P.pa);
const contacts = await all(`select * from platform_gym_contacts('${GYM}')`);
const mine = contacts.find((c) => c.user_id === P.owner);
check('contacts: the owner and the desk', !!mine?.is_owner && contacts.some((c) => c.user_id === P.desk && c.role === 'staff')
  && contacts.every((c) => c.role === 'admin' || c.role === 'staff') && contacts[0].is_owner, JSON.stringify(contacts.map((c) => c.role)));
check('never a member or a coach', !contacts.some((c) => c.user_id === P.mem || c.user_id === P.coach));
check('with phone and last sign-in', !!mine?.phone && !!mine?.last_sign_in_at);
const weeks = await all(`select * from platform_gym_weeks('${GYM}', 8)`);
check('8 weeks, oldest first', weeks.length === 8 && weeks[0].week_start < weeks[7].week_start);
check('check-ins land in their weeks', weeks.reduce((n, w) => n + w.checkins, 0) === 2, JSON.stringify(weeks.map((w) => w.checkins)));
const feats = await all(`select * from platform_gym_features('${GYM}')`);
const ci = feats.find((f) => f.feature === 'checkins');
check('feature use: check-ins 1 in 30 days, 2 ever', ci?.last_30 === 1 && ci?.ever === 2, JSON.stringify(ci));
check('the gym timeline', (await all(`select * from platform_gym_events('${GYM}')`)).some((e) => e.summary === 'Moved to Premium'));
check('the platform writes a note', !(await tryExec(`insert into gym_notes (gym_id, body) values ('${GYM}', 'Owner prefers calls after 6pm')`)));

for (const [who, label] of [[P.owner, "the gym's own owner"], [P.desk, 'its desk'], [P.mem, 'a member']]) {
  await as(who);
  check(`${label} reads no notes`, (await all(`select id from gym_notes`)).length === 0);
  check(`${label} writes no notes`, !!(await tryExec(`insert into gym_notes (gym_id, body) values ('${GYM}', 'x')`)));
  check(`${label} gets no contacts or use`, (await all(`select * from platform_gym_contacts('${GYM}')`)).length === 0
    && (await all(`select * from platform_gym_weeks('${GYM}', 4)`)).length === 0
    && (await all(`select * from platform_gym_features('${GYM}')`)).length === 0);
}

console.log(failures ? `\n${failures} FAILED` : '\nall 0135 checks passed');
process.exit(failures ? 1 : 0);
