/**
 * 0139: a free trial ends — new trial gyms get a date, old ones get notice,
 * paying gyms and G Fitness are never touched, and the reminders say "trial".
 *
 *   node <repo>/scripts/sql/trials-end.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);

const GYM_1 = 'c0f1e55e-0000-4000-8000-000000000001';
const PA = 'a1000000-0000-4000-8000-000000000009';
const OWNER = 'a1000000-0000-4000-8000-000000000001';
let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const one = async (sql) => (await db.query(sql)).rows[0];
async function as(uid) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
}
const TODAY = `(now() at time zone 'Asia/Manila')::date`;
const left = async (id) => { await db.exec('reset role'); return (await one(`select (paid_until - ${TODAY})::int as d from gyms where id = '${id}'`))?.d ?? null; };
const tryExec = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return describe(e); } };

await db.exec(`reset role;
  insert into auth.users (id, email, raw_user_meta_data) values ('${PA}', 'pa@trial-test.com', '{}'), ('${OWNER}', 'o@trial-test.com', '{}');
  insert into profiles (id, first_name, last_name, email, status, role) values
    ('${PA}', 'P', 'A', 'pa@trial-test.com', 'active', 'member'), ('${OWNER}', 'O', 'W', 'o@trial-test.com', 'active', 'member') on conflict do nothing;
  insert into platform_admins (user_id) values ('${PA}') on conflict do nothing;
  update profiles set active_gym_id = '${GYM_1}' where id = '${PA}';`);

// ---- 1. a new gym ---------------------------------------------------------------------------
await as(PA);
const fresh = (await one(`select create_gym('Iron Temple', 'iron-temple') as id`)).id;
check('a gym let in on the free trial ends in 30 days', (await left(fresh)) === 30, String(await left(fresh)));

// ---- 2. the migration's backfill, on rows it never saw ----------------------------------------
await db.exec(`reset role; set session_replication_role = replica;
  insert into gyms (id, slug, name, plan, created_at) values
    ('d0000000-0000-4000-8000-000000000001', 'young', 'Young trial', 'trial', now() - interval '10 days'),
    ('d0000000-0000-4000-8000-000000000002', 'stale', 'Stale trial', 'trial', now() - interval '200 days'),
    ('d0000000-0000-4000-8000-000000000003', 'paid', 'Paid once', 'trial', now() - interval '200 days'),
    ('d0000000-0000-4000-8000-000000000004', 'prem', 'Premium, no date', 'premium', now() - interval '200 days');
  insert into gym_payments (gym_id, amount, covers_until, receipt_no) values ('d0000000-0000-4000-8000-000000000003', 999, '2026-01-01', 'CF-TEST-1');
  update gyms set plan = 'trial', paid_until = null where id = '${GYM_1}';
  set session_replication_role = origin;
  select settle_trial_dates();`);
check('a 10-day-old trial keeps its 20 days', (await left('d0000000-0000-4000-8000-000000000001')) === 20);
check('a trial that ran out long ago gets 14 days of notice, not a lock', (await left('d0000000-0000-4000-8000-000000000002')) === 14);
check('a gym that ever paid is not touched', (await left('d0000000-0000-4000-8000-000000000003')) === null);
check('a plan with no trial is not touched', (await left('d0000000-0000-4000-8000-000000000004')) === null);
check('G Fitness is never touched, even on a trial plan', (await left(GYM_1)) === null);
await db.exec(`reset role; update gyms set plan = 'premium' where id = '${GYM_1}';`);

// ---- 3. moving onto a trial ------------------------------------------------------------------
await as(PA);
await db.exec(`select set_gym_plan('d0000000-0000-4000-8000-000000000004', 'trial')`);
check('moved onto the trial plan, never paid: the trial starts', (await left('d0000000-0000-4000-8000-000000000004')) === 30);
await db.exec(`select set_gym_plan('d0000000-0000-4000-8000-000000000003', 'premium'); select set_gym_plan('d0000000-0000-4000-8000-000000000003', 'trial')`);
check('a gym that paid before gets no free trial', (await left('d0000000-0000-4000-8000-000000000003')) === null);

// ---- 4. the words ----------------------------------------------------------------------------
await db.exec(`reset role;
  insert into gym_roles (gym_id, user_id, role, status) values ('${fresh}', '${OWNER}', 'admin', 'active') on conflict do nothing;
  update profiles set active_gym_id = '${fresh}' where id = '${OWNER}';
  update gyms set paid_until = ${TODAY} + 7, onboarded_at = now() where id = '${fresh}';`);
await as(OWNER);
check('the owner is swept a reminder', (await one(`select billing_reminders_sweep() as n`)).n === 1);
const sub = await one(`select * from my_gym_subscription()`);
check('their page knows it is a trial', sub.on_trial === true && sub.days_left === 7, JSON.stringify(sub));
check('gym_state says trial', (await one(`select gym_state() as s`)).s === 'trial');
await db.exec(`reset role`);
const n = await one(`select title from notifications where user_id = '${OWNER}' and (metadata ->> 'dedupe') like 'billing:%'`);
check('it says trial, not subscription', n?.title === 'Your free trial ends in 7 days', n?.title);
await as(PA);
await db.exec(`select record_gym_payment('${fresh}', 999, ${TODAY} + 40)`);
await as(OWNER);
check('after the first payment it is not a trial any more', (await one(`select on_trial from my_gym_subscription()`)).on_trial === false);
check('nobody calls the backfill from outside', !!(await tryExec(`select settle_trial_dates()`)));

console.log(failures ? `\n${failures} FAILED` : '\nall 0139 checks passed');
process.exit(failures ? 1 : 0);
