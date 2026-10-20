/**
 * 0205: the desk logs a call to a member the radar lists — recorded as contact,
 * never swallowed by the once-a-month cap, and it holds back an automatic
 * win-back that month; a member or a coach cannot log one.
 *
 *   node <repo>/scripts/sql/retention-calls.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);
const GYM = 'c0f1e55e-0000-4000-8000-000000000001';
const id = (n) => `a2050000-0000-4000-8000-0000000000${n}`;
const M = id('0a'), M2 = id('0b'), T = id('0c'), AD = id('0d'), ST = id('0e');
let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const one = async (sql) => (await db.query(sql)).rows[0];
const tryOne = async (sql) => { try { return { row: (await db.query(sql)).rows[0], err: null }; } catch (e) { return { row: null, err: describe(e) }; } };
const as = (uid) => db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
const owner = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);

await owner();
await db.exec(`
  ${[['m', M, 'member'], ['m2', M2, 'member'], ['coach', T, 'trainer'], ['own', AD, 'admin'], ['desk', ST, 'staff']].map(([k, u, role]) => `
    insert into auth.users (id, email, raw_user_meta_data) values ('${u}', '${k}@calls-test.com', '{}');
    insert into profiles (id, first_name, last_name, email, status, role, active_gym_id)
      values ('${u}', '${k}', 'T', '${k}@calls-test.com', 'active', '${role}', '${GYM}') on conflict (id) do update set active_gym_id = excluded.active_gym_id;
    delete from gym_roles where user_id = '${u}';
    insert into gym_roles (gym_id, user_id, role, status) values ('${GYM}', '${u}', '${role}', 'active');`).join('\n')}
  insert into trainer_profiles (profile_id, gym_id, specialization) values ('${T}', '${GYM}', 'Strength') on conflict do nothing;
  insert into member_profiles (profile_id, gym_id, qr_code) values ('${M}', '${GYM}', 'QR-RC1'), ('${M2}', '${GYM}', 'QR-RC2') on conflict do nothing;`);

await as(ST);
let r = await tryOne(`select log_retention_call('${M}', 'Will come Thursday') id`);
check('the desk logs a call, with a note', r.err === null && !!r.row?.id, r.err ?? '');
await owner();
const row = await one(`select rule_key, kind, note, sent_by from winback_sends where member_id = '${M}' order by sent_at desc limit 1`);
check('…recorded as a call, by whom, with the note', row?.rule_key === 'manual' && row?.kind === 'call' && row?.note === 'Will come Thursday' && row?.sent_by === ST, JSON.stringify(row));

await as(AD);
r = await tryOne(`select log_retention_call('${M}', null) id`);
check('a second call the same month is still logged (calls are never capped)', r.err === null && !!r.row?.id, r.err ?? '');
await owner();
check('…two calls on record', (await one(`select count(*)::int n from winback_sends where member_id = '${M}' and kind = 'call'`)).n === 2);

// An automatic win-back the same month: held back, because a person just called.
await owner();
await db.exec(`insert into winback_sends (gym_id, member_id, rule_key, month) values ('${GYM}', '${M}', 'no_visit_14', to_char(now() at time zone 'Asia/Manila', 'YYYY-MM'))`);
check('a call holds back this month\'s automatic win-back', (await one(`select count(*)::int n from winback_sends where member_id = '${M}' and rule_key = 'no_visit_14'`)).n === 0);

// The other way round: an automatic message first, then a call — the call must not vanish.
await db.exec(`insert into winback_sends (gym_id, member_id, rule_key, month) values ('${GYM}', '${M2}', 'no_visit_14', to_char(now() at time zone 'Asia/Manila', 'YYYY-MM'))`);
await as(ST);
await db.exec(`select log_retention_call('${M2}', null)`);
await owner();
check('an automatic message never swallows a later call', (await one(`select count(*)::int n from winback_sends where member_id = '${M2}' and kind = 'call'`)).n === 1);

await as(ST);
check('the desk reads the contact log', (await one(`select count(*)::int n from winback_sends where member_id in ('${M}', '${M2}')`)).n === 4);
check('win-back results count messages, never calls', !(await db.query(`select * from winback_results()`)).rows.some((x) => x.rule_key === 'manual'));
await as(M);
check('a member cannot log a call', /owner and the desk/.test((await tryOne(`select log_retention_call('${M2}', null)`)).err ?? ''));
await as(T);
check('nor can a coach', /owner and the desk/.test((await tryOne(`select log_retention_call('${M}', null)`)).err ?? ''));
await as(ST);
check('only about a member here', /not a member here/.test((await tryOne(`select log_retention_call('${T}', null)`)).err ?? ''));
check('a long note is refused', /200 characters/.test((await tryOne(`select log_retention_call('${M}', repeat('x', 201))`)).err ?? ''));

await owner();
check('closed to visitors', !(await one(`select has_function_privilege('anon', 'log_retention_call(uuid, text)', 'execute') x`)).x);
check('marker', (await one(`select migration_0205_applied() ok`)).ok === true);
console.log(failures ? `\n${failures} FAILED` : '\nall 0205 checks passed');
process.exit(failures ? 1 : 0);
