/**
 * 0224: paying before approval. A paid plan is paid once all six documents are
 * verified — by a reference the platform confirms or refuses, or through
 * PayMongo (prepare + settle) — at the plan's own price, never the page's;
 * approval waits for it, and the payment becomes the gym's first, starting the
 * plan; the free trial pays nothing; one payment at a time, one reference once;
 * a second online payment is recorded as a duplicate; 0224 can run twice.
 *
 *   node <repo>/scripts/sql/application-payment.mjs "<repo>"   (from a dir with pglite installed)
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { liveDb, applyMigrationsFrom, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO, { before: '0224' });
const id = (n) => `a2240000-0000-4000-8000-0000000000${n}`;
const PA = id('01'), ANA = id('02'), TIM = id('03'), EVE = id('04'), CARL = id('05');
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
const TODAY = `(now() at time zone 'Asia/Manila')::date`;
const KINDS = ['permit', 'dti_sec', 'bir_2303', 'owner_id', 'front_photo', 'barangay'];
const EXP = (k) => (['permit', 'barangay', 'owner_id'].includes(k) ? `${TODAY} + 200` : 'null');

await owner();
await db.exec(`
  insert into auth.users (id, email, raw_user_meta_data) values ('${PA}', 'pa@pay-test.com', '{}');
  insert into profiles (id, first_name, last_name, email, status, role) values ('${PA}', 'Pat', 'P', 'pa@pay-test.com', 'active', 'member') on conflict (id) do nothing;
  delete from gym_roles where user_id = '${PA}';
  insert into platform_admins (user_id) values ('${PA}') on conflict do nothing;
  update platform_plans set price_monthly = 1499, price_yearly = 14990, is_active = true, is_public = true where key = 'starter';
  insert into platform_payment_methods (id, kind, label, account_number) values ('${id('90')}', 'gcash', 'GCash · Core Fitness', '09170000000');`);

const apply = async (name, email, plan, billing) => {
  await anon();
  const t = (await one(`select submit_gym_application('${name}', 'Owner', '${email}', '09171234567', null, null, null, ${plan ? `'${plan}'` : 'null'}, ${billing ? `'${billing}'` : 'null'}) t`)).t;
  await owner();
  return { tok: t, app: (await one(`select id from gym_applications where status_token = '${t}'`)).id };
};
const A = await apply('Iron Den', 'ana@ironden.ph', 'starter', 'monthly');
const T = await apply('Trial Gym', 'tim@trial.ph', 'trial', null);
const C = await apply('Carl Gym', 'carl@carl.ph', 'starter', 'yearly');
await db.exec(`insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('${ANA}', 'ana@ironden.ph', now(), '{"signup_source":"gym_applicant","application_token":"${A.tok}","first_name":"Ana","last_name":"Cruz"}'),
  ('${TIM}', 'tim@trial.ph', now(), '{"signup_source":"gym_applicant","application_token":"${T.tok}","first_name":"Tim","last_name":"T"}'),
  ('${CARL}', 'carl@carl.ph', now(), '{"signup_source":"gym_applicant","application_token":"${C.tok}","first_name":"Carl","last_name":"C"}'),
  ('${EVE}', 'eve@evil.ph', now(), '{}');`);

let err = null;
try { await applyMigrationsFrom(db, REPO, '0224'); } catch (e) { err = String(e); }
check('0224 applies', err === null, err);

const fileAll = async (uid, appId, verify = true) => {
  await as(uid);
  for (const k of KINDS) await db.exec(`select save_document_draft('${appId}', '${k}', '${appId}/${k}-1.jpg', '${k}.jpg', ${EXP(k)})`);
  await db.exec(`select submit_documents('${appId}')`);
  if (!verify) return;
  await as(PA);
  for (const r of (await db.query(`select id from application_documents_of('${appId}') where status = 'pending'`)).rows) await db.exec(`select platform_review_document('${r.id}', true)`);
};

await fileAll(ANA, A.app, false);
await as(ANA);
let st = (await one(`select application_payment_state('${A.app}') s`)).s;
check('a paid plan is due, and says its price', st.due === true && Number(st.amount) === 1499 && st.months === 1 && st.ready === false, JSON.stringify(st));
check('paying waits for the six documents', /once all six documents are verified/.test(await tryExec(`select claim_application_payment('${A.app}', '${id('90')}', 'REF-1001')`) ?? ''));
await as(PA);
check('approval waits too (documents first)', /Verify every document|documents/i.test(await tryExec(`select create_gym('Iron Den', 'iron-den', '${A.app}')`) ?? ''));
for (const r of (await db.query(`select id from application_documents_of('${A.app}') where status = 'pending'`)).rows) await db.exec(`select platform_review_document('${r.id}', true)`);
check('all six verified but unpaid: approval waits for the payment', /not paid for Starter yet/.test(await tryExec(`select create_gym('Iron Den', 'iron-den', '${A.app}')`) ?? ''));

await as(EVE);
check('somebody else cannot pay for it', !!(await tryExec(`select claim_application_payment('${A.app}', '${id('90')}', 'REF-1001')`)));
await as(ANA);
check('a reference needs a real number', /reference number/.test(await tryExec(`select claim_application_payment('${A.app}', '${id('90')}', 'x')`) ?? ''));
const p1 = (await one(`select claim_application_payment('${A.app}', '${id('90')}', 'REF-1001') id`)).id;
await owner();
const row = await one(`select amount, months, plan_key, status from application_payments where id = '${p1}'`);
await as(ANA);
check('a GCash reference is recorded at the plan\'s price', Number(row.amount) === 1499 && row.status === 'pending' && row.plan_key === 'starter', JSON.stringify(row));
check('one payment at a time', /checking the payment/.test(await tryExec(`select claim_application_payment('${A.app}', '${id('90')}', 'REF-1002')`) ?? ''));
check('…and PayMongo cannot open over it', /checking the payment/.test(await tryExec(`select paymongo_prepare_platform('application', '{"application":"${A.app}"}')`) ?? ''));

await as(ANA);
check('only the platform confirms', !!(await tryExec(`select confirm_application_payment('${p1}', true)`)));
await as(PA);
check('refusing needs a reason', /Say why/.test(await tryExec(`select confirm_application_payment('${p1}', false, '')`) ?? ''));
await db.exec(`select confirm_application_payment('${p1}', false, 'No GCash payment with that reference.')`);
await as(ANA);
st = (await one(`select application_payment_state('${A.app}') s`)).s;
check('a refused one shows its reason, and frees the way to send again', st.last.status === 'refused' && /No GCash/.test(st.last.reason) && st.paid === false, JSON.stringify(st));
const p2 = (await one(`select claim_application_payment('${A.app}', '${id('90')}', 'REF-1001') id`)).id;
check('the same reference can be sent again after a refusal', !!p2);
await as(PA);
await db.exec(`select confirm_application_payment('${p2}', true)`);
await as(ANA);
check('paid: nothing more to pay', /already paid/.test(await tryExec(`select claim_application_payment('${A.app}', '${id('90')}', 'REF-2000')`) ?? ''));

await as(PA);
const gym = (await one(`select create_gym('Iron Den', 'iron-den', '${A.app}') id`)).id;
await owner();
const g = await one(`select plan, paid_until, paid_until = (${TODAY} + interval '1 month')::date - 1 as month from gyms where id = '${gym}'`);
const gp = await one(`select count(*)::int n, max(amount) a, max(reference) r from gym_payments where gym_id = '${gym}'`);
check('paid and verified: let in on the plan they paid for', g.plan === 'starter' && g.month === true, JSON.stringify(g));
check('…the payment is the gym\'s first, starting today', gp.n === 1 && Number(gp.a) === 1499 && gp.r === 'REF-1001', JSON.stringify(gp));
await owner();
check('…and the application payment points at it', !!(await one(`select gym_payment_id from application_payments where id = '${p2}'`)).gym_payment_id);

// The free trial: nothing to pay, let in as before.
await fileAll(TIM, T.app);
await as(TIM);
st = (await one(`select application_payment_state('${T.app}') s`)).s;
check('the free trial has nothing to pay', st.due === false, JSON.stringify(st));
check('…and cannot pay', /nothing to pay/.test(await tryExec(`select claim_application_payment('${T.app}', '${id('90')}', 'REF-3000')`) ?? ''));
await as(PA);
const tg = (await one(`select create_gym('Trial Gym', 'trial-gym', '${T.app}') id`)).id;
await owner();
check('…and is let in on the trial', (await one(`select plan from gyms where id = '${tg}'`)).plan === 'trial');

// PayMongo: yearly price from SQL; the webhook settles it; a second payment is a duplicate.
await fileAll(CARL, C.app);
await as(CARL);
const prep = (await one(`select paymongo_prepare_platform('application', '{"application":"${C.app}"}') p`)).p;
check('PayMongo asks the yearly price from the database', Number(prep.amount) === 14990 && /12 months/.test(prep.description), JSON.stringify(prep));
const prep2 = (await one(`select paymongo_prepare_platform('application', '{"application":"${C.app}"}') p`)).p;
await owner();
await db.exec(`update paymongo_checkouts set checkout_session_id = 'cs_1' where id = '${prep.id}';
               update paymongo_checkouts set checkout_session_id = 'cs_2' where id = '${prep2.id}';`);
check('a wrong amount is not accepted', (await one(`select paymongo_settle('cs_1', 'pay_x', 100, 'gcash') r`)).r === 'amount mismatch');
await db.exec(`update paymongo_checkouts set status = 'pending' where id = '${prep.id}'`);
const settled = (await one(`select paymongo_settle('cs_1', 'pay_1', 1499000, 'gcash') r`)).r;
const cp = await one(`select status, method, amount from application_payments where application_id = '${C.app}' and status = 'paid'`);
check('the webhook records it paid', settled === 'settled' && cp?.method === 'paymongo' && Number(cp.amount) === 14990, settled + ' ' + JSON.stringify(cp));
check('a second online payment is a duplicate, never applied twice', (await one(`select paymongo_settle('cs_2', 'pay_2', 1499000, 'gcash') r`)).r === 'settled'
  && (await one(`select count(*)::int n from application_payments where application_id = '${C.app}' and status = 'duplicate'`)).n === 1);
await as(PA);
const cg = (await one(`select create_gym('Carl Gym', 'carl-gym', '${C.app}') id`)).id;
await owner();
check('…let in covered for a year', (await one(`select paid_until = (${TODAY} + interval '12 months')::date - 1 as y from gyms where id = '${cg}'`)).y === true);
await as(PA);
const list = (await db.query(`select * from platform_application_payments()`)).rows;
check('the platform lists each application with something to pay, and its payment', list.length === 2
  && list.every((r) => r.status === 'paid') && !list.some((r) => r.application_id === T.app), JSON.stringify(list));
await as(ANA);
check('an applicant cannot read the platform list', (await db.query(`select * from platform_application_payments()`)).rows.length === 0);

await anon();
check('a visitor can do none of it', !!(await tryExec(`select application_payment_state('${A.app}')`)) && !!(await tryExec(`select claim_application_payment('${A.app}', '${id('90')}', 'REF-9')`)));
check('the probe marker answers a visitor', (await one(`select migration_0224_applied() ok`)).ok === true);
await owner();
check('0224 can run twice', (await tryExec(readFileSync(join(REPO, 'supabase', 'migrations', '0224_application_payment.sql'), 'utf-8'))) === null);

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
