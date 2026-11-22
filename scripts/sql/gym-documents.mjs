/**
 * 0262: the gym documents, edited in the platform's Settings. A draft is the platform's alone; publishing freezes
 * it and puts its date in effect through 0156; a published version can never change; the website reads only the
 * version in effect, and nobody else can read or write the table.
 *
 *   node <repo>/scripts/sql/gym-documents.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO);

const PA = 'a1000000-0000-4000-8000-000000000119';
const MEM = 'a1000000-0000-4000-8000-000000000114';
const GYM_A = 'c0f1e55e-0000-4000-8000-000000000001';

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const one = async (sql) => (await db.query(sql)).rows[0];
const tryExec = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return describe(e); } };
async function as(uid) { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`); }
async function asAnon() { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false); set role anon;`); }

await db.exec(`reset role;
  insert into auth.users (id, email, raw_user_meta_data) values ('${PA}', 'pa@docs-test.com', '{}'), ('${MEM}', 'mem@docs-test.com', '{}');
  insert into profiles (id, first_name, last_name, email, status, role, active_gym_id) values
    ('${PA}', 'P', 'A', 'pa@docs-test.com', 'active', 'member', '${GYM_A}'),
    ('${MEM}', 'M', 'E', 'mem@docs-test.com', 'active', 'member', '${GYM_A}') on conflict do nothing;
  insert into platform_admins (user_id) values ('${PA}') on conflict do nothing;
  insert into gym_roles (gym_id, user_id, role, status) values ('${GYM_A}', '${MEM}', 'member', 'active') on conflict do nothing;`);

const today = (await one(`select to_char((now() at time zone 'Asia/Manila')::date, 'YYYY-MM-DD') as d`)).d;
const tomorrow = (await one(`select to_char((now() at time zone 'Asia/Manila')::date + 1, 'YYYY-MM-DD') as d`)).d;
const doc = (t) => ({ short: t, title: t, lede: 'For {business}.', law: 'Philippine law', sections: [{ id: 'a', title: '1. One', body: ['{contact}'] }] });
const DOCS = JSON.stringify({ terms: doc('Terms'), dpa: doc('DPA'), privacy: doc('Privacy') }).replace(/'/g, "''");
const BAD = JSON.stringify({ terms: doc('Terms'), dpa: { title: 'DPA', sections: [] } }).replace(/'/g, "''");

// ---- nobody but the platform -------------------------------------------------------------------
await asAnon();
check('a stranger cannot save a draft', !!(await tryExec(`select save_gym_documents_draft('${today}', '${DOCS}'::jsonb)`)));
check('the website reads nothing before anything is published', (await one(`select public_gym_documents() as d`)).d === null);
await as(MEM);
check('a gym member cannot save a draft', !!(await tryExec(`select save_gym_documents_draft('${today}', '${DOCS}'::jsonb)`)));
check('a gym member cannot list versions', (await db.query(`select * from platform_gym_documents()`)).rows.length === 0);
const memRead = await tryExec(`select * from gym_document_versions`) ?? ((await db.query(`select * from gym_document_versions`)).rows.length === 0 ? 'no rows' : null);
check('the table itself is closed to a signed-in user', !!memRead);

// ---- the platform's draft ----------------------------------------------------------------------
await as(PA);
check('a draft missing a document is refused', !!(await tryExec(`select save_gym_documents_draft('${today}', '${BAD}'::jsonb)`)));
check('a version that is not a date is refused', !!(await tryExec(`select save_gym_documents_draft('latest', '${DOCS}'::jsonb)`)));
check('the platform saves a draft', (await tryExec(`select save_gym_documents_draft('${tomorrow}', '${DOCS}'::jsonb, 'first edit')`)) === null);
check('…and saving again keeps one draft, renamed', (await tryExec(`select save_gym_documents_draft('${today}', '${DOCS}'::jsonb)`)) === null
  && Number((await one(`select count(*) as n from platform_gym_documents() where status = 'draft'`)).n) === 1
  && (await one(`select version from platform_gym_documents() where status = 'draft'`)).version === today);
check('a draft is not on the website', (await one(`select public_gym_documents() as d`)).d === null);

// ---- publishing --------------------------------------------------------------------------------
check('publishing a date with no draft is refused', !!(await tryExec(`select publish_gym_documents('2020-01-01')`)));
check('the platform publishes the draft', (await tryExec(`select publish_gym_documents('${today}')`)) === null);
const pub = await one(`select public_gym_documents() as d`);
check('the website now reads that version', pub.d?.version === today && pub.d?.docs?.terms?.title === 'Terms', JSON.stringify(pub.d));
await db.exec('reset role;');  // platform_billing is read as its owner here; RLS keeps it from a signed-in user.
check('…and it is the version in effect (0156)', (await one(`select gym_terms_published as v from platform_billing where id`))?.v === today);
await as(PA);
check('…listed as in effect', (await one(`select in_effect from platform_gym_documents() where version = '${today}'`)).in_effect === true);
check('a new draft cannot take the published date', !!(await tryExec(`select save_gym_documents_draft('${today}', '${DOCS}'::jsonb)`)));

// ---- published words never change, even for the table owner -------------------------------------
await db.exec(`reset role;`);
check('the owner cannot edit a published version', !!(await tryExec(`update gym_document_versions set docs = '{}'::jsonb where version = '${today}'`)));
check('…nor delete it', !!(await tryExec(`delete from gym_document_versions where version = '${today}'`)));
await asAnon();
const anonPub = await one(`select public_gym_documents() as d`);
check('a stranger reads the published version (it is the public website)', anonPub.d?.version === today);
check('a stranger cannot call the platform list', !!(await tryExec(`select * from platform_gym_documents()`))
  || (await db.query(`select * from platform_gym_documents()`)).rows.length === 0);

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
