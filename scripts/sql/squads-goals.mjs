/**
 * 0124: squads and the gym-wide goal.
 *
 * Ways it could go wrong, each checked:
 *   - a squad over five, a member in two squads, a stranger joining without the code
 *     or from another gym;
 *   - a squad's code or its members visible to people outside it;
 *   - a squad week paid twice, or a gym goal paid twice, or paid to someone who
 *     did nothing toward it;
 *   - anyone but the owner setting a gym goal.
 *
 *   node <repo>/scripts/sql/squads-goals.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);

const GYM_A = 'c0f1e55e-0000-4000-8000-000000000001';
const GYM_B = 'b0000000-0000-4000-8000-00000000000b';
const M = [1, 2, 3, 4, 5, 6].map((i) => `a2000000-0000-4000-8000-00000000000${i}`);
const ADMIN = 'a2000000-0000-4000-8000-0000000000a1';
const STAFF = 'a2000000-0000-4000-8000-0000000000a2';
const MB = 'b2000000-0000-4000-8000-000000000001';

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const one = async (sql) => (await db.query(sql)).rows[0];
const asOwner = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
async function as(uid) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
  if ((await one('select current_user as u')).u !== 'authenticated') throw new Error('not running as authenticated');
}
const tryExec = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return describe(e); } };
const count = async (sql) => Number((await one(`select count(*)::int as n from (${sql}) x`)).n);

await asOwner();
const ready = await one(`select to_regclass('public.squads') is not null as ok`);
check('0124 is applied (squads exists)', ready.ok);
if (!ready.ok) { console.log(`\n${failures} FAILED`); process.exit(1); }

const person = (id, n) => `insert into auth.users (id, email, raw_user_meta_data) values ('${id}', '${n}@squad-test.com', '{}');
  insert into profiles (id, first_name, last_name, email, status, role) values ('${id}', '${n}', 'Test', '${n}@squad-test.com', 'active', 'member')
    on conflict (id) do update set first_name = excluded.first_name, status = 'active';`;
await db.exec(`
  insert into gyms (id, slug, name) values ('${GYM_B}', 'gym-b', 'Gym B');
  ${M.map((id, i) => person(id, 'm' + (i + 1))).join('\n')}
  ${person(ADMIN, 'owner')} ${person(STAFF, 'desk')} ${person(MB, 'mb')}
  insert into gym_roles (gym_id, user_id, role, status) values
    ${M.map((id) => `('${GYM_A}', '${id}', 'member', 'active')`).join(', ')},
    ('${GYM_A}', '${ADMIN}', 'admin', 'active'), ('${GYM_A}', '${STAFF}', 'staff', 'active'),
    ('${GYM_B}', '${MB}', 'member', 'active')
  on conflict (gym_id, user_id) do update set role = excluded.role, status = excluded.status;
  delete from gym_roles where gym_id = '${GYM_A}' and user_id = '${MB}';
  update profiles set active_gym_id = '${GYM_B}' where id = '${MB}';
  update profiles set active_gym_id = '${GYM_A}' where id in (${[...M, ADMIN, STAFF].map((x) => `'${x}'`).join(',')});
  insert into member_profiles (profile_id, gym_id, qr_code) values
    ${M.map((id, i) => `('${id}', '${GYM_A}', 'QR-S${i}')`).join(', ')}, ('${MB}', '${GYM_B}', 'QR-SB')
    on conflict do nothing;
`);
const prem = (await one(`select id from membership_plans where gym_id = '${GYM_A}' and tier = 'premium' limit 1`)).id;
await db.exec(`insert into memberships (member_id, gym_id, plan_id, status, start_date, expiry_date) values
  ${M.map((id) => `('${id}', '${GYM_A}', '${prem}', 'active', current_date - 1, current_date + 29)`).join(', ')}`);

// ---- squads -------------------------------------------------------------------------------------
await as(M[0]);
const squad = (await one(`select create_squad('Iron Barkada', 3) as id`)).id;
const code = (await one(`select code from squads where id = '${squad}'`)).code;
check('a member creates a squad and gets a 6-letter code', /^[A-Z]{6}$/.test(code), code);
check('and is in it', (await count(`select 1 from squad_members where squad_id = '${squad}' and member_id = '${M[0]}' and left_at is null`)) === 1);
check('a member cannot start a second squad', !!(await tryExec(`select create_squad('Second', 3)`)));

await as(M[1]);
check('a friend joins with the code (any case)', !(await tryExec(`select join_squad('${code.toLowerCase()}')`)));
check('and cannot join twice', !!(await tryExec(`select join_squad('${code}')`)));
for (const m of [M[2], M[3], M[4]]) { await as(m); await db.exec(`select join_squad('${code}')`); }
await as(M[5]);
check('a sixth member is refused — five is the most', !!(await tryExec(`select join_squad('${code}')`)));
check('an outsider cannot read the code', (await count(`select code from squads where id = '${squad}'`)) === 0);
check("nor the squad's members", (await count(`select 1 from squad_members where squad_id = '${squad}'`)) === 0);
check('a wrong code is refused', !!(await tryExec(`select join_squad('ZZZZZZ')`)));
await as(MB);
check("another gym's member cannot join with the code", !!(await tryExec(`select join_squad('${code}')`)));

await as(M[1]);
const mine = (await db.query(`select * from my_squad()`)).rows;
check('my_squad lists all five members', mine.length === 5 && mine[0].squad_name === 'Iron Barkada', JSON.stringify(mine.map((r) => r.first_name)));

// Three members train today.
await asOwner();
await db.exec(`insert into workout_logs (member_id, gym_id, activity, performed_on) values
  ${[M[0], M[1], M[2]].map((m) => `('${m}', '${GYM_A}', 'Gym', (now() at time zone 'Asia/Manila')::date)`).join(', ')}`);

await as(M[5]);
const board = (await db.query(`select * from squad_board()`)).rows;
check('the board shows the squad to anyone in the gym', board.length === 1 && board[0].squad_name === 'Iron Barkada', JSON.stringify(board));
check('with days, target and size, and no member names',
  Number(board[0].days) === 3 && Number(board[0].weekly_target) === 3 && Number(board[0].members) === 5
  && !Object.keys(board[0]).some((k) => /name/.test(k) && k !== 'squad_name'), JSON.stringify(board[0]));

await as(ADMIN);
await db.exec(`select settle_squads(); select settle_squads();`);
check('reaching the target records the week once', (await count(`select 1 from squad_weeks where squad_id = '${squad}'`)) === 1);
await asOwner();
check('and pays every active member once',
  (await count(`select 1 from point_ledger where rule_key = 'squad_week'`)) === 5
  && (await count(`select distinct member_id from point_ledger where rule_key = 'squad_week'`)) === 5);

await as(M[4]);
await db.exec(`select leave_squad()`);
await as(M[5]);
check('once someone leaves, there is room again', !(await tryExec(`select join_squad('${code}')`)));
await as(M[4]);
check('and the leaver may start their own', !(await tryExec(`select create_squad('Solo Start', 2)`)));

// ---- the gym-wide goal ---------------------------------------------------------------------------
await as(M[0]);
check('a member cannot set a gym goal', !!(await tryExec(`insert into gym_goals (title, metric, target, starts_on, ends_on, reward_points)
  values ('x', 'training_days', 1, current_date, current_date + 1, 10)`)));
await as(ADMIN);
const goal = (await one(`insert into gym_goals (title, metric, target, starts_on, ends_on, reward_points)
  values ('100 days in October', 'training_days', 3, current_date - 1, current_date + 5, 40) returning id`)).id;
await as(M[0]);
const g = await one(`select * from current_gym_goal()`);
check('members see the goal with its progress', g && g.title === '100 days in October' && Number(g.progress) === 3, JSON.stringify(g));
check('and their own contribution', Number(g.mine) === 1, JSON.stringify(g));
await as(ADMIN);
await db.exec(`select settle_gym_goals(); select settle_gym_goals();`);
check('reached once', (await one(`select reached_at is not null as r from gym_goals where id = '${goal}'`)).r);
await asOwner();
const paid = (await db.query(`select member_id, points from point_ledger where rule_key = 'gym_goal' and source_id = '${goal}'`)).rows;
check('every contributor is paid the goal points once', paid.length === 3 && paid.every((p) => p.points === 40), JSON.stringify(paid));
check('nobody who did nothing is paid', !paid.some((p) => [M[3], M[4], M[5]].includes(p.member_id)));
await as(MB);
check("gym B sees none of gym A's goals", (await count(`select 1 from gym_goals`)) === 0);

// ---- rules as queries ----------------------------------------------------------------------------
await asOwner();
check('the new tables are in the tenancy list',
  (await one(`select tenancy_gym_tables() @> array['squads','squad_members','squad_weeks','gym_goals'] as ok`)).ok);
check('no write policy on squads, members or weeks',
  (await count(`select 1 from pg_policies where tablename in ('squads','squad_members','squad_weeks')
    and cmd in ('INSERT','UPDATE','DELETE','ALL') and permissive = 'PERMISSIVE'`)) === 0);

console.log(failures ? `\n${failures} FAILED` : '\nall 0124 checks passed');
process.exit(failures ? 1 : 0);
