/**
 * 0130: the retention radar and win-back messages.
 *
 *   node <repo>/scripts/sql/retention.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);

const GYM_A = 'c0f1e55e-0000-4000-8000-000000000001';
const GYM_B = 'b0000000-0000-4000-8000-00000000000b';
const id = (n) => `a1000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
const P = {
  admin: id(1), staff: id(2), coach: id(3),
  gone: id(10), drop: id(11), expiring: id(12), renewing: id(13), frozen: id(14), healthy: id(15),
  lapsed: id(16), longgone: id(17), missed: id(18),
  adminB: 'b1000000-0000-4000-8000-000000000001',
};
const MEMBERS = ['gone', 'drop', 'expiring', 'renewing', 'frozen', 'healthy', 'lapsed', 'longgone', 'missed'];

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const one = async (sql) => (await db.query(sql)).rows[0];
const all = async (sql) => (await db.query(sql)).rows;
const asOwner = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
async function as(uid) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
  if ((await one('select current_user as u')).u !== 'authenticated') throw new Error('not running as authenticated');
}
const tryExec = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return describe(e); } };
const touched = async (sql) => {
  try { return (await db.query(sql)).affectedRows ?? 0; } catch (e) { return 'ERROR ' + describe(e); }
};

await asOwner();
const person = (pid, name) => `insert into auth.users (id, email, raw_user_meta_data) values ('${pid}', '${name}@ret-test.com', '{}');
  insert into profiles (id, first_name, last_name, email, status, role) values ('${pid}', '${name}', 'Tester', '${name}@ret-test.com', 'active', 'member')
    on conflict (id) do update set first_name = excluded.first_name, status = 'active';`;
await db.exec(`
  insert into gyms (id, slug, name) values ('${GYM_B}', 'gym-b', 'Gym B');
  ${Object.entries(P).map(([k, v]) => person(v, k)).join('\n')}
  insert into gym_roles (gym_id, user_id, role, status) values
    ('${GYM_A}', '${P.admin}', 'admin', 'active'), ('${GYM_A}', '${P.staff}', 'staff', 'active'),
    ('${GYM_A}', '${P.coach}', 'trainer', 'active'), ('${GYM_B}', '${P.adminB}', 'admin', 'active'),
    ${MEMBERS.map((k) => `('${GYM_A}', '${P[k]}', 'member', 'active')`).join(', ')}
  on conflict (gym_id, user_id) do update set role = excluded.role, status = excluded.status;
  delete from gym_roles where gym_id = '${GYM_A}' and user_id = '${P.adminB}';
  update profiles set active_gym_id = '${GYM_B}' where id = '${P.adminB}';
  update profiles set active_gym_id = '${GYM_A}' where id <> '${P.adminB}' and email like '%@ret-test.com';
  insert into member_profiles (profile_id, gym_id, qr_code)
    select v, '${GYM_A}', 'QR-' || v from unnest(array[${MEMBERS.map((k) => `'${P[k]}'::uuid`).join(', ')}]) v on conflict do nothing;
  insert into trainer_profiles (profile_id, gym_id) values ('${P.coach}', '${GYM_A}') on conflict do nothing;
`);
const prem = (await one(`select id from membership_plans where gym_id = '${GYM_A}' and tier = 'premium' limit 1`)).id;
const ms = (k, status, exp) => `('${P[k]}', '${GYM_A}', '${prem}', '${status}', current_date - 60, ${exp})`;
const visits = (k, daysAgo) => daysAgo.map((d) => `('${P[k]}', '${GYM_A}', now() - interval '${d} days')`).join(', ');
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
await db.exec(`select act_as_gym('${GYM_A}');
  insert into memberships (member_id, gym_id, plan_id, status, start_date, expiry_date) values
    ${ms('gone', 'active', 'current_date + 40')}, ${ms('drop', 'active', 'current_date + 40')},
    ${ms('expiring', 'active', 'current_date + 2')}, ${ms('renewing', 'active', 'current_date + 2')},
    ${ms('frozen', 'frozen', 'current_date + 40')}, ${ms('healthy', 'active', 'current_date + 40')},
    ${ms('lapsed', 'expired', 'current_date - 5')}, ${ms('longgone', 'active', 'current_date + 40')},
    ${ms('missed', 'active', 'current_date + 40')};
  insert into attendance (member_id, gym_id, check_in_time) values
    ${visits('gone', [20, 25, 30, 35])},
    ${visits('drop', [3, 16, 18, 20, 23, 26, 30, 33, 37, 40, 45, 50, 55])},
    ${visits('expiring', [2, 5])}, ${visits('renewing', [2, 5])},
    ${visits('frozen', [30])},
    ${visits('healthy', [1, 4, 8, 11, 16, 20, 25, 30, 35, 40, 45, 50, 60])},
    ${visits('lapsed', [3])}, ${visits('longgone', [40, 45])}, ${visits('missed', [1])};
  insert into workout_logs (member_id, gym_id, activity, completed_at, created_at)
    values ('${P.gone}', '${GYM_A}', 'Legs', now() - interval '20 days', now() - interval '20 days');
  insert into renewal_requests (member_id, gym_id, plan_id, status) values ('${P.renewing}', '${GYM_A}', '${prem}', 'open');
  insert into classes (id, gym_id, name, trainer_id, scheduled_at, duration_minutes) values
    ('d1000000-0000-4000-8000-000000000011', '${GYM_A}', 'HIIT', '${P.coach}', now() - interval '6 days', 60),
    ('d1000000-0000-4000-8000-000000000012', '${GYM_A}', 'HIIT', '${P.coach}', now() - interval '9 days', 60);
  insert into bookings (gym_id, member_id, class_id, status) values
    ('${GYM_A}', '${P.missed}', 'd1000000-0000-4000-8000-000000000011', 'approved'),
    ('${GYM_A}', '${P.missed}', 'd1000000-0000-4000-8000-000000000012', 'approved');
  select act_as_gym(null);`);

// ---- 1. who may see it ----------------------------------------------------------------------
await as(P.healthy);
check('a member cannot open the radar', !!(await tryExec(`select * from retention_radar()`)));
await as(P.coach);
check('a trainer cannot either', !!(await tryExec(`select * from retention_radar()`)));

// ---- 2. the signals ------------------------------------------------------------------------------
await as(P.staff);
const rows = await all(`select * from retention_radar()`);
const r = (k) => rows.find((x) => x.member_id === P[k]);
check('14+ days gone, and stopped logging: high', r('gone')?.level === 'high' && r('gone').score === 55, JSON.stringify(r('gone')));
check('the reasons say so', r('gone')?.reasons.some((x) => /No visit in 20 days/.test(x)) && r('gone').reasons.includes('Stopped logging workouts'));
check('visits under half their usual: medium', r('drop')?.level === 'medium' && r('drop').score === 25, JSON.stringify(r('drop')));
check('ends in 2 days, not renewing: high (50)', r('expiring')?.score === 50 && r('expiring').level === 'high', JSON.stringify(r('expiring')));
check('ends in 2 days but asked to renew: not listed', !r('renewing'));
check('frozen is away on purpose: not listed', !r('frozen'));
check('a steady member: not listed', !r('healthy'));
check('missed 2 booked classes alone (15): below the line', !r('missed'));
check('highest risk first', rows[0].score >= rows[rows.length - 1].score);
await as(P.adminB);
check('another gym sees none of these', !!(await tryExec(`select * from retention_radar()`)) || (await all(`select * from retention_radar()`)).length === 0);

// ---- 3. win-back messages: off until the owner turns them on ------------------------------------
await as(P.admin);
check('every gym has the three messages, all off',
  (await one(`select count(*)::int as n, count(*) filter (where is_active)::int as on from winback_rules`)).n === 3
  && (await one(`select count(*) filter (where is_active)::int as on from winback_rules`)).on === 0);
check('nothing is sent while they are off', (await one(`select winback_sweep() as n`)).n === 0);
await as(P.staff);
check('the desk cannot switch one on', (await touched(`update winback_rules set is_active = true where key = 'no_visit_14'`)) === 0);
await as(P.admin);
check('the owner rewords and switches one on',
  (await touched(`update winback_rules set is_active = true, message = 'Miss you! Come by this week.' where key = 'no_visit_14'`)) === 1);
check('it goes to the one member it fits', (await one(`select winback_sweep() as n`)).n === 1);
check('and not again this month', (await one(`select winback_sweep() as n`)).n === 0);
await asOwner();
const got = await one(`select title, message from notifications where user_id = '${P.gone}' and type = 'info' order by created_at desc limit 1`);
check('in the owner\'s words', got?.message === 'Miss you! Come by this week.', JSON.stringify(got));
check('a member gone 40 days does not get the 14-day one',
  (await one(`select count(*)::int as n from notifications where user_id = '${P.longgone}' and type = 'info'`)).n === 0);
await as(P.admin);
await db.exec(`update winback_rules set is_active = true where key in ('no_visit_30', 'lapsed')`);
check('the 30-day and lapsed messages go to theirs', (await one(`select winback_sweep() as n`)).n === 2);
await asOwner();
check('lapsed gets "Come back"',
  (await one(`select count(*)::int as n from notifications where user_id = '${P.lapsed}' and title = 'Come back'`)).n === 1);
check('the frozen member gets nothing',
  (await one(`select count(*)::int as n from notifications where user_id = '${P.frozen}' and type = 'info'`)).n === 0);

// ---- 4. a message from the desk --------------------------------------------------------------------
await as(P.healthy);
check('a member cannot send one', !!(await tryExec(`select send_retention_message('${P.gone}', 'Hi', 'Come back')`)));
await as(P.staff);
check('the desk sends a check-in message', !(await tryExec(`select send_retention_message('${P.drop}', null, 'Hi! Is everything ok? We have new classes on Saturdays.')`)));
check('the radar shows they were contacted', !!(await one(`select last_contact from retention_radar() where member_id = '${P.drop}'`))?.last_contact);
await asOwner();
check('the member got it',
  (await one(`select count(*)::int as n from notifications where user_id = '${P.drop}' and title = 'From your gym'`)).n === 1);

// ---- 5. did it work --------------------------------------------------------------------------------
await db.exec(`select act_as_gym('${GYM_A}'); insert into attendance (member_id, gym_id, check_in_time) values ('${P.gone}', '${GYM_A}', now()); select act_as_gym(null);`);
await as(P.admin);
const res = await all(`select * from winback_results()`);
const w14 = res.find((x) => x.rule_key === 'no_visit_14');
check('results: 1 sent, 1 came back', w14?.sent === 1 && w14?.came_back === 1, JSON.stringify(res));
await as(P.adminB);
check("another gym's owner sees no sends", (await all(`select * from winback_sends`)).length === 0);

console.log(failures ? `\n${failures} FAILED` : '\nall 0130 checks passed');
process.exit(failures ? 1 : 0);
