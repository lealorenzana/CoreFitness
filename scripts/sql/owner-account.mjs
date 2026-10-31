/**
 * 0222: the applicant's own account is the owner's login. Letting a gym in from
 * an application makes the application's account its owner (admin, active, the
 * gym its current one) — refused while that account's email is unconfirmed; an
 * application from before accounts finds the confirmed account with its address;
 * a gym made by hand gets no owner; the documents rule (0187) still comes first;
 * 0222 can run twice.
 *
 *   node <repo>/scripts/sql/owner-account.mjs "<repo>"   (from a dir with pglite installed)
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { liveDb, applyMigrationsFrom, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO, { before: '0222' });
const id = (n) => `a2220000-0000-4000-8000-0000000000${n}`;
const PA = id('01'), ANA = id('02'), BEN = id('03');
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
const NEEDS_EXPIRY = new Set(['permit', 'barangay', 'owner_id']);

await owner();
await db.exec(`
  insert into auth.users (id, email, raw_user_meta_data) values ('${PA}', 'pa@owner-test.com', '{}');
  insert into profiles (id, first_name, last_name, email, status, role) values ('${PA}', 'Pat', 'P', 'pa@owner-test.com', 'active', 'member') on conflict (id) do nothing;
  delete from gym_roles where user_id = '${PA}';
  insert into platform_admins (user_id) values ('${PA}') on conflict do nothing;`);
check('0222 applies', (await tryExec('select 1')) === null && !(await applyMigrationsFrom(db, REPO, '0222').catch((e) => e)));

// An application with its account (Ana, unconfirmed for now), and one from before accounts (Ben's address).
await anon();
const tok = (await one(`select submit_gym_application('Iron Den', 'Ana Cruz', 'ana@ironden.ph', '09171234567') t`)).t;
const tokBen = (await one(`select submit_gym_application('Ben Gym', 'Ben Old', 'ben@old.ph', '09170000000') t`)).t;
await owner();
await db.exec(`insert into auth.users (id, email, raw_user_meta_data) values
  ('${ANA}', 'ana@ironden.ph', '{"signup_source":"gym_applicant","application_token":"${tok}","first_name":"Ana","last_name":"Cruz"}'),
  ('${BEN}', 'ben@old.ph', '{}');
  insert into profiles (id, first_name, last_name, email, status, role) values ('${BEN}', 'Ben', 'Old', 'ben@old.ph', 'active', 'member') on conflict (id) do nothing;
  delete from gym_roles where user_id = '${BEN}';`);
const app = await one(`select id from gym_applications where status_token = '${tok}'`);
const appBen = await one(`select id from gym_applications where status_token = '${tokBen}'`);

// All six documents, verified, for both.
const fileAll = async (uid, appId) => {
  await as(uid);
  const ids = [];
  // Since 0223 a document is attached as a draft and the six are submitted together.
  for (const k of KINDS) ids.push((await one(`select save_document_draft('${appId}', '${k}', '${appId}/${k}-1.jpg', '${k}.jpg', ${NEEDS_EXPIRY.has(k) ? `${TODAY} + 200` : 'null'}) id`)).id);
  await db.exec(`select submit_documents('${appId}')`);
  await as(PA);
  for (const d of ids) await db.exec(`select platform_review_document('${d}', true)`);
};
await owner();
await db.exec(`update auth.users set email_confirmed_at = now() where id = '${BEN}'`);
await fileAll(BEN, appBen.id);

// Since 0223 attaching needs a confirmed email, so Ana confirms, files, and is "unconfirmed" again for the approval test.
await owner();
await db.exec(`update auth.users set email_confirmed_at = now() where id = '${ANA}'`);
await fileAll(ANA, app.id);
await owner();
await db.exec(`update auth.users set email_confirmed_at = null where id = '${ANA}'`);

await as(PA);
const unconfirmed = await tryExec(`select create_gym('Iron Den', 'iron-den', '${app.id}')`);
check('an unconfirmed applicant is not let in, and the platform is told why', /email is not confirmed/.test(unconfirmed ?? ''), unconfirmed);
check('…no gym was made', Number((await one(`select count(*)::int n from gyms where slug = 'iron-den'`)).n) === 0);

await owner();
await db.exec(`update auth.users set email_confirmed_at = now() where id = '${ANA}'`);
await as(PA);
const gym = (await one(`select create_gym('Iron Den', 'iron-den', '${app.id}') id`)).id;
await owner();
const role = await one(`select role::text, status::text from gym_roles where gym_id = '${gym}' and user_id = '${ANA}'`);
check('confirmed: her own account is the owner, active', role?.role === 'admin' && role?.status === 'active', JSON.stringify(role));
check('…and the new gym is her current one', (await one(`select active_gym_id from profiles where id = '${ANA}'`)).active_gym_id === gym);
check('…one account: nobody else was made owner', Number((await one(`select count(*)::int n from gym_roles where gym_id = '${gym}' and role = 'admin'`)).n) === 1);
check('…and the application is approved', (await one(`select status from gym_applications where id = '${app.id}'`)).status === 'approved');

await as(PA);
const gymBen = (await one(`select create_gym('Ben Gym', 'ben-gym', '${appBen.id}') id`)).id;
await owner();
check('an application from before accounts: the confirmed account with its address is the owner',
  (await one(`select role::text from gym_roles where gym_id = '${gymBen}' and user_id = '${BEN}'`))?.role === 'admin'
  && (await one(`select applicant_id from gym_applications where id = '${appBen.id}'`)).applicant_id === BEN);

await as(PA);
const handMade = (await one(`select create_gym('Hand Made', 'hand-made') id`)).id;
await owner();
check('a gym made by hand gets no owner (still invited)', Number((await one(`select count(*)::int n from gym_roles where gym_id = '${handMade}'`)).n) === 0);

await as(ANA);
check('an applicant cannot let a gym in', /Only the platform/.test(await tryExec(`select create_gym('Mine', 'mine-gym')`) ?? ''));
await anon();
check('a visitor cannot either', (await tryExec(`select create_gym('Mine', 'mine-gym')`)) !== null);
check('the probe marker answers a visitor', (await one(`select migration_0222_applied() ok`)).ok === true);

await owner();
check('0222 can run twice', (await tryExec(readFileSync(join(REPO, 'supabase', 'migrations', '0222_owner_account.sql'), 'utf-8'))) === null);

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
