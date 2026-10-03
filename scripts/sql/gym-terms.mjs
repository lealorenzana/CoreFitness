/**
 * 0150: a gym that applies agrees to a *version* of the gym documents, by its
 * private status token, once; the platform sees it, nobody else can write it.
 *
 *   node <repo>/scripts/sql/gym-terms.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);

const PA = 'a1000000-0000-4000-8000-000000000019';
const MEM = 'a1000000-0000-4000-8000-000000000014';
const GYM_A = 'c0f1e55e-0000-4000-8000-000000000001';

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const one = async (sql) => (await db.query(sql)).rows[0];
const tryExec = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return describe(e); } };
async function as(uid) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
}
async function asAnon() {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false); set role anon;`);
}

await db.exec(`reset role;
  insert into auth.users (id, email, raw_user_meta_data) values ('${PA}', 'pa@terms-test.com', '{}'), ('${MEM}', 'mem@terms-test.com', '{}');
  insert into profiles (id, first_name, last_name, email, status, role, active_gym_id) values
    ('${PA}', 'P', 'A', 'pa@terms-test.com', 'active', 'member', '${GYM_A}'),
    ('${MEM}', 'M', 'E', 'mem@terms-test.com', 'active', 'member', '${GYM_A}') on conflict do nothing;
  insert into platform_admins (user_id) values ('${PA}') on conflict do nothing;
  insert into gym_roles (gym_id, user_id, role, status) values ('${GYM_A}', '${MEM}', 'member', 'active') on conflict do nothing;`);

// ---- applying and agreeing, as a stranger ------------------------------------------------------
await asAnon();
const token = (await one(`select submit_gym_application('Terms Gym', 'Ana Cruz', 'ana@termsgym.ph', '09171234567') as t`)).t;
check('a stranger can still apply with 0148\'s signature', typeof token === 'string' && token.length >= 32, String(token));

const today = (await one(`select to_char((now() at time zone 'Asia/Manila')::date, 'YYYY-MM-DD') as d`)).d;
const tomorrow = (await one(`select to_char((now() at time zone 'Asia/Manila')::date + 1, 'YYYY-MM-DD') as d`)).d;

check('a malformed version is refused', !!(await tryExec(`select accept_gym_terms('${token}', 'latest')`)));
check('a version from the future is refused', !!(await tryExec(`select accept_gym_terms('${token}', '${tomorrow}')`)));
check('a wrong token changes nothing and says only "no"',
  (await one(`select accept_gym_terms('${'0'.repeat(64)}', '2026-10-03') as ok`)).ok === false);
check('a short token changes nothing', (await one(`select accept_gym_terms('abc', '2026-10-03') as ok`)).ok === false);

check('the applicant agrees, by their token', (await one(`select accept_gym_terms('${token}', '2026-10-03') as ok`)).ok === true);
check('a second call cannot move the version or the date',
  (await one(`select accept_gym_terms('${token}', '${today}') as ok`)).ok === false);
// RLS filters rows and does not raise: a forbidden read is zero rows, a forbidden write zero rows changed.
const anonRead = await tryExec(`select terms_version from gym_applications`)
  ?? ((await db.query(`select terms_version from gym_applications`)).rows.length === 0 ? 'no rows' : null);
check('anon still cannot read the applications table', !!anonRead);
await tryExec(`update gym_applications set terms_version = '2020-01-01', terms_accepted_at = now()`);

// ---- what is stored, and who sees it -----------------------------------------------------------
await db.exec('reset role;');
const row = await one(`select terms_version, terms_accepted_at from gym_applications where status_token = '${token}'`);
check('the first version is the one kept, and anon\'s direct write changed nothing', row.terms_version === '2026-10-03', JSON.stringify(row));
check('with the time it was agreed', row.terms_accepted_at !== null);
check('a version without a time is refused by the table',
  !!(await tryExec(`update gym_applications set terms_accepted_at = null where status_token = '${token}'`)));

await as(PA);
const seen = await one(`select terms_version, terms_accepted_at from platform_applications() where email = 'ana@termsgym.ph'`);
check('the platform sees the version and the time', seen?.terms_version === '2026-10-03' && !!seen?.terms_accepted_at, JSON.stringify(seen));

await as(MEM);
const leaked = await db.query(`select * from platform_applications()`);
check('a gym member sees no applications at all', leaked.rows.length === 0, `${leaked.rows.length} rows`);

// ---- the facts the documents quote ------------------------------------------------------------
await db.exec(`reset role; update platform_billing set grace_days = 10, business_email = 'hello@corefitness.ph', receipt_note = 'internal';`);
await asAnon();
const pub = (await one(`select platform_public_terms() as j`)).j;
check('a stranger reads the grace period and contact the documents quote',
  pub?.grace_days === 10 && pub?.business_email === 'hello@corefitness.ph' && Array.isArray(pub?.reminder_days), JSON.stringify(pub));
check('and nothing else from the billing settings', !('receipt_note' in (pub ?? {})), JSON.stringify(pub));
check('anon still cannot read platform_billing itself',
  !!(await tryExec(`select * from platform_billing`)) || (await db.query(`select * from platform_billing`)).rows.length === 0);

console.log(failures ? `\n${failures} check(s) FAILED` : '\nall gym-terms checks passed');
process.exit(failures ? 1 : 0);
