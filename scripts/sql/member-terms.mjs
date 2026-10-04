/**
 * 0155: which version of the member Terms and Privacy Policy a member agreed
 * to — at sign-up through the real auth trigger chain, and later in the app —
 * who can read it, that nobody can write it directly, and the backfill.
 *
 *   node <repo>/scripts/sql/member-terms.mjs "<repo>"   (from a dir with pglite installed)
 */
import { readFileSync } from 'node:fs';
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);

const GYM_A = 'c0f1e55e-0000-4000-8000-000000000001';
const GYM_B = 'b0000000-0000-4000-8000-00000000000b';
const P = {
  ownerA: 'a3000000-0000-4000-8000-000000000001', deskA: 'a3000000-0000-4000-8000-000000000002',
  ownerB: 'b3000000-0000-4000-8000-000000000001',
};
const M = {
  versioned: 'a3000000-0000-4000-8000-000000000011', bare: 'a3000000-0000-4000-8000-000000000012',
  refused: 'a3000000-0000-4000-8000-000000000013', junk: 'a3000000-0000-4000-8000-000000000014',
};

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const one = async (sql) => (await db.query(sql)).rows[0];
const all = async (sql) => (await db.query(sql)).rows;
const tryExec = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return describe(e); } };
async function as(uid) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
}
async function asAnon() {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false); set role anon;`);
}

await db.exec(`reset role;
  insert into gyms (id, slug, name, plan) values ('${GYM_B}', 'gym-b-terms', 'Gym B', 'trial') on conflict do nothing;
  ${Object.entries(P).map(([k, id]) => `insert into auth.users (id, email, raw_user_meta_data) values ('${id}', '${k}@terms-test.com', '{}');
    insert into profiles (id, first_name, last_name, email, status, role) values ('${id}', '${k}', 'T', '${k}@terms-test.com', 'active', 'member') on conflict do nothing;`).join('\n')}
  insert into gym_roles (gym_id, user_id, role, status) values
    ('${GYM_A}', '${P.ownerA}', 'admin', 'active'), ('${GYM_A}', '${P.deskA}', 'staff', 'active'), ('${GYM_B}', '${P.ownerB}', 'admin', 'active')
  on conflict (gym_id, user_id) do update set role = excluded.role, status = excluded.status;
  update profiles set active_gym_id = '${GYM_A}' where id in ('${P.ownerA}', '${P.deskA}');
  update profiles set active_gym_id = '${GYM_B}' where id = '${P.ownerB}';
  update gyms set onboarded_at = now();`);

// ---- 1. at sign-up, through the real trigger chain -----------------------------------------------
const signup = (id, n, extra) => `insert into auth.users (id, email, raw_user_meta_data) values ('${id}', '${n}@terms-test.com',
  '${JSON.stringify({ signup_source: 'member_self_registration', gym_id: GYM_A, first_name: n, last_name: 'Member', ...extra }).replace(/'/g, "''")}');`;
await db.exec(`reset role;
  ${signup(M.versioned, 'ver', { terms_accepted: 'true', terms_version: '2026-10-03', privacy_version: '2026-09-19' })}
  ${signup(M.bare, 'bare', { terms_accepted: 'true' })}
  ${signup(M.refused, 'refused', { terms_accepted: 'false', terms_version: '2026-10-03', privacy_version: '2026-09-19' })}
  ${signup(M.junk, 'junk', { terms_accepted: 'true', terms_version: 'latest', privacy_version: "x'); drop table profiles; --" })}`);

const rows = async (id) => all(`select document, version, source, accepted_at from terms_acceptances where profile_id = '${id}' order by document`);
const v = await rows(M.versioned);
const stamp = (await one(`select terms_accepted_at from member_profiles where profile_id = '${M.versioned}'`)).terms_accepted_at;
check('a sign-up records the versions the form sent, one row per document',
  v.length === 2 && v[0].document === 'member_privacy' && v[0].version === '2026-09-19' && v[1].version === '2026-10-03' && v.every((r) => r.source === 'signup'),
  JSON.stringify(v));
check('at the same moment 0079 stamped', v.every((r) => +new Date(r.accepted_at) === +new Date(stamp)), `${stamp} vs ${JSON.stringify(v.map((r) => r.accepted_at))}`);
const b = await rows(M.bare);
check('a sign-up that sent no version is "unversioned", not today\'s date', b.length === 2 && b.every((r) => r.version === 'unversioned'), JSON.stringify(b));
check('no tick, no record', (await rows(M.refused)).length === 0);
const j = await rows(M.junk);
check('a malformed version is "unversioned", and the sign-up still went through',
  j.length === 2 && j.every((r) => r.version === 'unversioned')
  && !!(await one(`select 1 as x from member_profiles where profile_id = '${M.junk}'`)), JSON.stringify(j));

// ---- 2. who can read it, and nobody can write it -------------------------------------------------
await db.exec(`reset role; update profiles set active_gym_id = '${GYM_A}' where id in ('${M.versioned}', '${M.bare}', '${M.refused}', '${M.junk}');`);
await as(M.versioned);
const mine = await all(`select profile_id from terms_acceptances`);
check('a member reads only their own', mine.length === 2 && mine.every((r) => r.profile_id === M.versioned), `${mine.length} rows`);
await tryExec(`insert into terms_acceptances (gym_id, profile_id, document, version, source) values ('${GYM_A}', '${M.versioned}', 'member_terms', '2030-01-01', 'in_app')`);
await tryExec(`update terms_acceptances set version = '2030-01-01'`);
await tryExec(`delete from terms_acceptances`);
await db.exec('reset role;');
check('a member cannot insert, rewrite or delete an agreement (RLS: zero rows, no error)',
  (await rows(M.versioned)).map((r) => r.version).join(',') === '2026-09-19,2026-10-03', JSON.stringify(await rows(M.versioned)));

await as(P.deskA);
check('the desk reads its own gym\'s agreements', (await all(`select 1 from terms_acceptances`)).length >= 6);
await as(P.ownerB);
check('another gym\'s owner reads none of them', (await all(`select 1 from terms_acceptances`)).length === 0);
await asAnon();
const anonRead = await tryExec(`select 1 from terms_acceptances`) ?? ((await db.query(`select 1 from terms_acceptances`)).rows.length === 0 ? 'none' : null);
check('anon reads nothing', !!anonRead);

// ---- 3. a newer version, agreed in the app -------------------------------------------------------
await as(M.versioned);
const today = (await one(`select to_char((now() at time zone 'Asia/Manila')::date, 'YYYY-MM-DD') as d`)).d;
const tomorrow = (await one(`select to_char((now() at time zone 'Asia/Manila')::date + 1, 'YYYY-MM-DD') as d`)).d;
check('agreeing to newer versions of both records two', (await one(`select accept_member_terms('${today}', '${today}') as n`)).n === 2);
check('agreeing again records nothing new', (await one(`select accept_member_terms('${today}', '${today}') as n`)).n === 0);
check('one document alone is fine', (await one(`select accept_member_terms(null, '2026-09-20') as n`)).n === 1);
const latest = await one(`select version, source from terms_acceptances where profile_id = '${M.versioned}' and document = 'member_terms' order by accepted_at desc, version desc limit 1`);
check('the newest agreement is the in-app one, and the sign-up one is kept', latest.version === today && latest.source === 'in_app'
  && (await rows(M.versioned)).some((r) => r.source === 'signup'), JSON.stringify(latest));
check('a version from the future is refused', !!(await tryExec(`select accept_member_terms('${tomorrow}', null)`)));
check('a malformed version is refused', !!(await tryExec(`select accept_member_terms('latest', null)`)));
check('nothing at all is refused', !!(await tryExec(`select accept_member_terms(null, null)`)));
await as(P.ownerB);
check('someone who is not a member of the gym cannot agree for it', !!(await tryExec(`select accept_member_terms('${today}', null)`)));
await asAnon();
check('anon cannot call it', !!(await tryExec(`select accept_member_terms('${today}', null)`)));

// ---- 4. the backfill, and tenancy ---------------------------------------------------------------
const OLD = 'a3000000-0000-4000-8000-000000000021';
await db.exec(`reset role;
  alter table member_profiles disable trigger member_terms_from_signup;
  insert into auth.users (id, email, raw_user_meta_data) values ('${OLD}', 'old@terms-test.com', '{}');
  insert into profiles (id, first_name, last_name, email, status, role) values ('${OLD}', 'Old', 'Member', 'old@terms-test.com', 'active', 'member') on conflict do nothing;
  insert into member_profiles (gym_id, profile_id, qr_code, terms_accepted_at) values ('${GYM_A}', '${OLD}', 'OLD-QR-151', '2026-08-01T02:00:00Z')
    on conflict (gym_id, profile_id) do update set terms_accepted_at = excluded.terms_accepted_at;
  alter table member_profiles enable trigger member_terms_from_signup;`);
await db.exec(readFileSync(`${REPO}/supabase/migrations/0155_member_terms_versions.sql`, 'utf8'));
const old = await rows(OLD);
check('re-running 0155 backfills an earlier consent as "unversioned" at 0079\'s time',
  old.length === 2 && old.every((r) => r.version === 'unversioned' && r.source === 'backfill' && +new Date(r.accepted_at) === +new Date('2026-08-01T02:00:00Z')),
  JSON.stringify(old));
check('and adds nothing twice', (await rows(M.versioned)).length === 5, `${(await rows(M.versioned)).length}`);
check('terms_acceptances is on the tenancy list', (await one(`select 'terms_acceptances' = any(tenancy_gym_tables()) as ok`)).ok === true);

console.log(failures ? `\n${failures} check(s) FAILED` : '\nall member-terms checks passed');
process.exit(failures ? 1 : 0);
