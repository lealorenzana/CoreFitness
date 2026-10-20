/**
 * 0202: an invitation is a login. The account the invite-account function made
 * belongs to no gym; complete_invitation() — the first-sign-in form — is the
 * acceptance, saves the form for the role, and gives an invited member the
 * free tier. Withdrawn, expired or someone else's invitation gives nothing.
 *
 *   node <repo>/scripts/sql/invitation-logins.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);
const GYM = 'c0f1e55e-0000-4000-8000-000000000001';
const id = (n) => `a2020000-0000-4000-8000-0000000000${n}`;
const AD = id('0a'), MEM = id('0b'), COACH = id('0c'), DESK = id('0d'), OTHER = id('0e'), LATE = id('0f');
let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const one = async (sql) => (await db.query(sql)).rows[0];
const all = async (sql) => (await db.query(sql)).rows;
const tryExec = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return describe(e); } };
const as = (uid) => db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
const owner = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);

await owner();
// The owner, and four invited people as invite-account leaves them: an auth
// account, a gym-less profile, no gym role.
await db.exec(`
  insert into auth.users (id, email, raw_user_meta_data) values ('${AD}', 'own@inv-test.com', '{}');
  insert into profiles (id, first_name, last_name, email, status, role, active_gym_id)
    values ('${AD}', 'Own', 'T', 'own@inv-test.com', 'active', 'admin', '${GYM}') on conflict (id) do update set active_gym_id = excluded.active_gym_id;
  delete from gym_roles where user_id = '${AD}';
  insert into gym_roles (gym_id, user_id, role, status) values ('${GYM}', '${AD}', 'admin', 'active');
  update membership_plans set is_active = true where gym_id = '${GYM}' and tier = 'free';
  ${[['mem', MEM], ['coach', COACH], ['desk', DESK], ['other', OTHER], ['late', LATE]].map(([k, u]) => `
    insert into auth.users (id, email, raw_user_meta_data) values ('${u}', '${k}@inv-test.com', '{"invite_pending": true, "must_change_password": true}');
    insert into profiles (id, first_name, last_name, email, status, role, active_gym_id)
      values ('${u}', 'New', 'Member', '${k}@inv-test.com', 'active', 'member', null) on conflict (id) do nothing;
    delete from gym_roles where user_id = '${u}';`).join('\n')}`);

await as(AD);
const tok = {};
for (const [k, role] of [['mem', 'member'], ['coach', 'trainer'], ['desk', 'staff'], ['late', 'member']]) {
  tok[k] = (await one(`select token from invite_to_gym('${k}@inv-test.com', '${role}', '${k === 'coach' ? 'Rae' : 'Ana'}', 'Santos', null, null)`)).token;
}
await owner();
const roleOf = async (u) => (await one(`select role::text r, status::text s from gym_roles where user_id = '${u}' and gym_id = '${GYM}'`)) ?? null;
check('an invited account has no gym until the form is finished', (await roleOf(MEM)) === null && (await roleOf(DESK)) === null);

// What the first-sign-in screen reads.
await as(MEM);
const peek = await one(`select * from my_invitation('${tok.mem}')`);
check('my_invitation shows the gym, the role and the names the gym typed', peek?.role === 'member' && peek?.first_name === 'Ana' && peek?.state === 'waiting', JSON.stringify(peek));
await as(OTHER);
check("…and nothing to someone else's account", (await all(`select * from my_invitation('${tok.mem}')`)).length === 0);
check("someone else cannot complete another person's invitation",
  /sent to/.test((await tryExec(`select * from complete_invitation('${tok.mem}', 'X', 'Y', null, '1990-01-01', null, null, null, null, null, null, '2026-01-01', '2026-01-01')`)) ?? ''));

// A member: the register form's details.
await as(MEM);
check('a member must give a date of birth',
  /date of birth/.test((await tryExec(`select * from complete_invitation('${tok.mem}', 'Ana', 'Santos', null, null)`)) ?? ''));
check('…and agree to the Terms and Privacy',
  /Terms/.test((await tryExec(`select * from complete_invitation('${tok.mem}', 'Ana', 'Santos', null, '1995-05-05')`)) ?? ''));
let r = await one(`select * from complete_invitation('${tok.mem}', 'Ana', 'Santos', '0917 555 0101', '1995-05-05', 'female', null, 'Mamburao', 'Maria Santos', '0917 555 0102', 'Mother', '2026-01-01', '2026-01-01')`);
check('the member finishes and joins as a member', r.role === 'member' && r.gym_id === GYM);
await owner();
check('…active in the gym', JSON.stringify(await roleOf(MEM)) === JSON.stringify({ r: 'member', s: 'active' }));
const mp = await one(`select date_of_birth::text dob, gender, emergency_contact_name e, terms_accepted_at is not null t from member_profiles where profile_id = '${MEM}' and gym_id = '${GYM}'`);
check('…with the form saved on their member record', mp?.dob === '1995-05-05' && mp?.gender === 'female' && mp?.e === 'Maria Santos' && mp?.t, JSON.stringify(mp));
check('…their name and phone on the profile, and the gym as their current one',
  !!(await one(`select 1 x from profiles where id = '${MEM}' and first_name = 'Ana' and phone = '0917 555 0101' and active_gym_id = '${GYM}'`)));
const ta = await all(`select document, version, source, gym_id from terms_acceptances where profile_id = '${MEM}'`);
check('…the agreement recorded once, with the versions they read', ta.length === 2 && ta.every((x) => x.version === '2026-01-01'), JSON.stringify(ta) + ' all: ' + JSON.stringify(await all(`select count(*) from terms_acceptances`)));
const free = await one(`select count(*) n from memberships m join membership_plans p on p.id = m.plan_id where m.member_id = '${MEM}' and p.tier = 'free'`);
const freePlan = await one(`select count(*) n from membership_plans where gym_id = '${GYM}' and tier = 'free' and is_active`);
check('…and the free tier, as an approved sign-up gets', Number(freePlan.n) === 0 || Number(free.n) === 1, `free plans ${freePlan.n}, memberships ${free.n}`);
check('…and the account stops asking', !(await one(`select raw_user_meta_data ? 'invite_pending' x from auth.users where id = '${MEM}'`)).x);
check('the invitation reads as accepted', !!(await one(`select 1 x from gym_invitations where token = '${tok.mem}' and accepted_at is not null`)));
await as(MEM);
check('it cannot be used twice', /already been used/.test((await tryExec(`select * from complete_invitation('${tok.mem}', 'Ana', 'Santos', null, '1995-05-05', null, null, null, null, null, null, '2026-01-01', '2026-01-01')`)) ?? ''));

// A coach: what they coach.
await as(COACH);
check('a coach must say what they coach', /what you coach/.test((await tryExec(`select * from complete_invitation('${tok.coach}', 'Rae', 'Santos')`)) ?? ''));
r = await one(`select * from complete_invitation(p_token => '${tok.coach}', p_first => 'Rae', p_last => 'Santos', p_specialization => 'Strength', p_years => 6, p_bio => 'Lifts.')`);
await owner();
const tp = await one(`select specialization s, years_experience y from trainer_profiles where profile_id = '${COACH}' and gym_id = '${GYM}'`);
check('a coach finishes as a coach, with specialty and years saved', r.role === 'trainer' && JSON.stringify(await roleOf(COACH)) === JSON.stringify({ r: 'trainer', s: 'active' }) && tp?.s === 'Strength' && tp?.y === 6, JSON.stringify(tp));

// The front desk: lands on staff, which is what Settings → Staff accounts lists.
await as(DESK);
r = await one(`select * from complete_invitation('${tok.desk}', 'Lea', 'Cruz', '0917 555 0199')`);
await owner();
check('the front desk finishes as staff with the whole desk (no narrowing row)',
  r.role === 'staff' && JSON.stringify(await roleOf(DESK)) === JSON.stringify({ r: 'staff', s: 'active' })
  && !(await one(`select 1 x from staff_permissions where user_id = '${DESK}'`)));

// Withdrawn gives nothing.
const lateId = (await one(`select id from gym_invitations where token = '${tok.late}'`)).id;
await as(AD);
await db.exec(`select revoke_invitation('${lateId}')`);
await as(LATE);
check('a withdrawn invitation gives nothing', /withdrawn/.test((await tryExec(`select * from complete_invitation('${tok.late}', 'Ana', 'Late', null, '1990-01-01', null, null, null, null, null, null, '2026-01-01', '2026-01-01')`)) ?? '')
  && (await roleOf(LATE)) === null);

await owner();
check('closed to visitors', !(await one(`select has_function_privilege('anon', 'my_invitation(text)', 'execute') x`)).x);
check('marker', (await one(`select migration_0202_applied() ok`)).ok === true);
console.log(failures ? `\n${failures} FAILED` : '\nall 0202 checks passed');
process.exit(failures ? 1 : 0);
