/**
 * 0187: an application comes with an account (tied by token AND email), the
 * applicant sees and answers it signed in, files the six documents, and the
 * platform verifies them — Approve (and create_gym) refuse until all six are
 * verified and in date. Turned down or called off, the account can be deleted.
 *
 *   node <repo>/scripts/sql/applicant-accounts.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);
const id = (n) => `a1870000-0000-4000-8000-0000000000${n}`;
const PA = id('01'), ANA = id('02'), EVE = id('03'), OLD = id('04'), BEN = id('05');
let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const one = async (sql) => (await db.query(sql)).rows[0];
const all = async (sql) => (await db.query(sql)).rows;
const tryExec = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return describe(e); } };
const as = (uid) => db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
const anon = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false); set role anon;`);
const owner = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
const TODAY = `(now() at time zone 'Asia/Manila')::date`;
const KINDS = ['permit', 'dti_sec', 'bir_2303', 'owner_id', 'front_photo', 'barangay'];
const NEEDS_EXPIRY = new Set(['permit', 'barangay', 'owner_id']);

await owner();
await db.exec(`
  insert into auth.users (id, email, raw_user_meta_data) values ('${PA}', 'pa@apply-test.com', '{}');
  insert into profiles (id, first_name, last_name, email, status, role) values ('${PA}', 'Pat', 'P', 'pa@apply-test.com', 'active', 'member') on conflict (id) do nothing;
  delete from gym_roles where user_id = '${PA}';
  insert into platform_admins (user_id) values ('${PA}') on conflict do nothing;`);

// ---- applying makes an account, tied by token and email -------------------------------------------
await anon();
const tok = (await one(`select submit_gym_application('Iron Den', 'Ana Cruz', 'ana@ironden.ph', '09171234567') t`)).t;
const tokEve = (await one(`select submit_gym_application('Fake Den', 'Eve X', 'victim@other.ph', '09171234567') t`)).t;
await owner();
await db.exec(`insert into auth.users (id, email, raw_user_meta_data) values
  ('${ANA}', 'Ana@IronDen.ph', '{"signup_source":"gym_applicant","application_token":"${tok}","first_name":"Ana","last_name":"Cruz"}'),
  ('${EVE}', 'eve@evil.ph', '{"signup_source":"gym_applicant","application_token":"${tokEve}","first_name":"Eve","last_name":"X"}')`);
const app = await one(`select id, applicant_id from gym_applications where status_token = '${tok}'`);
check('the sign-up ties the application to the new account', app.applicant_id === ANA, JSON.stringify(app));
check('…and gives the account a profile with no gym', (await one(`select active_gym_id is null and first_name = 'Ana' ok from profiles where id = '${ANA}'`))?.ok === true);
check('a token for somebody else\'s email ties nothing', (await one(`select applicant_id from gym_applications where status_token = '${tokEve}'`)).applicant_id === null);
check('…and the applicant is a member of no gym', (await one(`select count(*)::int n from gym_roles where user_id = '${ANA}'`)).n === 0);

await as(ANA);
let mine = (await one(`select my_applications() a`)).a;
check('signed in, they see their application with its six documents to send', mine.length === 1 && mine[0].gym_name === 'Iron Den'
  && mine[0].missing.length === 6, JSON.stringify(mine).slice(0, 300));
await db.exec(`select my_application_reply('${app.id}', 'Here is our permit soon.')`);
check('they can write to the platform', (await one(`select jsonb_array_length(my_applications() -> 0 -> 'messages') n`)).n === 1);
await as(EVE);
check('somebody else sees none of it', (await one(`select jsonb_array_length(my_applications()) n`)).n === 0);
check('…and cannot write on it', !!(await tryExec(`select my_application_reply('${app.id}', 'hi')`)));

// An application from before accounts, found by a CONFIRMED matching address.
await anon();
const tokOld = (await one(`select submit_gym_application('Old Gym', 'Ben Old', 'ben@old.ph', '09170000000') t`)).t;
await owner();
await db.exec(`insert into auth.users (id, email, raw_user_meta_data) values ('${OLD}', 'ben@old.ph', '{"signup_source":"gym_applicant"}')`);
await as(OLD);
check('an unconfirmed address finds nothing', (await one(`select jsonb_array_length(my_applications()) n`)).n === 0);
await owner();
await db.exec(`update auth.users set email_confirmed_at = now() where id = '${OLD}'`);
await as(OLD);
const foundOld = (await one(`select jsonb_array_length(my_applications()) n`)).n;
await owner();
check('a confirmed one finds the old application and keeps it', foundOld === 1
  && (await one(`select applicant_id from gym_applications where status_token = '${tokOld}'`)).applicant_id === OLD);

// ---- documents -----------------------------------------------------------------------------------
await as(ANA);
const file = (k) => `${app.id}/${k}-1.jpg`;
check('a file outside the application\'s folder is refused',
  !!(await tryExec(`select add_application_document('${app.id}', 'permit', 'elsewhere/permit.jpg', 'p.jpg', ${TODAY} + 100)`)));
check('a permit with no expiry date is refused', !!(await tryExec(`select add_application_document('${app.id}', 'permit', '${file('permit')}')`)));
check('an expired one is refused', !!(await tryExec(`select add_application_document('${app.id}', 'permit', '${file('permit')}', 'p.jpg', ${TODAY} - 1)`)));
const docs = {};
for (const k of KINDS) {
  docs[k] = (await one(`select add_application_document('${app.id}', '${k}', '${file(k)}', '${k}.jpg', ${NEEDS_EXPIRY.has(k) ? `${TODAY} + 200` : 'null'}) id`)).id;
}
check('the applicant files all six', (await one(`select count(*)::int n from application_documents_of('${app.id}')`)).n === 6);
check('the storage rule lets them upload into their folder only',
  (await one(`select may_file_for_application(application_of_path('${file('permit')}')) ok`)).ok === true);
await as(EVE);
check('nobody else may upload there', (await one(`select may_file_for_application('${app.id}') ok`)).ok === false);
check('…or read the list', (await one(`select count(*)::int n from application_documents_of('${app.id}')`)).n === 0);
check('…and the table itself is closed', (await all(`select * from application_documents`)).length === 0);

await as(ANA);
check('an applicant cannot verify their own', !!(await tryExec(`select platform_review_document('${docs.permit}', true)`)));
await as(PA);
check('approving now is refused: nothing verified', /Verify every document/.test(await tryExec(`select create_gym('Iron Den', 'iron-den', '${app.id}')`) ?? ''));
check('a rejection needs a reason', !!(await tryExec(`select platform_review_document('${docs.owner_id}', false, '')`)));
for (const k of KINDS) await db.exec(`select platform_review_document('${docs[k]}', ${k !== 'owner_id'}, ${k === 'owner_id' ? `'The photo is blurred.'` : 'null'})`);
const sum = await one(`select * from platform_application_documents_summary() where application_id = '${app.id}'`);
check('the platform sees five verified and the ID missing', sum.verified === 5 && sum.rejected === 1
  && sum.missing.length === 1 && /government ID/.test(sum.missing[0]), JSON.stringify(sum));
check('approve still refused while one is rejected', !!(await tryExec(`select create_gym('Iron Den', 'iron-den', '${app.id}')`)));
await as(ANA);
mine = (await one(`select my_applications() a`)).a;
check('the applicant sees why', mine[0].documents.some((d) => d.kind === 'owner_id' && d.status === 'rejected' && d.reason === 'The photo is blurred.'));
const id2 = (await one(`select add_application_document('${app.id}', 'owner_id', '${app.id}/owner_id-2.jpg', 'id.jpg', ${TODAY} + 900) id`)).id;
check('a new copy replaces the rejected one', (await one(`select status from application_documents_of('${app.id}') where id = '${docs.owner_id}'`)).status === 'replaced');
await as(PA);
await db.exec(`select platform_review_document('${id2}', true)`);
const gym = (await one(`select create_gym('Iron Den', 'iron-den', '${app.id}') id`)).id;
check('all six verified: the gym is created', !!gym && (await one(`select status from gym_applications where id = '${app.id}'`)).status === 'approved');
await db.exec(`select make_gym_owner('${gym}', (select platform_find_user('ana@ironden.ph')))`);
await owner();
check('the same account becomes the owner — no second login', (await one(`select role::text, status::text from gym_roles where user_id = '${ANA}' and gym_id = '${gym}'`))?.role === 'admin');

// ---- after approval ---------------------------------------------------------------------------------
await owner();
await db.exec(`update profiles set active_gym_id = '${gym}' where id = '${ANA}'`);
await as(ANA);
const ga = (await one(`select my_gym_application() a`)).a;
check('setup can fill itself from the application', ga && ga.gym_name === 'Iron Den' && ga.phone === '09171234567' && ga.documents.length === 6, JSON.stringify(ga).slice(0, 200));
check('the owner can file a renewal', !!(await one(`select add_application_document('${app.id}', 'permit', '${app.id}/permit-2027.jpg', 'p.jpg', ${TODAY} + 400) id`)).id);
await owner();
await db.exec(`update application_documents set expires_on = ${TODAY} + 10 where id = '${docs.barangay}'`);
await as(ANA);
check('a document running out soon reminds the owner', (await one(`select permit_renewal_sweep() n`)).n >= 1);
check('…once', (await one(`select permit_renewal_sweep() n`)).n === 0);

// ---- calling off and deleting the account ------------------------------------------------------------
await anon();
const tokBen = (await one(`select submit_gym_application('Ben Gym', 'Ben B', 'ben@bengym.ph', '09171112222') t`)).t;
await owner();
await db.exec(`insert into auth.users (id, email, raw_user_meta_data) values
  ('${BEN}', 'ben@bengym.ph', '{"signup_source":"gym_applicant","application_token":"${tokBen}"}')`);
const benApp = (await one(`select id from gym_applications where status_token = '${tokBen}'`)).id;
await as(PA);
check('an open application\'s account cannot be deleted', !!(await tryExec(`select platform_delete_applicant('${benApp}')`)));
check('an owner\'s account cannot be deleted either', !!(await tryExec(`select platform_delete_applicant('${app.id}')`)));
await as(BEN);
await db.exec(`select withdraw_my_application('${benApp}')`);
await owner();
check('the applicant can call it off', (await one(`select status from gym_applications where id = '${benApp}'`)).status === 'withdrawn');
await as(BEN);
check('…once', !!(await tryExec(`select withdraw_my_application('${benApp}')`)));
check('a gym owner cannot delete accounts', !!(await tryExec(`select platform_delete_applicant('${benApp}')`)));
await as(PA);
await db.exec(`select platform_delete_applicant('${benApp}')`);
await owner();
check('called off: the platform deletes the account, keeps the record', (await one(`select count(*)::int n from auth.users where id = '${BEN}'`)).n === 0
  && (await one(`select applicant_id is null and status = 'withdrawn' ok from gym_applications where id = '${benApp}'`)).ok === true);
await anon();
check('the old status link still works', (await one(`select application_status('${tok}') ->> 'status' s`)).s === 'approved');

await owner();
check('marker', (await one(`select migration_0187_applied() ok`)).ok === true);
console.log(failures ? `\n${failures} FAILED` : '\nall 0187 checks passed');
process.exit(failures ? 1 : 0);
