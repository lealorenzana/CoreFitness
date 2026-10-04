/**
 * 0156: the platform publishes a version of the gym documents; each gym's
 * active owner agrees to that version once; the desk, members, other gyms and
 * strangers cannot; the website and the platform read what they should.
 *
 *   node <repo>/scripts/sql/gym-owner-terms.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);

const GYM_A = 'c0f1e55e-0000-4000-8000-000000000001';
const GYM_B = 'b0000000-0000-4000-8000-00000000000b';
const P = {
  pa: 'a4000000-0000-4000-8000-000000000009', ownerA: 'a4000000-0000-4000-8000-000000000001',
  owner2A: 'a4000000-0000-4000-8000-000000000003', exOwnerA: 'a4000000-0000-4000-8000-000000000005',
  deskA: 'a4000000-0000-4000-8000-000000000002', memA: 'a4000000-0000-4000-8000-000000000004',
  ownerB: 'b4000000-0000-4000-8000-000000000001',
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
  insert into gyms (id, slug, name, plan) values ('${GYM_B}', 'gym-b-owner-terms', 'Gym B', 'trial') on conflict do nothing;
  ${Object.entries(P).map(([k, id]) => `insert into auth.users (id, email, raw_user_meta_data) values ('${id}', '${k}@owner-terms.com', '{}');
    insert into profiles (id, first_name, last_name, email, status, role) values ('${id}', '${k}', 'T', '${k}@owner-terms.com', 'active', 'member') on conflict do nothing;`).join('\n')}
  insert into platform_admins (user_id) values ('${P.pa}') on conflict do nothing;
  insert into gym_roles (gym_id, user_id, role, status) values
    ('${GYM_A}', '${P.ownerA}', 'admin', 'active'), ('${GYM_A}', '${P.owner2A}', 'admin', 'active'),
    ('${GYM_A}', '${P.exOwnerA}', 'admin', 'archived'), ('${GYM_A}', '${P.deskA}', 'staff', 'active'),
    ('${GYM_A}', '${P.memA}', 'member', 'active'), ('${GYM_B}', '${P.ownerB}', 'admin', 'active')
  on conflict (gym_id, user_id) do update set role = excluded.role, status = excluded.status;
  update profiles set active_gym_id = '${GYM_A}' where id in ('${P.pa}', '${P.ownerA}', '${P.owner2A}', '${P.exOwnerA}', '${P.deskA}', '${P.memA}');
  update profiles set active_gym_id = '${GYM_B}' where id = '${P.ownerB}';
  update gyms set onboarded_at = now();`);

const today = (await one(`select to_char((now() at time zone 'Asia/Manila')::date, 'YYYY-MM-DD') as d`)).d;
const tomorrow = (await one(`select to_char((now() at time zone 'Asia/Manila')::date + 1, 'YYYY-MM-DD') as d`)).d;

// ---- 1. drafts: nothing to agree to ---------------------------------------------------------------
await asAnon();
check('the website reads "not published" while they are drafts',
  (await one(`select platform_public_terms() ->> 'gym_terms_published' as v`)).v === null);
await as(P.ownerA);
check('an owner is asked nothing while they are drafts', (await one(`select my_gym_terms() ->> 'published' as v`)).v === null);
check('and cannot agree to a draft', !!(await tryExec(`select accept_gym_terms_owner('${today}')`)));

// ---- 2. publishing -----------------------------------------------------------------------------
check('an owner cannot publish', !!(await tryExec(`select platform_publish_gym_terms('${today}')`)));
await as(P.pa);
check('a malformed version is refused', !!(await tryExec(`select platform_publish_gym_terms('latest')`)));
check('a version dated tomorrow is refused', !!(await tryExec(`select platform_publish_gym_terms('${tomorrow}')`)));
check('the platform publishes today\'s version', !(await tryExec(`select platform_publish_gym_terms('${today}')`)));
await asAnon();
check('and the website reads it', (await one(`select platform_public_terms() ->> 'gym_terms_published' as v`)).v === today);
await db.exec('reset role;');
check('publishing is in the platform log', !!(await one(`select 1 as x from platform_events where action = 'legal.published'`)));

// ---- 3. who may agree --------------------------------------------------------------------------
await as(P.deskA);
check('the desk is asked nothing', (await one(`select my_gym_terms() as j`)).j === null);
check('and cannot agree for the gym', !!(await tryExec(`select accept_gym_terms_owner('${today}')`)));
await as(P.memA);
check('a member cannot agree for the gym', !!(await tryExec(`select accept_gym_terms_owner('${today}')`)));
await as(P.exOwnerA);
check('an archived owner cannot agree for the gym', !!(await tryExec(`select accept_gym_terms_owner('${today}')`)));
await asAnon();
check('anon cannot call it', !!(await tryExec(`select accept_gym_terms_owner('${today}')`)));

await as(P.ownerA);
const before = await one(`select my_gym_terms() as j`);
check('an owner sees the version in effect, not yet agreed', before.j?.published === today && before.j?.accepted_version === null, JSON.stringify(before.j));
check('agreeing to a different version is refused', !!(await tryExec(`select accept_gym_terms_owner('2020-01-01')`)));
check('the owner agrees', (await one(`select accept_gym_terms_owner('${today}') as ok`)).ok === true);
const after = await one(`select my_gym_terms() as j`);
check('and is then not asked again, with their name on it',
  after.j?.accepted_version === today && after.j?.accepted_by === 'ownerA T', JSON.stringify(after.j));
await as(P.owner2A);
check('a second owner is not asked either — the gym has agreed', (await one(`select my_gym_terms() ->> 'accepted_version' as v`)).v === today);
check('and cannot move who agreed or when', (await one(`select accept_gym_terms_owner('${today}') as ok`)).ok === false);
await tryExec(`update gym_terms_acceptances set accepted_by = '${P.owner2A}'`);
await tryExec(`insert into gym_terms_acceptances (gym_id, version, accepted_by) values ('${GYM_A}', '2021-01-01', '${P.owner2A}')`);
await db.exec('reset role;');
const rowsA = await all(`select version, accepted_by from gym_terms_acceptances where gym_id = '${GYM_A}'`);
check('nobody writes the table directly (zero rows, no error)', rowsA.length === 1 && rowsA[0].accepted_by === P.ownerA, JSON.stringify(rowsA));

// ---- 4. other gyms, and the platform ----------------------------------------------------------------
await as(P.ownerB);
check('another gym\'s owner reads none of gym A\'s agreement', (await all(`select 1 from gym_terms_acceptances`)).length === 0);
check('and is still asked for their own gym', (await one(`select my_gym_terms() ->> 'accepted_version' as v`)).v === null);
await as(P.memA);
check('a member reads no agreements', (await all(`select 1 from gym_terms_acceptances`)).length === 0);

await as(P.pa);
const list = await all(`select gym_id, accepted_version, accepted_by, published from platform_gym_terms()`);
const a = list.find((r) => r.gym_id === GYM_A); const b = list.find((r) => r.gym_id === GYM_B);
check('the platform sees which gyms agreed, and who', a?.accepted_version === today && a?.accepted_by === 'ownerA T' && a?.published === today, JSON.stringify(a));
check('and which have not', b && b.accepted_version === null, JSON.stringify(b));
await as(P.ownerA);
check('an owner cannot read the platform\'s list', (await all(`select * from platform_gym_terms()`)).length === 0);

// ---- 5. withdrawing --------------------------------------------------------------------------
await as(P.pa);
await db.exec(`select platform_publish_gym_terms(null)`);
await asAnon();
check('setting them back to draft is read by the website', (await one(`select platform_public_terms() ->> 'gym_terms_published' as v`)).v === null);
await db.exec('reset role;');
check('and the agreement already given is kept', (await all(`select 1 from gym_terms_acceptances where gym_id = '${GYM_A}'`)).length === 1);
check('gym_terms_acceptances is on the tenancy list', (await one(`select 'gym_terms_acceptances' = any(tenancy_gym_tables()) as ok`)).ok === true);

console.log(failures ? `\n${failures} check(s) FAILED` : '\nall gym-owner-terms checks passed');
process.exit(failures ? 1 : 0);
