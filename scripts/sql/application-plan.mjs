/**
 * 0228: an applicant changes their plan. Only the applicant, only while the
 * application waits, only a plan on offer; the change is said in the
 * conversation; Pay for your plan follows the new price; once a payment is
 * sent the plan is locked; 0228 runs twice.
 *
 *   node <repo>/scripts/sql/application-plan.mjs "<repo>"   (from a dir with pglite installed)
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { liveDb, applyMigrationsFrom, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO, { before: '0228' });
const id = (n) => `a2280000-0000-4000-8000-0000000000${n}`;
const ANA = id('01'), EVE = id('02');
let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const one = async (sql) => (await db.query(sql)).rows[0];
const tryExec = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return describe(e); } };
const as = (uid) => db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
const anon = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false); set role anon;`);
const owner = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);

await owner();
await db.exec(`update platform_plans set price_monthly = 1499, price_yearly = 14990, is_active = true, is_public = true where key = 'starter';
  update platform_plans set is_public = false where key = 'premium';`);
await anon();
const tok = (await one(`select submit_gym_application('Iron Den', 'Ana Cruz', 'ana@ironden.ph', '09171234567', null, null, null, 'trial', 'monthly') t`)).t;
await owner();
await db.exec(`insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('${ANA}', 'ana@ironden.ph', now(), '{"signup_source":"gym_applicant","application_token":"${tok}","first_name":"Ana","last_name":"Cruz"}'),
  ('${EVE}', 'eve@evil.ph', now(), '{}');`);
const app = (await one(`select id from gym_applications where status_token = '${tok}'`)).id;

let err = null;
try { await applyMigrationsFrom(db, REPO, '0228'); } catch (e) { err = String(e); }
check('0228 applies', err === null, err);

await as(EVE);
check('somebody else cannot change it', !!(await tryExec(`select change_application_plan('${app}', 'starter', 'monthly')`)));
await as(ANA);
check('a plan not on offer is refused', /not on offer/.test(await tryExec(`select change_application_plan('${app}', 'premium', 'monthly')`) ?? ''));
await db.exec(`select change_application_plan('${app}', 'starter', 'yearly')`);
await owner();
const a = await one(`select plan_key, billing from gym_applications where id = '${app}'`);
check('the applicant changes their plan and billing', a.plan_key === 'starter' && a.billing === 'yearly', JSON.stringify(a));
check('…and it is said in the conversation', (await one(`select count(*)::int n from application_messages where application_id = '${app}' and body like 'I changed my plan to Starter, billed yearly.'`)).n === 1);
await as(ANA);
check('Pay for your plan follows the new price', Number((await one(`select application_payment_state('${app}') s`)).s.amount) === 14990);
await owner();
await db.exec(`insert into application_payments (application_id, plan_key, months, amount, method, method_label, reference, status)
  values ('${app}', 'starter', 12, 14990, 'gcash', 'GCash', 'REF-PLAN-1', 'pending')`);
await as(ANA);
check('once a payment is sent, the plan is locked', /plan is fixed now/.test(await tryExec(`select change_application_plan('${app}', 'trial', 'monthly')`) ?? ''));

await anon();
check('a visitor cannot', !!(await tryExec(`select change_application_plan('${app}', 'starter', 'monthly')`)));
check('the probe marker answers a visitor', (await one(`select migration_0228_applied() ok`)).ok === true);
await owner();
check('0228 can run twice', (await tryExec(readFileSync(join(REPO, 'supabase', 'migrations', '0228_change_application_plan.sql'), 'utf-8'))) === null);

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
