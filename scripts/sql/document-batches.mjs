/**
 * 0223: business documents in one batch. Attached files are drafts only the
 * applicant sees; Submit sends nothing until all six are attached, then all six
 * at once; the platform verifies or sends back — a verified one too — and only
 * the sent-back ones reopen, re-sent again as a batch; an unconfirmed email
 * cannot attach; approval waits for a requested one; one-at-a-time filing
 * refuses a pending application but still serves an approved gym's renewal;
 * 0223 can run twice.
 *
 *   node <repo>/scripts/sql/document-batches.mjs "<repo>"   (from a dir with pglite installed)
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { liveDb, applyMigrationsFrom, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO, { before: '0223' });
const id = (n) => `a2230000-0000-4000-8000-0000000000${n}`;
const PA = id('01'), ANA = id('02'), EVE = id('03');
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
const EXP = (k) => (['permit', 'barangay', 'owner_id'].includes(k) ? `${TODAY} + 200` : 'null');

await owner();
await db.exec(`
  insert into auth.users (id, email, raw_user_meta_data) values ('${PA}', 'pa@batch-test.com', '{}');
  insert into profiles (id, first_name, last_name, email, status, role) values ('${PA}', 'Pat', 'P', 'pa@batch-test.com', 'active', 'member') on conflict (id) do nothing;
  delete from gym_roles where user_id = '${PA}';
  insert into platform_admins (user_id) values ('${PA}') on conflict do nothing;`);
await anon();
const tok = (await one(`select submit_gym_application('Iron Den', 'Ana Cruz', 'ana@ironden.ph', '09171234567') t`)).t;
await owner();
await db.exec(`insert into auth.users (id, email, raw_user_meta_data) values
  ('${ANA}', 'ana@ironden.ph', '{"signup_source":"gym_applicant","application_token":"${tok}","first_name":"Ana","last_name":"Cruz"}'),
  ('${EVE}', 'eve@evil.ph', '{}');`);
const app = (await one(`select id from gym_applications where status_token = '${tok}'`)).id;
let err = null;
try { await applyMigrationsFrom(db, REPO, '0223'); } catch (e) { err = String(e); }
check('0223 applies', err === null, err);

await as(ANA);
check('an unconfirmed email cannot attach', /Confirm your email/.test(await tryExec(`select save_document_draft('${app}', 'dti_sec', '${app}/dti_sec-1.jpg', 'd.jpg')`) ?? ''));
await owner();
await db.exec(`update auth.users set email_confirmed_at = now() where id = '${ANA}'`);
await as(ANA);
check('the old one-at-a-time send refuses an application being decided',
  /sent together now/.test(await tryExec(`select add_application_document('${app}', 'dti_sec', '${app}/dti_sec-0.jpg', 'd.jpg')`) ?? ''));

const draft = async (k, n = 1) => (await one(`select save_document_draft('${app}', '${k}', '${app}/${k}-${n}.jpg', '${k}.jpg', ${EXP(k)}) id`)).id;
for (const k of KINDS.slice(0, 5)) await draft(k);
check('five attached: Submit sends nothing and names the missing one', /Still to attach: .*Barangay/.test(await tryExec(`select submit_documents('${app}')`) ?? ''));
await as(PA);
check('the platform does not see drafts', (await all(`select * from application_documents_of('${app}')`)).length === 0);
await as(ANA);
check('the applicant sees their drafts', (await all(`select * from application_documents_of('${app}') where status = 'draft'`)).length === 5);
await draft('dti_sec', 2);
check('attaching again replaces the draft of that kind', (await all(`select * from application_documents_of('${app}') where status = 'draft'`)).length === 5);
await draft('barangay');
const sent = (await one(`select submit_documents('${app}') n`)).n;
check('all six attached: Submit sends all six at once', sent === 6
  && (await all(`select * from application_documents_of('${app}') where status = 'pending'`)).length === 6, String(sent));
check('a sent document cannot be attached again unasked', /already sent/.test(await tryExec(`select save_document_draft('${app}', 'permit', '${app}/permit-9.jpg', 'p.jpg', ${TODAY} + 300)`) ?? ''));
check('nothing left to submit says so', /Nothing to send/.test(await tryExec(`select submit_documents('${app}')`) ?? ''));
await as(EVE);
check('somebody else cannot submit or attach', !!(await tryExec(`select submit_documents('${app}')`))
  && !!(await tryExec(`select save_document_draft('${app}', 'permit', '${app}/permit-x.jpg', 'p.jpg', ${TODAY} + 300)`)));

// The platform verifies five and sends one back; then asks again for a verified one.
await as(PA);
const docs = Object.fromEntries((await all(`select id, kind from application_documents_of('${app}') where status = 'pending'`)).map((r) => [r.kind, r.id]));
for (const k of KINDS) if (k !== 'owner_id') await db.exec(`select platform_review_document('${docs[k]}', true)`);
check('sending back needs a reason', !!(await tryExec(`select request_document_again('${docs.owner_id}', '')`)));
await db.exec(`select request_document_again('${docs.owner_id}', 'The photo is blurred.')`);
await db.exec(`select request_document_again('${docs.permit}', 'This permit is last year''s.')`);
const st = Object.fromEntries((await all(`select kind, status, reason from application_documents_of('${app}') where status <> 'replaced'`)).map((r) => [r.kind, r]));
check('a pending one sent back, and a verified one asked for again', st.owner_id.status === 'rejected' && st.permit.status === 'requested'
  && st.permit.reason === "This permit is last year's.", JSON.stringify(st));
check('approval waits for the requested one', /Verify every document/.test(await tryExec(`select create_gym('Iron Den', 'iron-den', '${app}')`) ?? ''));
check('a draft cannot be asked for again', !!(await tryExec(`select request_document_again('${PA}', 'x')`)));

await as(ANA);
check('only the sent-back ones reopen', /already sent/.test(await tryExec(`select save_document_draft('${app}', 'dti_sec', '${app}/dti_sec-9.jpg', 'd.jpg')`) ?? ''));
await draft('owner_id', 2);
check('one of two re-attached: Submit refuses and names the other', /Still to attach: .*permit/i.test(await tryExec(`select submit_documents('${app}')`) ?? ''));
await draft('permit', 2);
check('both re-attached: Submit sends just those two', (await one(`select submit_documents('${app}') n`)).n === 2);
const now = await all(`select kind, status from application_documents_of('${app}') where status <> 'replaced'`);
check('…the four others stay verified, the two are being checked', now.filter((r) => r.status === 'verified').length === 4
  && now.filter((r) => r.status === 'pending').length === 2, JSON.stringify(now));

await as(PA);
for (const r of await all(`select id from application_documents_of('${app}') where status = 'pending'`)) await db.exec(`select platform_review_document('${r.id}', true)`);
const gym = (await one(`select create_gym('Iron Den', 'iron-den', '${app}') id`)).id;
check('all six verified: the gym is let in', !!gym);
await as(ANA);
check('an approved gym\'s owner still files a renewal one at a time',
  !!(await one(`select add_application_document('${app}', 'permit', '${app}/permit-2027.jpg', 'p.jpg', ${TODAY} + 400) id`)).id);

await anon();
check('a visitor can do none of it', !!(await tryExec(`select submit_documents('${app}')`)) && !!(await tryExec(`select application_documents_to_send('${app}')`)));
check('the probe marker answers a visitor', (await one(`select migration_0223_applied() ok`)).ok === true);
await owner();
check('0223 can run twice', (await tryExec(readFileSync(join(REPO, 'supabase', 'migrations', '0223_document_batches.sql'), 'utf-8'))) === null);

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
