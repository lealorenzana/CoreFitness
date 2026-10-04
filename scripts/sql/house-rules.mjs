/**
 * 0157: a gym's own house rules — the owner publishes versions that can never
 * be edited, members agree to the version in effect, the desk sees how many
 * did, and nothing crosses between gyms.
 *
 *   node <repo>/scripts/sql/house-rules.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);

const GYM_A = 'c0f1e55e-0000-4000-8000-000000000001';
const GYM_B = 'b0000000-0000-4000-8000-00000000000b';
const P = {
  ownerA: 'a5000000-0000-4000-8000-000000000001', deskA: 'a5000000-0000-4000-8000-000000000002',
  memA: 'a5000000-0000-4000-8000-000000000004', coachA: 'a5000000-0000-4000-8000-000000000006',
  ownerB: 'b5000000-0000-4000-8000-000000000001', memB: 'b5000000-0000-4000-8000-000000000004',
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
  insert into gyms (id, slug, name, plan) values ('${GYM_B}', 'gym-b-house', 'Gym B', 'trial') on conflict do nothing;
  ${Object.entries(P).map(([k, id]) => `insert into auth.users (id, email, raw_user_meta_data) values ('${id}', '${k}@house-test.com', '{}');
    insert into profiles (id, first_name, last_name, email, status, role) values ('${id}', '${k}', 'T', '${k}@house-test.com', 'active', 'member') on conflict do nothing;`).join('\n')}
  insert into gym_roles (gym_id, user_id, role, status) values
    ('${GYM_A}', '${P.ownerA}', 'admin', 'active'), ('${GYM_A}', '${P.deskA}', 'staff', 'active'),
    ('${GYM_A}', '${P.memA}', 'member', 'active'), ('${GYM_A}', '${P.coachA}', 'trainer', 'active'),
    ('${GYM_B}', '${P.ownerB}', 'admin', 'active'), ('${GYM_B}', '${P.memB}', 'member', 'active')
  on conflict (gym_id, user_id) do update set role = excluded.role, status = excluded.status;
  insert into member_profiles (gym_id, profile_id, qr_code) values ('${GYM_A}', '${P.memA}', 'HR-A'), ('${GYM_B}', '${P.memB}', 'HR-B')
    on conflict (gym_id, profile_id) do nothing;
  update profiles set active_gym_id = '${GYM_A}' where id in ('${P.ownerA}', '${P.deskA}', '${P.memA}', '${P.coachA}');
  update profiles set active_gym_id = '${GYM_B}' where id in ('${P.ownerB}', '${P.memB}');
  update gyms set onboarded_at = now();`);

// ---- 1. before any rules ------------------------------------------------------------------------
await as(P.memA);
check('with no rules, a member is asked nothing', (await one(`select my_house_rules() as j`)).j === null);
await as(P.ownerA);
check('withdrawing rules that never existed is refused', !!(await tryExec(`select publish_house_rules('')`)));

// ---- 2. publishing ------------------------------------------------------------------------------
await as(P.deskA);
check('the desk cannot publish', !!(await tryExec(`select publish_house_rules('Towels on benches.')`)));
await as(P.memA);
check('a member cannot publish', !!(await tryExec(`select publish_house_rules('Towels on benches.')`)));
await as(P.ownerA);
check('the owner publishes version 1', (await one(`select publish_house_rules('  Towels on benches.\nNo chalk on the platform.  ') as v`)).v === 1);
check('the same words again are refused', !!(await tryExec(`select publish_house_rules('Towels on benches.\nNo chalk on the platform.')`)));
check('more than 4000 characters is refused', !!(await tryExec(`select publish_house_rules(repeat('x', 4001))`)));
await tryExec(`update gym_house_rules set body = 'Anything goes.'`);
await db.exec('reset role;');
check('nobody — not even the table owner — can edit published rules',
  !!(await tryExec(`update gym_house_rules set body = 'Anything goes.' where gym_id = '${GYM_A}'`)));
check('the stored words are the trimmed ones', (await one(`select body from gym_house_rules where gym_id = '${GYM_A}' and version = 1`)).body === 'Towels on benches.\nNo chalk on the platform.');
check('publishing is in the gym\'s activity log', !!(await one(`select 1 as x from activity_log where action = 'gym.house_rules_published' and gym_id = '${GYM_A}'`)));

// ---- 3. a member agrees ----------------------------------------------------------------------------
await as(P.memA);
const v1 = (await one(`select my_house_rules() as j`)).j;
check('a member sees version 1, not yet agreed', v1?.version === 1 && v1?.accepted_at === null && v1?.agreed_version === null, JSON.stringify(v1));
const bRules = await (async () => { await as(P.ownerB); await db.exec(`select publish_house_rules('Gym B: shoes off on the mats.')`);
  await db.exec('reset role;'); return (await one(`select id from gym_house_rules where gym_id = '${GYM_B}'`)).id; })();
await as(P.memA);
check('a member cannot agree to another gym\'s rules', !!(await tryExec(`select accept_house_rules('${bRules}')`)));
check('a member agrees to the rules in effect', (await one(`select accept_house_rules('${v1.id}') as ok`)).ok === true);
check('agreeing twice records nothing new', (await one(`select accept_house_rules('${v1.id}') as ok`)).ok === false);
const after1 = (await one(`select my_house_rules() as j`)).j;
check('and is then up to date', !!after1?.accepted_at && after1?.agreed_version === 1, JSON.stringify(after1));
await tryExec(`insert into house_rules_acceptances (gym_id, rules_id, profile_id) values ('${GYM_A}', '${v1.id}', '${P.coachA}')`);
await as(P.coachA);
check('a coach (not a member) cannot agree', !!(await tryExec(`select accept_house_rules('${v1.id}')`)));
await db.exec('reset role;');
check('nobody writes agreements directly (zero rows, no error)', (await all(`select 1 from house_rules_acceptances where profile_id = '${P.coachA}'`)).length === 0);

// ---- 4. a new version ---------------------------------------------------------------------------
await as(P.ownerA);
check('the owner publishes version 2', (await one(`select publish_house_rules('Towels on benches.\nNo chalk on the platform.\n90 minutes at peak hours.') as v`)).v === 2);
await as(P.memA);
const v2 = (await one(`select my_house_rules() as j`)).j;
check('the member is behind again, and the screen can say which version they agreed to',
  v2?.version === 2 && v2?.accepted_at === null && v2?.agreed_version === 1, JSON.stringify(v2));
check('agreeing to the old version now is refused', !!(await tryExec(`select accept_house_rules('${v1.id}')`)));
check('agreeing to version 2 works', (await one(`select accept_house_rules('${v2.id}') as ok`)).ok === true);

// ---- 5. who sees what ------------------------------------------------------------------------------
await as(P.deskA);
const hist = await all(`select version, agreed, published_by from house_rules_history()`);
check('the desk sees every version, newest first, with how many agreed',
  hist.length === 2 && hist[0].version === 2 && hist[0].agreed === 1 && hist[1].agreed === 1 && hist[0].published_by === 'ownerA T', JSON.stringify(hist));
await as(P.memA);
check('a member reads only their own agreements', (await all(`select profile_id from house_rules_acceptances`)).every((r) => r.profile_id === P.memA));
check('a member gets no history', (await all(`select * from house_rules_history()`)).length === 0);
await as(P.memB);
check('another gym\'s member reads none of gym A\'s rules', (await all(`select 1 from gym_house_rules where gym_id = '${GYM_A}'`)).length === 0);
check('and sees their own gym\'s', (await one(`select my_house_rules() ->> 'body' as b`)).b === 'Gym B: shoes off on the mats.');
await as(P.ownerB);
check('another gym\'s owner sees none of gym A\'s agreements', (await all(`select 1 from house_rules_acceptances where gym_id = '${GYM_A}'`)).length === 0);
await asAnon();
check('anon reads nothing', !!(await tryExec(`select 1 from gym_house_rules`)) || (await all(`select 1 from gym_house_rules`)).length === 0);
check('anon cannot call my_house_rules', !!(await tryExec(`select my_house_rules()`)));

// ---- 6. withdrawing ------------------------------------------------------------------------------
await as(P.ownerA);
check('publishing nothing withdraws the rules, as version 3', (await one(`select publish_house_rules('') as v`)).v === 3);
await as(P.memA);
check('the member then sees an empty version 3', (await one(`select my_house_rules() ->> 'body' as b`)).b === '');
await db.exec('reset role;');
check('both tables are on the tenancy list', (await one(`select 'gym_house_rules' = any(tenancy_gym_tables()) and 'house_rules_acceptances' = any(tenancy_gym_tables()) as ok`)).ok === true);

console.log(failures ? `\n${failures} check(s) FAILED` : '\nall house-rules checks passed');
process.exit(failures ? 1 : 0);
