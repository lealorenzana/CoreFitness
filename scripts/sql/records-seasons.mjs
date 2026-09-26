/**
 * 0123: personal records, weekly quests (repeating challenges), monthly seasons.
 *
 * Each check is a way the feature could reward the wrong thing:
 *   - a first-ever set, a tie, or a custom exercise counted as a PR;
 *   - PR points without the weekly cap (weights are self-typed);
 *   - a removed PR that keeps its points, or keeps blocking real PRs;
 *   - a weekly quest rolled twice, enrolling the desk, or paying twice;
 *   - a season reward claimed twice, below its tier, or handed over by a member;
 *   - a board that shows somebody who never opted in.
 *
 *   node <repo>/scripts/sql/records-seasons.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);

const GYM_A = 'c0f1e55e-0000-4000-8000-000000000001';
const GYM_B = 'b0000000-0000-4000-8000-00000000000b';
const P = {
  admin: 'a1000000-0000-4000-8000-000000000001', staff: 'a1000000-0000-4000-8000-000000000002',
  trainer: 'a1000000-0000-4000-8000-000000000003', m1: 'a1000000-0000-4000-8000-000000000004',
  m2: 'a1000000-0000-4000-8000-000000000006',
  adminB: 'b1000000-0000-4000-8000-000000000001', memberB: 'b1000000-0000-4000-8000-000000000004',
};

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
const ready = await one(`select to_regclass('public.personal_records') is not null as ok`);
check('0123 is applied (personal_records exists)', ready.ok);
if (!ready.ok) { console.log(`\n${failures} FAILED`); process.exit(1); }

const person = (id, email, first) => `insert into auth.users (id, email, raw_user_meta_data) values ('${id}', '${email}', '{}');
  insert into profiles (id, first_name, last_name, email, status, role) values ('${id}', '${first}', 'Test', '${email}', 'active', 'member')
    on conflict (id) do update set first_name = excluded.first_name, status = 'active';`;
await db.exec(`
  insert into gyms (id, slug, name) values ('${GYM_B}', 'gym-b', 'Gym B');
  ${Object.entries(P).map(([k, id]) => person(id, k.toLowerCase() + '@records-test.com', k)).join('\n')}
  insert into gym_roles (gym_id, user_id, role, status) values
    ('${GYM_A}', '${P.admin}', 'admin', 'active'), ('${GYM_A}', '${P.staff}', 'staff', 'active'),
    ('${GYM_A}', '${P.trainer}', 'trainer', 'active'), ('${GYM_A}', '${P.m1}', 'member', 'active'),
    ('${GYM_A}', '${P.m2}', 'member', 'active'),
    ('${GYM_B}', '${P.adminB}', 'admin', 'active'), ('${GYM_B}', '${P.memberB}', 'member', 'active')
  on conflict (gym_id, user_id) do update set role = excluded.role, status = excluded.status;
  delete from gym_roles where gym_id = '${GYM_A}' and user_id in ('${P.adminB}', '${P.memberB}');
  update profiles set active_gym_id = '${GYM_B}' where id in ('${P.adminB}', '${P.memberB}');
  update profiles set active_gym_id = '${GYM_A}' where id in ('${P.admin}','${P.staff}','${P.trainer}','${P.m1}','${P.m2}');
  insert into member_profiles (profile_id, gym_id, qr_code) values
    ('${P.m1}', '${GYM_A}', 'QR-R1'), ('${P.m2}', '${GYM_A}', 'QR-R2'), ('${P.memberB}', '${GYM_B}', 'QR-RB')
    on conflict do nothing;
`);
const premPlan = (await one(`select id from membership_plans where gym_id = '${GYM_A}' and tier = 'premium' limit 1`)).id;
await db.exec(`insert into memberships (member_id, gym_id, plan_id, status, start_date, expiry_date) values
  ('${P.m1}', '${GYM_A}', '${premPlan}', 'active', current_date - 1, current_date + 29),
  ('${P.m2}', '${GYM_A}', '${premPlan}', 'active', current_date - 1, current_date + 29)`);

const exId = async (name) => (await one(`select id from exercises where gym_id is null and name = '${name}'`)).id;
const squat = await exId('Back Squat');
const plank = await exId('Plank');

// One workout log for m1 today, sets added to it one at a time.
await as(P.m1);
const log = (await one(`insert into workout_logs (member_id, activity) values ('${P.m1}', 'Legs') returning id`)).id;
let setNo = 0;
const lift = async (exercise, kg) => (await one(`insert into workout_sets (log_id, exercise_id, set_number, reps, weight_kg)
  values ('${log}', '${exercise}', ${++setNo}, 5, ${kg}) returning id`)).id;
const hold = async (exercise, secs) => (await one(`insert into workout_sets (log_id, exercise_id, set_number, duration_seconds)
  values ('${log}', '${exercise}', ${++setNo}, ${secs}) returning id`)).id;
const prs = async () => (await db.query(`select kind, value::float as value, points_awarded, removed_at from personal_records
  where member_id = '${P.m1}' order by achieved_at, value`)).rows;
const prPoints = async () => Number((await one(`select coalesce(sum(points), 0)::int as n from point_ledger
  where member_id = '${P.m1}' and rule_key = 'personal_record'`)).n);

// ---- personal records ------------------------------------------------------------------
await lift(squat, 60);
check('the first squat is a baseline, not a PR', (await prs()).length === 0);
await lift(squat, 70);
let r = await prs();
check('beating it is a PR', r.length === 1 && r[0].value === 70 && r[0].kind === 'weight', JSON.stringify(r));
check('worth the gym\'s personal_record points', (await prPoints()) === 15, String(await prPoints()));
await asOwner();
check('and the member is told', (await count(`select 1 from notifications where user_id = '${P.m1}' and type = 'personal_record'`)) === 1);
await as(P.m1);
await lift(squat, 70);
check('a tie is not a PR', (await prs()).length === 1);
await hold(plank, 30);
await hold(plank, 45);
r = await prs();
check('a longer hold is a timed PR', r.some((x) => x.kind === 'duration' && x.value === 45), JSON.stringify(r));
await db.exec(`insert into workout_sets (log_id, custom_name, set_number, reps, weight_kg) values ('${log}', 'Tyre flip', ${++setNo}, 5, 10);
  insert into workout_sets (log_id, custom_name, set_number, reps, weight_kg) values ('${log}', 'Tyre flip', ${++setNo}, 5, 200);`);
check('custom exercises never make PRs', (await prs()).length === 2);

const squat80 = await lift(squat, 80);
await lift(squat, 90);
r = await prs();
check('PRs keep being recorded', r.length === 4, JSON.stringify(r));
check('but only 3 earn points in a week', (await prPoints()) === 45 && r.filter((x) => x.points_awarded > 0).length === 3,
  `${await prPoints()} / ${JSON.stringify(r)}`);

check('a member cannot write a PR', !!(await tryExec(`insert into personal_records (member_id, exercise_id, kind, value, previous, set_id)
  values ('${P.m1}', '${squat}', 'weight', 999, 1, '${squat80}')`)));
const pr80 = (await one(`select id from personal_records where set_id = '${squat80}'`)).id;
check('nor remove one', !!(await tryExec(`select remove_personal_record('${pr80}')`)));

await as(P.staff);
await db.exec(`select remove_personal_record('${pr80}')`);
check('the desk removes a PR and its points go back', (await prPoints()) === 30, String(await prPoints()));
check('removing twice does not reverse twice',
  !(await tryExec(`select remove_personal_record('${pr80}')`)) ? (await prPoints()) === 30 : true);

// A fake lift, removed, must not block the real ones after it.
await as(P.m1);
const fake = await lift(squat, 500);
await as(P.staff);
await db.exec(`select remove_personal_record((select id from personal_records where set_id = '${fake}'))`);
await as(P.m1);
await lift(squat, 95);
r = await prs();
check('a removed fake lift does not block the next real PR', r.some((x) => x.value === 95 && !x.removed_at), JSON.stringify(r));

// ---- the PR wall ------------------------------------------------------------------------
await as(P.m2);
check('the wall hides members who have not opted in', (await count(`select * from pr_wall()`)) === 0);
await as(P.m1);
await db.exec(`select set_show_on_boards(true)`);
await as(P.m2);
const wall = (await db.query(`select * from pr_wall()`)).rows;
check('opted in, their PRs show on the wall', wall.length > 0 && wall.every((w) => w.first_name === 'm1'), JSON.stringify(wall));
check('removed PRs never show', !wall.some((w) => Number(w.value) === 500 || Number(w.value) === 80));
await as(P.memberB);
check("gym B's wall shows none of gym A's", (await count(`select * from pr_wall()`)) === 0);

// ---- weekly quests ------------------------------------------------------------------------
await as(P.admin);
const tmpl = (await one(`insert into challenges (title, metric_key, target, starts_on, ends_on, reward_points, repeats_weekly)
  values ('Train once this week', 'training_days', 1, current_date - 10, current_date + 30, 50, true) returning id`)).id;
await db.exec(`select roll_weekly_quests(); select roll_weekly_quests();`);
const kids = (await db.query(`select id, starts_on, ends_on from challenges where parent_id = '${tmpl}'`)).rows;
check("rolling twice makes one copy for this week", kids.length === 1, JSON.stringify(kids));
const child = kids[0].id;
check('running Monday to Sunday', (await one(`select extract(isodow from starts_on)::int as d, (ends_on - starts_on) as span
  from challenges where id = '${child}'`)).d === 1);
const enrolled = (await db.query(`select member_id from challenge_participants where challenge_id = '${child}'`)).rows.map((x) => x.member_id).sort();
check('every active member is in it, and nobody else', JSON.stringify(enrolled) === JSON.stringify([P.m1, P.m2].sort()), JSON.stringify(enrolled));
await db.exec(`select settle_challenges(); select settle_challenges();`);
check('m1 trained today, so the quest pays once',
  (await count(`select 1 from point_ledger where member_id = '${P.m1}' and rule_key = 'challenge_complete' and source_id = '${child}'`)) === 1);
check('m2 did not, so it does not', (await count(`select 1 from point_ledger where member_id = '${P.m2}' and rule_key = 'challenge_complete'`)) === 0);
check('the template itself is never joined', (await count(`select 1 from challenge_participants where challenge_id = '${tmpl}'`)) === 0);

// ---- seasons ------------------------------------------------------------------------------
await as(P.admin);
const reward = (await one(`insert into rewards (name, cost_points) values ('Protein shake', 100) returning id`)).id;
const bronze = (await one(`insert into season_tiers (name, points_needed, reward_id) values ('Bronze', 50, '${reward}') returning id`)).id;
const gold = (await one(`insert into season_tiers (name, points_needed) values ('Gold', 100000) returning id`)).id;
await as(P.m1);
const s = await one(`select * from my_season()`);
const monthSum = Number((await one(`select coalesce(sum(points),0)::int as n from point_ledger where member_id = '${P.m1}'
  and created_at >= date_trunc('month', now() at time zone 'Asia/Manila') at time zone 'Asia/Manila'`)).n);
check("the season score is this month's points", Number(s.score) === monthSum && monthSum >= 50, `${s.score} vs ${monthSum}`);
check('a reached tier can be claimed', !(await tryExec(`select claim_season_reward('${bronze}')`)));
check('once', !!(await tryExec(`select claim_season_reward('${bronze}')`)));
check('a tier not reached cannot be', !!(await tryExec(`select claim_season_reward('${gold}')`)));
check('a claim costs no points', Number((await one(`select member_points_balance('${P.m1}') as b`)).b) === monthSum);
const claim = (await one(`select id from season_claims where member_id = '${P.m1}'`)).id;
check('a member cannot mark it handed over', !!(await tryExec(`select hand_over_season_claim('${claim}')`)));
await as(P.staff);
check('the desk sees it waiting', (await count(`select * from open_season_claims()`)) === 1);
await db.exec(`select hand_over_season_claim('${claim}')`);
check('and hands it over', (await count(`select * from open_season_claims()`)) === 0);
await as(P.m2);
const board = (await db.query(`select * from season_board()`)).rows;
check('the season board shows opted-in members only', board.length >= 1 && board.every((b) => b.first_name === 'm1'), JSON.stringify(board));
const mine = await one(`select * from my_season()`);
check('a member not on the board still sees their own rank', mine.rank !== null && mine.rank !== undefined, JSON.stringify(mine));
await as(P.memberB);
check("gym B sees none of gym A's tiers", (await count(`select 1 from season_tiers`)) === 0);
await as(P.m1);
check('a member cannot create tiers', !!(await tryExec(`insert into season_tiers (name, points_needed) values ('Mine', 1)`)));

// ---- rules as queries -------------------------------------------------------------------
await asOwner();
check('the new tables are in the tenancy list',
  (await one(`select tenancy_gym_tables() @> array['personal_records','season_tiers','season_claims'] as ok`)).ok);
check('no write policy on PRs or claims',
  (await count(`select 1 from pg_policies where tablename in ('personal_records','season_claims')
    and cmd in ('INSERT','UPDATE','DELETE','ALL') and permissive = 'PERMISSIVE'`)) === 0);

console.log(failures ? `\n${failures} FAILED` : '\nall 0123 checks passed');
process.exit(failures ? 1 : 0);
