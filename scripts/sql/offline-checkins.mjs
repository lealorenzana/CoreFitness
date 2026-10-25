/**
 * 0211: a scan saved while the gym was offline is recorded later, at the time
 * it was scanned, after the rules are checked for that day — front desk only.
 *
 *   node <repo>/scripts/sql/offline-checkins.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);
const GYM = 'c0f1e55e-0000-4000-8000-000000000001';
const id = (n) => `a2110000-0000-4000-8000-0000000000${n}`;
const MA = id('0a'), MX = id('0b'), MZ = id('0c'), ST = id('0e'), CO = id('0f');
let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const one = async (sql) => (await db.query(sql)).rows[0];
const tryOne = async (sql) => { try { return { row: (await db.query(sql)).rows[0], err: null }; } catch (e) { return { row: null, err: describe(e) }; } };
const as = (uid) => db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
const owner = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
const rec = async (m, at, src = 'kiosk') => (await tryOne(`select record_offline_checkin('${m}', ${at}, 'qr', '${src}', null) r`));

await owner();
await db.exec(`
  ${[['ma', MA, 'member'], ['mx', MX, 'member'], ['mz', MZ, 'member'], ['desk', ST, 'staff'], ['coach', CO, 'trainer']].map(([k, u, role]) => `
    insert into auth.users (id, email, raw_user_meta_data) values ('${u}', '${k}@off-test.com', '{}');
    insert into profiles (id, first_name, last_name, email, status, role, active_gym_id)
      values ('${u}', '${k}', 'T', '${k}@off-test.com', 'active', '${role}', '${GYM}') on conflict (id) do update set active_gym_id = excluded.active_gym_id;
    delete from gym_roles where user_id = '${u}';
    insert into gym_roles (gym_id, user_id, role, status) values ('${GYM}', '${u}', '${role}', 'active');`).join('\n')}
  insert into trainer_profiles (profile_id, gym_id, specialization) values ('${CO}', '${GYM}', 'Strength') on conflict do nothing;
  insert into member_profiles (profile_id, gym_id, qr_code) values ('${MA}', '${GYM}', 'QR-OF1'), ('${MX}', '${GYM}', 'QR-OF2'), ('${MZ}', '${GYM}', 'QR-OF3') on conflict do nothing;
  select act_as_gym('${GYM}');
  insert into membership_plans (id, gym_id, name, price, duration_days, tier, can_book_classes, can_book_pt, is_active)
    values ('${id('f1')}', '${GYM}', 'Off Monthly', 900, 30, 'premium', true, true, true);
  -- MA: active. MX: expired two days ago. MZ: frozen.
  insert into memberships (member_id, gym_id, plan_id, status, start_date, expiry_date, never_expires) values
    ('${MA}', '${GYM}', '${id('f1')}', 'active', manila_today() - 10, manila_today() + 20, false),
    ('${MX}', '${GYM}', '${id('f1')}', 'active', manila_today() - 40, manila_today() - 2, false),
    ('${MZ}', '${GYM}', '${id('f1')}', 'frozen', manila_today() - 10, manila_today() + 20, false);
  select act_as_gym(null);`);

// The outage: scans saved on the kiosk an hour ago, sent now.
await as(ST);
let r = await rec(MA, `now() - interval '1 hour'`);
check('a saved scan of an active member is recorded', r.row?.r === 'recorded', r.err ?? r.row?.r);
await owner();
const row = await one(`select check_in_time, source, method, recorded_by from attendance where member_id = '${MA}'`);
check('…at the time it was scanned, not when it was sent', row && Math.abs(new Date(row.check_in_time).getTime() - (Date.now() - 3600_000)) < 120_000, JSON.stringify(row));
check('…from the kiosk, by the desk account that sent it', row?.source === 'kiosk' && row?.method === 'qr' && row?.recorded_by === ST);
check('…and the visit earns its points like any check-in', !!(await one(`select 1 x from point_ledger where member_id = '${MA}' and rule_key = 'checkin'`))
  || !(await one(`select 1 x from point_rules where gym_id = '${GYM}' and key = 'checkin' and is_active`)));

await as(ST);
r = await rec(MA, `now() - interval '30 minutes'`);
check('the same member twice that day is a duplicate, not a second visit', r.row?.r === 'duplicate', r.err ?? r.row?.r);
// MX's membership ran out two days ago: a scan from three days ago is fine, today's is not.
r = await rec(MX, `now() - interval '70 hours'`);
check('a scan from a day the membership still covered is recorded', r.row?.r === 'recorded', r.err ?? r.row?.r);
r = await rec(MX, `now() - interval '5 minutes'`);
check('a scan after it lapsed is refused: no membership', r.row?.r === 'no_membership', r.err ?? r.row?.r);
r = await rec(MZ, `now() - interval '5 minutes'`);
check('a frozen membership is refused, and says frozen', r.row?.r === 'frozen', r.err ?? r.row?.r);
r = await rec(MA, `now() - interval '80 hours'`);
check('older than 72 hours is refused', r.row?.r === 'too_old', r.err ?? r.row?.r);
r = await rec(MA, `now() + interval '1 hour'`);
check('a scan stamped in the future is refused', r.row?.r === 'future', r.err ?? r.row?.r);
r = await rec(CO, `now() - interval '5 minutes'`);
check('a coach is never recorded as a member visit', r.row?.r === 'not_member', r.err ?? r.row?.r);

await as(MA);
check('a member cannot record a check-in', /front desk/.test((await rec(MA, `now() - interval '10 minutes'`)).err ?? ''));
await as(CO);
check('a coach cannot either', /front desk/.test((await rec(MA, `now() - interval '10 minutes'`)).err ?? ''));

await owner();
check('closed to visitors', !(await one(`select has_function_privilege('anon', 'record_offline_checkin(uuid, timestamptz, text, text, text)', 'execute') x`)).x);
check('marker', (await one(`select migration_0211_applied() ok`)).ok === true);
console.log(failures ? `\n${failures} FAILED` : '\nall 0211 checks passed');
process.exit(failures ? 1 : 0);
