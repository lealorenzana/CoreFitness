/**
 * 0171: dates the database refuses (the evaluator's 2002), and one win-back a
 * month. Runs as a real `authenticated` user — the triggers fire for a user's
 * own request and stand aside for definer functions, seeds and sweeps.
 *
 * A BEFORE trigger runs before NOT NULL, RLS and foreign-key checks, so a bad
 * date is refused with 22008 even on a bare row; a good date on the same bare
 * row fails later with some OTHER error (or succeeds) — never 22008.
 *
 *   node <repo>/scripts/sql/date-windows.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);
const GYM = 'c0f1e55e-0000-4000-8000-000000000001';
const id = (n) => `a1710000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
const ADMIN = id(1), MEMBER = id(2), RECENT = id(3), AWAY = id(4);

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + (detail || lastCode)}`);
  if (!ok) failures++;
};
const one = async (sql) => (await db.query(sql)).rows[0];
const asOwner = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
async function as(uid) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
  if ((await one('select current_user as u')).u !== 'authenticated') throw new Error('not running as authenticated');
}
/** The SQLSTATE a statement fails with, or 'ok'. */
const code = async (sql) => {
  try { await db.exec(sql); return 'ok'; } catch (e) { return e.code === '22008' ? e.code : `${e.code}: ${String(e.message).slice(0, 90)}`; }
};
let lastCode = '';
const refused = (c) => { lastCode = c; return c === '22008'; };

await asOwner();
const person = (pid, name) => `insert into auth.users (id, email, raw_user_meta_data) values ('${pid}', '${name}@dates-test.com', '{}');
  insert into profiles (id, first_name, last_name, email, status, role, active_gym_id) values ('${pid}', '${name}', 'Tester', '${name}@dates-test.com', 'active', 'member', '${GYM}')
    on conflict (id) do update set active_gym_id = excluded.active_gym_id;`;
await db.exec(`
  ${person(ADMIN, 'admin')} ${person(MEMBER, 'member')} ${person(RECENT, 'recent')} ${person(AWAY, 'away')}
  insert into gym_roles (gym_id, user_id, role, status) values
    ('${GYM}', '${ADMIN}', 'admin', 'active'), ('${GYM}', '${MEMBER}', 'member', 'active'),
    ('${GYM}', '${RECENT}', 'member', 'active'), ('${GYM}', '${AWAY}', 'member', 'active')
  on conflict (gym_id, user_id) do update set role = excluded.role, status = excluded.status;
  insert into member_profiles (profile_id, gym_id, qr_code) values
    ('${MEMBER}', '${GYM}', 'QR-D1'), ('${RECENT}', '${GYM}', 'QR-D2'), ('${AWAY}', '${GYM}', 'QR-D3') on conflict do nothing;
`);

const d = (n) => `(manila_today() + ${n})`;

// ---- future dates: the owner's goal and challenge (the evaluator's 2002) ----
await as(ADMIN);
check('a gym goal starting in 2002 is refused',
  refused(await code(`insert into gym_goals (gym_id, title, metric, target, starts_on, ends_on) values ('${GYM}', 'Old', 'visits', 10, '2002-01-01', ${d(10)})`)));
check('a challenge starting yesterday is refused',
  refused(await code(`insert into challenges (gym_id, title, metric_key, target, starts_on, ends_on) values ('${GYM}', 'Late', (select key from achievement_metrics limit 1), 5, ${d(-1)}, ${d(10)})`)));
check('a challenge ending before it starts is refused',
  refused(await code(`insert into challenges (gym_id, title, metric_key, target, starts_on, ends_on) values ('${GYM}', 'Back', (select key from achievement_metrics limit 1), 5, ${d(5)}, ${d(2)})`)));
check('a challenge three years out is refused',
  refused(await code(`insert into challenges (gym_id, title, metric_key, target, starts_on, ends_on) values ('${GYM}', 'Far', (select key from achievement_metrics limit 1), 5, ${d(1100)}, ${d(1110)})`)));
check('a challenge from today is not refused for its dates',
  !refused(await code(`insert into challenges (gym_id, title, metric_key, target, starts_on, ends_on) values ('${GYM}', 'Now', (select key from achievement_metrics limit 1), 5, ${d(0)}, ${d(14)})`)));
check('an event in the past is refused',
  refused(await code(`insert into events (gym_id, title, starts_at) values ('${GYM}', 'Gone', now() - interval '3 days')`)));
check('an event next week is not refused for its date',
  !refused(await code(`insert into events (gym_id, title, starts_at) values ('${GYM}', 'Soon', now() + interval '7 days')`)));

// ---- record dates: what already happened ----
check('a payment dated tomorrow is refused',
  refused(await code(`insert into payments (gym_id, member_id, amount, method, invoice_number, paid_on) values ('${GYM}', '${MEMBER}', 500, 'cash', 'T-1', ${d(1)})`)));
check('a payment dated before this month is refused',
  refused(await code(`insert into payments (gym_id, member_id, amount, method, invoice_number, paid_on) values ('${GYM}', '${MEMBER}', 500, 'cash', 'T-2', date_trunc('month', manila_today())::date - 1)`)));
await as(MEMBER);
check('a workout 31 days back is refused',
  refused(await code(`insert into workout_logs (gym_id, member_id, performed_on) values ('${GYM}', '${MEMBER}', ${d(-31)})`)));
check('a workout 30 days back is not refused for its date',
  !refused(await code(`insert into workout_logs (gym_id, member_id, performed_on) values ('${GYM}', '${MEMBER}', ${d(-30)})`)));
check('a workout tomorrow is refused',
  refused(await code(`insert into workout_logs (gym_id, member_id, performed_on) values ('${GYM}', '${MEMBER}', ${d(1)})`)));
check('a reading dated next week is refused',
  refused(await code(`insert into body_measurements (gym_id, member_id, measured_on) values ('${GYM}', '${MEMBER}', ${d(7)})`)));
check('a progress photo taken tomorrow is refused',
  refused(await code(`insert into progress_photos (gym_id, member_id, path, taken_on) values ('${GYM}', '${MEMBER}', 'x', ${d(1)})`)));
check('a target date in the past is refused',
  refused(await code(`insert into fitness_goals (gym_id, member_id, title, target_date) values ('${GYM}', '${MEMBER}', 'Run', ${d(-2)})`)));

// ---- birth dates, for everyone ----
check('a member born tomorrow is refused',
  refused(await code(`update member_profiles set date_of_birth = ${d(1)} where profile_id = '${MEMBER}'`)));
check('a member born 121 years ago is refused',
  refused(await code(`update member_profiles set date_of_birth = (manila_today() - interval '121 years')::date where profile_id = '${MEMBER}'`)));
await asOwner();
check('…even when nobody is signed in',
  refused(await code(`update member_profiles set date_of_birth = ${d(1)} where profile_id = '${MEMBER}'`)));

// ---- old rows never block an unrelated edit; definer functions stand aside ----
await db.exec(`insert into workout_logs (id, gym_id, member_id, performed_on) values ('d1710000-0000-4000-8000-000000000001', '${GYM}', '${MEMBER}', ${d(-90)})`);
check('an owner/seed write of an old date stands (not a user request)', true);
await as(MEMBER);
const edit = await code(`update workout_logs set activity = 'Legs' where id = 'd1710000-0000-4000-8000-000000000001'`);
check('editing an old workout without touching its date is not refused', !refused(edit), edit);
check('…but moving it to another old date is',
  refused(await code(`update workout_logs set performed_on = ${d(-80)} where id = 'd1710000-0000-4000-8000-000000000001'`)));
await asOwner();
const quest = await code(`select set_config('request.jwt.claim.sub', '${ADMIN}', false);
  do $$ begin perform 1; end $$;
  insert into challenges (gym_id, title, metric_key, target, starts_on, ends_on)
    select '${GYM}', 'This week', key, 3, ${d(-3)}, ${d(3)} from achievement_metrics limit 1`);
check('a backdated challenge written by the database itself (owner, a signed-in sub) stands', quest === 'ok', quest);

// ---- one win-back a month ----
await db.exec(`select set_config('request.jwt.claim.sub', '', false);
  insert into attendance (member_id, gym_id, check_in_time) values ('${RECENT}', '${GYM}', now() - interval '2 days');`);
const month = (await one(`select to_char(now() at time zone 'Asia/Manila', 'YYYY-MM') m`)).m;
await db.exec(`insert into winback_sends (gym_id, member_id, rule_key, month) values ('${GYM}', '${AWAY}', 'no_visit_14', '${month}')`);
await db.exec(`insert into winback_sends (gym_id, member_id, rule_key, month) values ('${GYM}', '${AWAY}', 'no_visit_30', '${month}')`);
check('a second automatic win-back in the same month is skipped',
  Number((await one(`select count(*) n from winback_sends where member_id = '${AWAY}'`)).n) === 1);
await db.exec(`insert into winback_sends (gym_id, member_id, rule_key, month) values ('${GYM}', '${RECENT}', 'no_visit_14', '${month}')`);
check('nobody who visited this week is told "we miss you"',
  Number((await one(`select count(*) n from winback_sends where member_id = '${RECENT}'`)).n) === 0);
await db.exec(`insert into winback_sends (gym_id, member_id, rule_key, month) values ('${GYM}', '${RECENT}', 'lapsed', '${month}')`);
check('…but a lapsed plan is still worth a word about renewing',
  Number((await one(`select count(*) n from winback_sends where member_id = '${RECENT}' and rule_key = 'lapsed'`)).n) === 1);
await db.exec(`insert into winback_sends (gym_id, member_id, rule_key, month, sent_by) values ('${GYM}', '${AWAY}', 'manual', '${month}', '${ADMIN}')`);
check('the desk\'s own message always goes',
  Number((await one(`select count(*) n from winback_sends where member_id = '${AWAY}' and rule_key = 'manual'`)).n) === 1);
await db.exec(`insert into winback_sends (gym_id, member_id, rule_key, month) values ('${GYM}', '${AWAY}', 'no_visit_30', '2020-01')`);
check('a new month may send again',
  Number((await one(`select count(*) n from winback_sends where member_id = '${AWAY}' and month = '2020-01'`)).n) === 1);

check('marker', (await one(`select migration_0171_applied() ok`)).ok === true);
console.log(failures ? `\n${failures} FAILED` : '\nall 0171 checks passed');
process.exit(failures ? 1 : 0);
