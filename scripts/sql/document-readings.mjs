/**
 * 0280: reading business documents. An applicant claims a reading only for a file in
 * their own application's folder; nobody but the service role saves one and nobody
 * but the platform reads one; the cap holds; a failed reading frees its slot; the
 * platform's warnings fire on what does not add up and stay quiet when it does;
 * readings go when the documents go (0225's erase); 0280 can run twice.
 *
 *   node <repo>/scripts/sql/document-readings.mjs "<repo>"   (from a dir with pglite installed)
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { liveDb, applyMigrationsFrom, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO, { before: '0280' });
const id = (n) => `a2800000-0000-4000-8000-0000000000${n}`;
const PA = id('01'), ANA = id('02'), EVE = id('04');
let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const one = async (sql) => (await db.query(sql)).rows[0];
const tryExec = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return describe(e); } };
const as = (uid) => db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
const service = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false); set role service_role;`);
const anon = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false); set role anon;`);
const owner = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
const TODAY = `(now() at time zone 'Asia/Manila')::date`;
const YEAR = new Date(Date.now() + 8 * 3600e3).getUTCFullYear();

await owner();
await db.exec(`
  insert into auth.users (id, email, raw_user_meta_data) values ('${PA}', 'pa@read-test.com', '{}');
  insert into profiles (id, first_name, last_name, email, status, role) values ('${PA}', 'Pat', 'P', 'pa@read-test.com', 'active', 'member') on conflict (id) do nothing;
  delete from gym_roles where user_id = '${PA}';
  insert into platform_admins (user_id) values ('${PA}') on conflict do nothing;`);
await anon();
const tok = (await one(`select submit_gym_application('Iron Den Fitness', 'Ana Cruz', 'ana@ironden.ph', '09171234567', null, null, null, 'trial', null) t`)).t;
await owner();
const APP = (await one(`select id from gym_applications where status_token = '${tok}'`)).id;
await db.exec(`insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('${ANA}', 'ana@ironden.ph', now(), '{"signup_source":"gym_applicant","application_token":"${tok}","first_name":"Ana","last_name":"Cruz"}'),
  ('${EVE}', 'eve@evil.ph', now(), '{}');`);

let err = null;
try { await applyMigrationsFrom(db, REPO, '0280'); } catch (e) { err = String(e); }
check('0280 applies', err === null, err);

const P = (k) => `${APP}/${k}-1.jpg`;
const claim = (k, path = P(k)) => `select claim_document_reading('${path}', '${k}') c`;

// Claiming
await as(ANA);
check('the applicant claims a reading of their own file', (await one(claim('permit'))).c.claimed === true);
check('asking again returns the stored answer, not a second reading', (await one(claim('permit'))).c.claimed === false);
check('the front photo is not read', /not one we read/.test(await tryExec(claim('front_photo')) ?? ''));
check('a path outside an application folder is refused', /not in an application/.test(await tryExec(claim('permit', 'x/permit.jpg')) ?? ''));
await as(EVE);
check('another person cannot claim on the application', /cannot add documents/.test(await tryExec(claim('dti_sec')) ?? ''));
await anon();
check('a visitor cannot claim', !!(await tryExec(claim('dti_sec'))));

// Nobody but the service role writes, nobody but the platform reads
await as(ANA);
check('the applicant cannot select readings', !!(await tryExec(`select * from document_readings`)));
check('the applicant cannot save a reading', !!(await tryExec(`select save_document_reading('${P('permit')}', '{"readable":true}', 'x')`)));
check('the applicant cannot insert a reading', !!(await tryExec(`insert into document_readings (path, application_id, kind, result) values ('${APP}/fake.jpg', '${APP}', 'permit', '{}')`)));
check('the applicant cannot read the checks', (await db.query(`select * from application_document_checks('${APP}')`)).rows.length === 0);

const save = (k, result) => `select save_document_reading('${P(k)}', '${JSON.stringify(result).replace(/'/g, "''")}'::jsonb, 'claude-sonnet-5-5') s`;
await service();
check('the service role saves a reading', (await one(save('permit', { readable: true, looks_like: 'permit', business_name: 'IRON DEN FITNESS GYM', owner_name: 'ANA M. CRUZ', expires_on: `${YEAR}-12-31`, valid_for_year: String(YEAR - 1) }))).s === true);

// A failed reading frees its slot
await as(ANA);
await db.exec(claim('dti_sec'));
await service();
await db.exec(`select drop_document_reading('${P('dti_sec')}')`);
await as(ANA);
check('a failed reading frees the path to try again', (await one(claim('dti_sec'))).c.claimed === true);

// The rest, then send them
for (const k of ['bir_2303', 'barangay', 'owner_id']) await db.exec(claim(k));
await service();
await db.exec(save('dti_sec', { readable: true, looks_like: 'dti_sec', business_name: 'IRON DEN', owner_name: 'ANA CRUZ' }));
await db.exec(save('bir_2303', { readable: true, looks_like: 'barangay', business_name: 'IRON DEN', owner_name: null }));
await db.exec(save('barangay', { readable: false, looks_like: null }));
await db.exec(save('owner_id', { readable: true, looks_like: 'owner_id', owner_name: 'PEDRO REYES', expires_on: null }));
await as(ANA);
const EXP = (k) => (['permit', 'barangay', 'owner_id'].includes(k) ? `${TODAY} + 200` : 'null');
for (const k of ['permit', 'dti_sec', 'bir_2303', 'owner_id', 'front_photo', 'barangay']) {
  await db.exec(`select save_document_draft('${APP}', '${k}', '${P(k)}', '${k}.jpg', ${EXP(k)})`);
}
await db.exec(`select submit_documents('${APP}')`);

await as(PA);
const rows = (await db.query(`select d.kind, c.reading, c.warnings from application_document_checks('${APP}') c join application_documents_of('${APP}') d on d.id = c.document_id`)).rows;
const w = (k) => rows.find((r) => r.kind === k)?.warnings ?? null;
check('the platform sees every sent document', rows.length === 6, JSON.stringify(rows.map((r) => r.kind)));
check('a name that matches raises nothing (filler words and initials ignored)', w('dti_sec')?.length === 0, JSON.stringify(w('dti_sec')));
check('the permit warns: typed expiry differs, and not this year', w('permit')?.length === 2
  && w('permit').some((x) => /Typed expiry/.test(x)) && w('permit').some((x) => /not this year/.test(x)), JSON.stringify(w('permit')));
check('a document in the wrong slot is named', w('bir_2303')?.some((x) => /does not look like a BIR/.test(x)), JSON.stringify(w('bir_2303')));
check('an unreadable file says so, and nothing else', w('barangay')?.length === 1 && /could not read/.test(w('barangay')[0]), JSON.stringify(w('barangay')));
check('another name on the ID is flagged', w('owner_id')?.some((x) => /PEDRO REYES/.test(x)), JSON.stringify(w('owner_id')));
check('the front photo has no reading and no warnings', rows.find((r) => r.kind === 'front_photo')?.reading === null && w('front_photo')?.length === 0);

// The cap
await owner();
await db.exec(`insert into document_readings (path, application_id, kind, result)
  select '${APP}/filler-' || g || '.jpg', '${APP}', 'permit', '{}' from generate_series(1, 30) g`);
await as(ANA);
check('past 30 readings, a new one is refused', /^.*limit:/.test(await tryExec(claim('permit', `${APP}/permit-2.jpg`)) ?? ''));

// Erase (0225 deletes the documents): readings go too
await owner();
await db.exec(`delete from application_documents where application_id = '${APP}'`);
check('deleting the documents deletes every reading of that application',
  Number((await one(`select count(*) n from document_readings where application_id = '${APP}'`)).n) === 0);

await anon();
check('the probe marker answers a visitor', (await one(`select migration_0280_applied() ok`)).ok === true);
await owner();
check('0280 can run twice', (await tryExec(readFileSync(join(REPO, 'supabase', 'migrations', '0280_document_readings.sql'), 'utf-8'))) === null);

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
